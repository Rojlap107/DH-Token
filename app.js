/**
 * Thermal Print Pro
 * Core Logic for Driverless ESC/POS Printing
 */

/**
 * GOOGLE SHEETS INTEGRATION
 * -------------------------
 * To enable cloud backup to Google Sheets:
 * 1. Open the file 'google-apps-script.js' in this folder
 * 2. Follow the setup instructions in that file
 * 3. After deploying, paste your Web App URL below (replace null)
 * 
 * Example: const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
 */
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzX8vlbiAtBqkUUdRBInFl9SfGwECY-94a5WzpoNjbl3iHBOdz0Km_Q6GLUFGyq_40-7Q/exec'; // <-- PASTE YOUR GOOGLE APPS SCRIPT URL HERE

// Direct link to open the Google Sheet (for viewing all records)
// Replace with your actual Google Sheet URL
const GOOGLE_SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/1MrhW2IPekAArcj2ZA617tRTQAFtEm5-VNdaWX85ndTw/edit?usp=sharing';

// ==================== AUTHENTICATION ====================
const AUTH_SESSION_KEY = 'delekHospitalAuth';

function checkAuth() {
    const session = localStorage.getItem(AUTH_SESSION_KEY);
    if (session) {
        try {
            const data = JSON.parse(session);
            // Session valid for 24 hours
            if (data.timestamp && Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                return data;
            }
        } catch (e) {
            // Invalid session data
        }
        localStorage.removeItem(AUTH_SESSION_KEY);
    }
    return null;
}

function showApp() {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.querySelector('.container').style.display = 'block';

    // Show logged-in user name
    const session = checkAuth();
    if (session && session.name) {
        document.getElementById('loggedInUser').textContent = session.name;
    }
}

function showLogin() {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.querySelector('.container').style.display = 'none';
}

async function verifyCredentials(username, password) {
    if (!GOOGLE_SHEETS_URL) {
        throw new Error('Google Sheets URL not configured');
    }

    const url = `${GOOGLE_SHEETS_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data;
}

function logout() {
    localStorage.removeItem(AUTH_SESSION_KEY);
    showLogin();
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const btnLogout = document.getElementById('btnLogout');

    // Check if already logged in
    const session = checkAuth();
    if (session) {
        showApp();
    } else {
        showLogin();
    }

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btnLogin = document.getElementById('btnLogin');

        loginError.textContent = '';
        btnLogin.disabled = true;
        btnLogin.textContent = 'Logging in...';

        try {
            const result = await verifyCredentials(username, password);

            if (result.success) {
                // Save session
                localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
                    username: username,
                    name: result.name || username,
                    timestamp: Date.now()
                }));
                showApp();
                loginForm.reset();
            } else {
                loginError.textContent = result.message || 'Invalid username or password';
            }
        } catch (err) {
            loginError.textContent = 'Login failed. Please try again.';
            console.error('Login error:', err);
        } finally {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Login';
        }
    });

    // Logout button
    btnLogout.addEventListener('click', () => {
        document.getElementById('userMenu').classList.add('hidden');
        logout();
    });

    // Menu toggle
    const btnMenuToggle = document.getElementById('btnMenuToggle');
    const userMenu = document.getElementById('userMenu');

    btnMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('hidden');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenu.contains(e.target) && e.target !== btnMenuToggle) {
            userMenu.classList.add('hidden');
        }
    });
});

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
    let isPrinting = false; // prevent concurrent print operations

    // Log Helper
    function addLog(message, type = 'system') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = new Date().toLocaleTimeString([], { hour12: false });
        entry.textContent = `[${time}] ${message}`;
        logsContainer.appendChild(entry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // Render Tibetan text as image for reliable printing
    function createTibetanImage(text, fontSize = 32) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set font and measure text
        ctx.font = `bold ${fontSize}px "Monlam OuChan", "Noto Sans Tibetan", sans-serif`;
        const metrics = ctx.measureText(text);

        // Size canvas to fit text (thermal printers typically 384px wide for 58mm paper)
        const padding = 10;
        canvas.width = Math.min(384, metrics.width + padding * 2);
        canvas.height = fontSize + padding * 2;

        // Fill white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw text in black
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${fontSize}px "Monlam OuChan", "Noto Sans Tibetan", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        return canvas;
    }

    // Update Connection UI
    function updateConnectionStatus(connected, deviceName = '') {
        const btnSaveAndPrint = document.getElementById('btnSaveAndPrint');
        if (connected) {
            statusBadge.textContent = `Connected: ${deviceName}`;
            statusBadge.classList.remove('disconnected');
            statusBadge.classList.add('connected');
            if (btnSaveAndPrint) btnSaveAndPrint.disabled = false;
            addLog(`Printer "${deviceName}" ready.`, 'success');
        } else {
            statusBadge.textContent = 'Disconnected';
            statusBadge.classList.remove('connected');
            statusBadge.classList.add('disconnected');
            if (btnSaveAndPrint) btnSaveAndPrint.disabled = true;
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

    // Store records for search and sorting
    let allRecords = [];
    let currentSort = { field: null, dir: 'desc' };

    async function refreshRecordsTable(searchTerm = '') {
        const tbody = document.getElementById('recordsBody');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

        // Fetch records if not searching
        if (!searchTerm) {
            if (GOOGLE_SHEETS_URL) {
                try {
                    const response = await fetch(GOOGLE_SHEETS_URL);
                    const data = await response.json();
                    if (data.success && data.records) {
                        allRecords = data.records;
                        addLog('Records loaded from cloud.', 'success');
                    }
                } catch (err) {
                    addLog('Cloud fetch failed, using local data.', 'error');
                    allRecords = await getAllRecords();
                }
            } else {
                allRecords = await getAllRecords();
            }
        }

        // Filter records if search term provided
        let filteredRecords = allRecords;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredRecords = allRecords.filter(r =>
                String(r.token).includes(term) ||
                (r.name && r.name.toLowerCase().includes(term)) ||
                (r.phone && r.phone.toLowerCase().includes(term))
            );
        }

        tbody.innerHTML = '';

        // Show last 50 records, newest first
        // Sort records
        let sortedRecords = filteredRecords.slice();
        if (currentSort.field) {
            sortedRecords.sort((a, b) => {
                let valA = a[currentSort.field];
                let valB = b[currentSort.field];

                // Handle numeric fields
                if (currentSort.field === 'token' || currentSort.field === 'age') {
                    valA = parseInt(valA) || 0;
                    valB = parseInt(valB) || 0;
                } else {
                    valA = String(valA || '').toLowerCase();
                    valB = String(valB || '').toLowerCase();
                }

                if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
                if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default: newest first
            sortedRecords.reverse();
        }

        sortedRecords.slice(0, 50).forEach(r => {
            const tr = document.createElement('tr');
            const timeStr = typeof r.timestamp === 'string' && r.timestamp.includes(', ')
                ? r.timestamp.split(', ')[1]
                : r.timestamp;
            tr.innerHTML = `
                <td class="time-cell">${timeStr}</td>
                <td class="token-cell">#${r.token}</td>
                <td>${r.name}</td>
                <td>${r.age} / ${r.gender}</td>
                <td class="by-cell">${r.registeredBy || '-'}</td>
                <td class="action-cell">
                    <button class="btn-icon reprint" data-id="${r.token}" title="Print">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
                    </button>
                </td>
            `;
            tr.querySelector('.reprint').addEventListener('click', () => reprintToken(r));
            tbody.appendChild(tr);
        });

        if (filteredRecords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #888;">${searchTerm ? 'No matching records.' : 'No records yet.'}</td></tr>`;
        }
    }

    async function reprintToken(record) {
        if (!device && !characteristic) {
            addLog('Cannot reprint: No printer connected.', 'error');
            return;
        }
        if (isPrinting) {
            addLog('Please wait, printer is busy...', 'warning');
            return;
        }
        try {
            isPrinting = true;
            addLog(`Reprinting Token #${record.token} for ${record.name}...`, 'info');

            // Create Tibetan header as image for reliable printing
            const tibetanHeader = createTibetanImage('བདེ་ལེགས་སྨན་ཁང་།', 36);

            const encoder = new ReceiptPrinterEncoder();
            const result = encoder
                .initialize()
                .align('center')
                .image(tibetanHeader, 384, 56, 'atkinson')
                .newline()
                .bold(true)
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
        } finally {
            isPrinting = false;
        }
    }

    initDB();

    // Token Counter (resets daily)
    function getTodayDateString() {
        return new Date().toISOString().split('T')[0]; // Returns "YYYY-MM-DD"
    }

    function loadTokenCounter() {
        const stored = localStorage.getItem('delekTokenData');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.date === getTodayDateString()) {
                    return data.token;
                }
            } catch (e) {
                // Invalid data, reset
            }
        }
        return 0; // New day or no data, start from 0
    }

    function saveTokenCounter(token) {
        localStorage.setItem('delekTokenData', JSON.stringify({
            date: getTodayDateString(),
            token: token
        }));
    }

    let currentToken = loadTokenCounter();

    // --- Printing Logic ---
    // Small delay helper for Bluetooth timing
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function sendData(data) {
        if (device) {
            // USB - send all at once
            const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(e => e.direction === 'out').endpointNumber;
            await device.transferOut(endpoint, data);
        } else if (characteristic) {
            // Bluetooth - send in chunks with small delays to prevent buffer overflow
            const chunkSize = 100; // Larger chunks for efficiency
            for (let i = 0; i < data.byteLength; i += chunkSize) {
                const chunk = data.slice(i, Math.min(i + chunkSize, data.byteLength));
                await characteristic.writeValue(chunk);
                // Small delay between chunks to let printer process
                if (i + chunkSize < data.byteLength) {
                    await delay(10);
                }
            }
        }
    }

    // --- Save Token (without printing) ---
    async function saveTokenRecord() {
        const name = document.getElementById('patientName').value.trim();
        const phone = document.getElementById('patientPhone').value.trim();
        const age = document.getElementById('patientAge').value;
        const gender = document.getElementById('patientGender').value;
        const nationality = document.getElementById('patientNationality').value;

        if (!name || !age || !gender || !nationality) {
            addLog('Please fill in all required fields.', 'error');
            return null;
        }

        // Increment and Save Token (resets daily)
        currentToken++;
        saveTokenCounter(currentToken);

        // Get logged-in user
        const session = checkAuth();
        const registeredBy = session ? session.name : 'Unknown';

        // Save to Local DB
        const record = {
            timestamp: new Date().toLocaleString(),
            token: currentToken,
            name: name,
            phone: phone || '-',
            age: age,
            gender: gender,
            nationality: nationality,
            registeredBy: registeredBy
        };
        await saveRecord(record);
        refreshRecordsTable();

        // Save to Google Sheets (cloud backup)
        if (GOOGLE_SHEETS_URL) {
            try {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(record)
                });
                addLog('Record synced to cloud.', 'success');
            } catch (cloudErr) {
                addLog('Cloud sync failed (offline?).', 'error');
            }
        }

        addLog(`Token #${currentToken} saved for ${name}.`, 'success');

        // Clear form
        document.getElementById('tokenForm').reset();

        return record;
    }

    // --- Print Token ---
    async function printToken(record) {
        if (!device && !characteristic) {
            addLog('Cannot print: No printer connected.', 'error');
            return false;
        }
        if (isPrinting) {
            addLog('Please wait, printer is busy...', 'warning');
            return false;
        }

        try {
            isPrinting = true;
            if (typeof ReceiptPrinterEncoder === 'undefined') {
                throw new Error('ReceiptPrinterEncoder library not loaded.');
            }

            addLog(`Printing Token #${record.token}...`, 'info');

            // Create Tibetan header as image for reliable printing
            const tibetanHeader = createTibetanImage('བདེ་ལེགས་སྨན་ཁང་།', 36);

            const encoder = new ReceiptPrinterEncoder();
            const result = encoder
                .initialize()
                .align('center')
                .image(tibetanHeader, 384, 56, 'atkinson')
                .newline()
                .bold(true)
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
                .text('Please wait for your turn.')
                .newline()
                .newline()
                .cut()
                .encode();

            await sendData(result);
            addLog(`Token #${record.token} printed!`, 'success');
            return true;
        } catch (err) {
            addLog(`Print error: ${err.message}`, 'error');
            return false;
        } finally {
            isPrinting = false;
        }
    }

    // --- Button: Save Only ---
    const btnSaveToken = document.getElementById('btnSaveToken');
    btnSaveToken.addEventListener('click', async () => {
        btnSaveToken.classList.add('loading');
        btnSaveToken.textContent = 'Saving...';
        try {
            await saveTokenRecord();
        } finally {
            btnSaveToken.classList.remove('loading');
            btnSaveToken.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
        }
    });

    // --- Button: Save & Print ---
    const btnSaveAndPrint = document.getElementById('btnSaveAndPrint');
    btnSaveAndPrint.addEventListener('click', async () => {
        btnSaveAndPrint.classList.add('loading');
        btnSaveAndPrint.textContent = 'Processing...';
        try {
            const record = await saveTokenRecord();
            if (record) {
                await printToken(record);
            }
        } finally {
            btnSaveAndPrint.classList.remove('loading');
            btnSaveAndPrint.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg> Save & Print`;
        }
    });

    // Records Button: Open Google Sheet directly
    const btnDownloadCsv = document.getElementById('btnDownloadCsv');
    btnDownloadCsv.addEventListener('click', async () => {
        if (GOOGLE_SHEET_VIEW_URL) {
            window.open(GOOGLE_SHEET_VIEW_URL, '_blank');
            addLog('Opening Google Sheet...', 'info');
        } else {
            // Fallback: Download local CSV if no sheet URL configured
            const records = await getAllRecords();
            if (records.length === 0) {
                addLog('No records found. Configure GOOGLE_SHEET_VIEW_URL in app.js.', 'error');
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Timestamp,Token Number,Patient Name,Age,Gender,Nationality\n";

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
        }
    });

    // Management Actions
    // Search records
    document.getElementById('searchRecords').addEventListener('input', (e) => {
        refreshRecordsTable(e.target.value);
    });

    document.getElementById('btnRefreshRecords').addEventListener('click', () => {
        document.getElementById('searchRecords').value = '';
        currentSort = { field: null, dir: 'desc' };
        updateSortIndicators();
        refreshRecordsTable();
        addLog('Records refreshed.', 'info');
    });

    // Sortable headers
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (currentSort.field === field) {
                currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.dir = 'asc';
            }
            updateSortIndicators();
            refreshRecordsTable(document.getElementById('searchRecords').value);
        });
    });

    function updateSortIndicators() {
        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === currentSort.field) {
                th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

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
