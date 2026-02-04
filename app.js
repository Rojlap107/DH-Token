/**
 * Thermal Print Pro
 * Core Logic for Driverless ESC/POS Printing
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const btnConnectUsb = document.getElementById('btnConnectUsb');
    const btnConnectBluetooth = document.getElementById('btnConnectBluetooth');
    const btnPrint = document.getElementById('btnPrint');
    const btnTestPrint = document.getElementById('btnTestPrint');
    const textInput = document.getElementById('printText');
    const statusBadge = document.getElementById('status');
    const logsContainer = document.getElementById('logs');

    let device = null;
    let server = null; // for bluetooth
    let characteristic = null; // for bluetooth

    // Log Helper
    function addLog(message, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = new Date().toLocaleTimeString([], { hour12: false });
        entry.textContent = `[${time}] ${message}`;
        logsContainer.appendChild(entry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Update Connection UI
    function updateConnectionStatus(connected, deviceName = '') {
        if (connected) {
            statusBadge.textContent = `Connected: ${deviceName}`;
            statusBadge.classList.remove('disconnected');
            statusBadge.classList.add('connected');
            const btnGenerate = document.getElementById('btnGenerateToken');
            if (btnGenerate) btnGenerate.disabled = false;
            addLog(`Printer "${deviceName}" ready.`, 'success');
        } else {
            statusBadge.textContent = 'Disconnected';
            statusBadge.classList.remove('connected');
            statusBadge.classList.add('disconnected');
            const btnGenerate = document.getElementById('btnGenerateToken');
            if (btnGenerate) btnGenerate.disabled = true;
            device = null;
            addLog('Printer disconnected.', 'error');
        }
    }

    // --- WebUSB Magic ---
    btnConnectUsb.addEventListener('click', async () => {
        try {
            addLog('Requesting USB device...', 'info');
            device = await navigator.usb.requestDevice({ filters: [] });

            await device.open();
            if (device.configuration === null) {
                await device.selectConfiguration(1);
            }
            await device.claimInterface(0);

            updateConnectionStatus(true, device.productName || 'USB Printer');
        } catch (err) {
            addLog(`USB connection error: ${err.message}`, 'error');
        }
    });

    // --- WebBluetooth Magic ---
    btnConnectBluetooth.addEventListener('click', async () => {
        try {
            addLog('Searching for Bluetooth printers...', 'info');

            // Broaden filters: Many printers don't advertise their specific service UUIDs
            // We use acceptAllDevices: true but must specify optionalServices to access them
            const btDevice = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb', // Generic Label/Receipt
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC
                    'e7e11001-4954-4152-594f-4e4d45544943', // Star Micronics
                    '0000ff00-0000-1000-8000-00805f9b34fb', // Common 
                    '0000af30-0000-1000-8000-00805f9b34fb'  // Common 
                ]
            });

            addLog(`Connecting to ${btDevice.name || 'Device'}...`, 'info');
            server = await btDevice.gatt.connect();

            addLog('Scanning services...', 'info');
            const services = await server.getPrimaryServices();

            if (services.length === 0) {
                throw new Error('No Bluetooth services found on this device.');
            }

            // Look for a writable characteristic in any service
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
                if (characteristic) {
                    addLog(`Found printing service: ${service.uuid.substring(0, 8)}`, 'success');
                    break;
                }
            }

            if (!characteristic) {
                throw new Error('Could not find a writable print characteristic.');
            }

            updateConnectionStatus(true, btDevice.name || 'BT Printer');
        } catch (err) {
            addLog(`Bluetooth error: ${err.message}`, 'error');
            console.error(err);
        }
    });

    // --- Database (IndexedDB) Magic ---
    const DB_NAME = 'DelekMedicalDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'patients';
    let db = null;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
                refreshRecordsTable();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveRecord(record) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(record);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function getAllRecords() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function clearAllRecords() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function refreshRecordsTable() {
        const records = await getAllRecords();
        const tbody = document.getElementById('recordsBody');
        tbody.innerHTML = '';

        // Show last 50 records, newest first
        records.reverse().slice(0, 50).forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="token-cell">#${r.token}</td>
                <td>${r.name}</td>
                <td>${r.age} / ${r.gender}</td>
                <td>${r.nationality}</td>
                <td class="time-cell">${r.timestamp.split(', ')[1]}</td>
                <td class="action-cell">
                    <button class="btn-icon reprint" data-id="${r.id}" title="Reprint Token">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
                    </button>
                </td>
            `;
            // Attach reprint handler
            tr.querySelector('.reprint').addEventListener('click', () => reprintToken(r));
            tbody.appendChild(tr);
        });
    }

    async function reprintToken(record) {
        if (!device && !characteristic) {
            addLog('Cannot reprint: No printer connected.', 'error');
            return;
        }
        try {
            addLog(`Reprinting Token #${record.token} for ${record.name}...`, 'info');
            const encoder = new ReceiptPrinterEncoder();
            const result = encoder
                .initialize()
                .align('center')
                .bold(true)
                .width(2)
                .height(2)
                .text('བདེ་ལེགས་སྨན་ཁང་།')
                .newline()
                .width(1)
                .height(1)
                .text('Delek Hospital')
                .newline()
                .rule()
                .newline()
                .text('Token Number')
                .newline()
                .width(3)
                .height(3)
                .text(`${record.token}`)
                .newline()
                .width(1)
                .height(1)
                .rule()
                .newline()
                .align('left')
                .bold(true).text('Name:    ').bold(false).text(record.name).newline()
                .bold(true).text('Age/Gen: ').bold(false).text(`${record.age} / ${record.gender}`).newline()
                .newline()
                .align('center')
                .text(record.timestamp)
                .newline()
                .newline()
                .text('** REPRINT **')
                .newline()
                .newline()
                .cut()
                .encode();

            await sendData(result);
            addLog(`Token #${record.token} reprinted!`, 'success');
        } catch (err) {
            addLog(`Reprint error: ${err.message}`, 'error');
        }
    }

    initDB();

    // Token Counter
    let currentToken = parseInt(localStorage.getItem('delekTokenCounter') || '0');

    // --- Printing Logic ---
    async function sendData(data) {
        if (device) {
            const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(e => e.direction === 'out').endpointNumber;
            await device.transferOut(endpoint, data);
        } else if (characteristic) {
            const chunkSize = 20;
            for (let i = 0; i < data.byteLength; i += chunkSize) {
                await characteristic.writeValue(data.slice(i, i + chunkSize));
            }
        }
    }

    const btnGenerateToken = document.getElementById('btnGenerateToken');

    btnGenerateToken.addEventListener('click', async () => {
        const name = document.getElementById('patientName').value;
        const age = document.getElementById('patientAge').value;
        const gender = document.getElementById('patientGender').value;
        const nationality = document.getElementById('patientNationality').value;

        if (!name || !age || !gender || !nationality) {
            addLog('Please fill in all patient details.', 'error');
            return;
        }

        try {
            if (typeof ReceiptPrinterEncoder === 'undefined') {
                throw new Error('ReceiptPrinterEncoder library not loaded.');
            }

            // Increment and Save Token
            currentToken++;
            localStorage.setItem('delekTokenCounter', currentToken);

            // Save to DB
            const record = {
                timestamp: new Date().toLocaleString(),
                token: currentToken,
                name: name,
                age: age,
                gender: gender,
                nationality: nationality
            };
            await saveRecord(record);
            refreshRecordsTable();

            addLog(`Generating Token #${currentToken} for ${name}...`, 'info');

            const encoder = new ReceiptPrinterEncoder();
            const result = encoder
                .initialize()
                .align('center')
                .bold(true)
                .width(2)
                .height(2)
                .text('བདེ་ལེགས་སྨན་ཁང་།')
                .newline()
                .width(1)
                .height(1)
                .text('Delek Hospital')
                .newline()
                .rule()
                .newline()
                .text('Token Number')
                .newline()
                .width(3)
                .height(3)
                .text(`${currentToken}`)
                .newline()
                .width(1)
                .height(1)
                .rule()
                .newline()
                .align('left')
                .bold(true).text('Name:    ').bold(false).text(name).newline()
                .bold(true).text('Age/Gen: ').bold(false).text(`${age} / ${gender}`).newline()
                .newline()
                .align('center')
                .text(new Date().toLocaleString())
                .newline()
                .newline()
                .text('Please wait for your turn.')
                .newline()
                .newline()
                .cut()
                .encode();

            addLog('Sending to printer...', 'info');
            await sendData(result);
            addLog(`Token #${currentToken} printed successfully!`, 'success');

            // Clear form
            document.getElementById('tokenForm').reset();
        } catch (err) {
            addLog(`Print error: ${err.message}`, 'error');
        }
    });

    // CSV Download
    const btnDownloadCsv = document.getElementById('btnDownloadCsv');
    btnDownloadCsv.addEventListener('click', async () => {
        const records = await getAllRecords();
        if (records.length === 0) {
            addLog('No records found to download.', 'error');
            return;
        }

        // CSV Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Timestamp,Token Number,Patient Name,Age,Gender,Nationality\n";

        // CSV Rows
        records.forEach(r => {
            const row = [
                `"${r.timestamp}"`,
                r.token,
                `"${r.name}"`,
                r.age,
                `"${r.gender}"`,
                `"${r.nationality}"`
            ].join(",");
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Delek_Patient_Records_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog('Patient records exported successfully!', 'success');
    });

    // Management Actions
    document.getElementById('btnRefreshRecords').addEventListener('click', () => {
        refreshRecordsTable();
        addLog('Records table refreshed.', 'info');
    });

    document.getElementById('btnClearAllRecords').addEventListener('click', async () => {
        if (confirm('Are you sure you want to PERMANENTLY delete all medical records? This cannot be undone.')) {
            await clearAllRecords();
            refreshRecordsTable();
            addLog('All records have been cleared.', 'error');
        }
    });

    // Re-use test print for debug
    if (btnTestPrint) {
        btnTestPrint.addEventListener('click', async () => {
            try {
                const encoder = new ReceiptPrinterEncoder();
                let result = encoder.initialize().align('center').text('TEST PAGE').newline().cut().encode();
                await sendData(result);
                addLog('Test page sent!', 'success');
            } catch (err) {
                addLog(`Test print error: ${err.message}`, 'error');
            }
        });
    }
});

// Tool insertion logic
window.insertCommand = function (cmd) {
    const textarea = document.getElementById('printText');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // In a real implementation, we might use markup like [B]text[/B] 
    // and then parse it in app.js. For now, let's just add labels.
    let replacement = '';
    switch (cmd) {
        case 'bold': replacement = `[BOLD]${text.substring(start, end)}[/BOLD]`; break;
        case 'large': replacement = `[LARGE]${text.substring(start, end)}[/LARGE]`; break;
        case 'center': replacement = `[CENTER]${text.substring(start, end)}[/CENTER]`; break;
        case 'cut': replacement = `\n[CUT]\n`; break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
};
