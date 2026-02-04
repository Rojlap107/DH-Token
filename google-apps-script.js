/**
 * Delek Hospital Token System - Google Apps Script
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://sheets.google.com and create a new spreadsheet
 * 2. Name it "Delek Hospital Patient Records"
 * 3. In Row 1, add these headers: Timestamp | Token | Name | Age | Gender | Nationality
 * 4. Go to Extensions > Apps Script
 * 5. Delete any code there and paste this entire script
 * 6. Click "Deploy" > "New deployment"
 * 7. Select type: "Web app"
 * 8. Set "Execute as": Me
 * 9. Set "Who has access": Anyone
 * 10. Click "Deploy" and copy the Web App URL
 * 11. Paste the URL into app.js where indicated
 */

// Handle POST requests (for adding new records)
function doPost(e) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        const data = JSON.parse(e.postData.contents);

        // Append the row
        sheet.appendRow([
            data.timestamp,
            data.token,
            data.name,
            data.age,
            data.gender,
            data.nationality
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

// Handle GET requests (for fetching records)
function doGet(e) {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        const data = sheet.getDataRange().getValues();

        // Skip header row, convert to objects
        const records = [];
        for (let i = 1; i < data.length; i++) {
            records.push({
                timestamp: data[i][0],
                token: data[i][1],
                name: data[i][2],
                age: data[i][3],
                gender: data[i][4],
                nationality: data[i][5]
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
