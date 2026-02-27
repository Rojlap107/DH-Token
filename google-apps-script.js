/**
 * Delek Hospital Token System - Google Apps Script
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://sheets.google.com and create a new spreadsheet
 * 2. Name it "Delek Hospital Patient Records"
 * 3. Create TWO sheets (tabs at bottom):
 *
 *    Sheet 1: "Records" (for patient data)
 *    - Row 1 headers: Timestamp | Token | Name | Phone | Age | Gender | Nationality | RegisteredBy
 *
 *    Sheet 2: "Users" (for login credentials)
 *    - Row 1 headers: Username | Password | Name
 *    - Row 2 onwards: Add your users (e.g., "admin" | "yourpassword" | "Administrator")
 *
 * 4. Go to Extensions > Apps Script
 * 5. Delete any code there and paste this entire script
 * 6. Click "Deploy" > "New deployment"
 * 7. Select type: "Web app"
 * 8. Set "Execute as": Me
 * 9. Set "Who has access": Anyone
 * 10. Click "Deploy" and copy the Web App URL
 * 11. Paste the URL into app.js where indicated
 *
 * IMPORTANT: After adding/changing users, you do NOT need to redeploy.
 * The script reads directly from the "Users" sheet.
 */

// Handle POST requests (for adding new records)
function doPost(e) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Records') || ss.getActiveSheet();
        const data = JSON.parse(e.postData.contents);

        // Append the row
        sheet.appendRow([
            data.timestamp,
            data.token,
            data.name,
            data.phone || '-',
            data.age,
            data.gender,
            data.nationality,
            data.registeredBy || '-'
        ]);

        return ContentService
            .createTextOutput(JSON.stringify({ success: true, message: 'Record saved!' }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// Handle GET requests (for fetching records OR login OR token)
function doGet(e) {
    try {
        const action = e.parameter.action;

        // Handle login request
        if (action === 'login') {
            return handleLogin(e);
        }

        // Handle next token request
        if (action === 'getNextToken') {
            return handleGetNextToken();
        }

        // Default: return patient records
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Records') || ss.getActiveSheet();
        const data = sheet.getDataRange().getValues();

        // Skip header row, convert to objects
        const records = [];
        for (let i = 1; i < data.length; i++) {
            records.push({
                timestamp: data[i][0],
                token: data[i][1],
                name: data[i][2],
                phone: data[i][3] || '-',
                age: data[i][4],
                gender: data[i][5],
                nationality: data[i][6],
                registeredBy: data[i][7] || '-'
            });
        }

        return ContentService
            .createTextOutput(JSON.stringify({ success: true, records: records }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// Handle getting the next token number (resets daily)
function handleGetNextToken() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName('Records') || ss.getActiveSheet();
        const data = sheet.getDataRange().getValues();

        // Get today's date string (YYYY-MM-DD)
        const today = new Date();
        const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

        // Count tokens from today
        let maxTokenToday = 0;
        for (let i = 1; i < data.length; i++) {
            const timestamp = data[i][0];
            const token = parseInt(data[i][1]) || 0;

            // Check if this record is from today
            let recordDate;
            if (timestamp instanceof Date) {
                recordDate = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            } else if (typeof timestamp === 'string') {
                // Handle ISO string or other formats
                const parsed = new Date(timestamp);
                if (!isNaN(parsed)) {
                    recordDate = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
                }
            }

            if (recordDate === todayStr && token > maxTokenToday) {
                maxTokenToday = token;
            }
        }

        const nextToken = maxTokenToday + 1;

        return ContentService
            .createTextOutput(JSON.stringify({ success: true, nextToken: nextToken, date: todayStr }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// Handle login verification
function handleLogin(e) {
    try {
        const username = e.parameter.username;
        const password = e.parameter.password;

        if (!username || !password) {
            return ContentService
                .createTextOutput(JSON.stringify({ success: false, message: 'Username and password required' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const usersSheet = ss.getSheetByName('Users');

        if (!usersSheet) {
            return ContentService
                .createTextOutput(JSON.stringify({ success: false, message: 'Users sheet not found. Please create a "Users" sheet.' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const users = usersSheet.getDataRange().getValues();

        // Skip header row, find matching user
        for (let i = 1; i < users.length; i++) {
            const storedUsername = String(users[i][0]).trim();
            const storedPassword = String(users[i][1]).trim();
            const displayName = users[i][2] || storedUsername;

            if (storedUsername === username && storedPassword === password) {
                return ContentService
                    .createTextOutput(JSON.stringify({ success: true, name: displayName }))
                    .setMimeType(ContentService.MimeType.JSON);
            }
        }

        return ContentService
            .createTextOutput(JSON.stringify({ success: false, message: 'Invalid username or password' }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, message: 'Login error: ' + error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
