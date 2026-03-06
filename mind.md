# Delek Hospital Patient Token System

## Overview

A web-based patient queue management system for Delek Hospital (བདེ་ལེགས་སྨན་ཁང་།) that enables staff to register patients, generate sequential token numbers, and print physical receipts on thermal printers.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML/CSS/JavaScript (ES6+) |
| Backend | Google Apps Script |
| Database | Google Sheets + IndexedDB (offline) |
| Printing | WebUSB & Web Bluetooth APIs |
| Encoder | receipt-printer-encoder (ESC/POS) |

## Architecture

```
┌─────────────────────────────────────────┐
│            User Interface               │
│         (index.html + styles.css)       │
└────────────────────┬────────────────────┘
                     │
         ┌───────────┴───────────┐
         │       app.js          │
         │   (Core Controller)   │
         └───────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    v                v                v
┌────────┐    ┌───────────┐    ┌──────────┐
│ Local  │    │  Google   │    │ Thermal  │
│IndexedDB│    │  Sheets   │    │ Printer  │
└────────┘    └───────────┘    └──────────┘
```

## Key Features

- **Authentication**: Login via credentials stored in Google Sheets
- **Patient Registration**: Name, phone, age, gender, nationality
- **Token Generation**: Sequential daily tokens, cloud-synced across devices
- **Dual Printing**: USB (WebUSB) and Bluetooth (Web Bluetooth) support
- **Offline-First**: Works without internet, syncs when available
- **Records Management**: Search, sort, and reprint past tokens

## Data Flow

1. Staff logs in (credentials verified against Google Sheets)
2. Patient form submitted → validated
3. Token fetched from cloud (or local fallback)
4. Record saved to IndexedDB AND Google Sheets
5. Receipt encoded to ESC/POS binary
6. Sent to printer via USB endpoint or BLE characteristic

## File Structure

```
/
├── index.html                    # UI markup
├── app.js                        # Application logic (847 lines)
├── styles.css                    # Styling (766 lines)
├── google-apps-script.js         # Cloud backend
├── receipt-printer-encoder.umd.js # Printer library
├── fonts/
│   └── Monlam Uni OuChan2.ttf    # Tibetan font
└── assets/
    └── background.jpg            # Hospital branding
```

## Google Sheets Structure

**Records Sheet:**
| Timestamp | Token | Name | Phone | Age | Gender | Nationality | RegisteredBy |

**Users Sheet:**
| Username | Password | Name |

## Printer Communication

### USB (WebUSB)
- Direct endpoint writing
- Best for wired setups

### Bluetooth
- 20-byte chunks with 10ms delay (Android compatibility)
- Uses `writeValueWithoutResponse` when available
- Supports Star Micronics, ISSC, and generic printers

## Receipt Format

```
      Delek Hospital
      (bold, 2x size)
─────────────────────────
     TOKEN: 001
     (bold, 3x size)
─────────────────────────
Name: Patient Name
Age/Gender: 25/Male
Time: 10:30 AM
Please wait for your turn
─────────────────────────
        [auto-cut]
```

## Design Patterns

- **Offline-First**: Local storage primary, cloud sync secondary
- **Driverless Printing**: Web APIs instead of native drivers
- **Daily Token Reset**: Counter resets each day automatically
- **Event-Driven**: Form → validate → save → print workflow
- **Fluent API**: Chainable encoder methods for receipt building

## Configuration

Required in `app.js`:
```javascript
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/...';
const GOOGLE_SHEET_VIEW_URL = 'https://docs.google.com/spreadsheets/d/...';
```

## Browser Requirements

- Chrome, Edge, or Opera (WebUSB support)
- Web Bluetooth API support
- ES6+ JavaScript
- IndexedDB & localStorage

## Session Management

- 24-hour localStorage session tokens
- Auto-logout on session expiry
- User profile display in menu
