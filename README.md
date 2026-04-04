# Tally-WhatsApp API

## Run
```
npm install
npm start  # or node index.js
```

**Chrome:** Install Google Chrome or use Edge (puppeteer-core edge)
```
npx puppeteer browsers install edge
```
Set env: PUPPETEER_EXECUTABLE_PATH="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"

**Tally:** Run Tally on port 9000 XML server.

## Endpoints
- /receipts - List Receipt Vouchers (student payments)
- /run-text - Send text reminders via WhatsApp
- /run - Send PDF receipts via WhatsApp
- /ping-tally - Test Tally connection

**QR Scan:** Browser opens, scan WhatsApp QR.

Fixed Puppeteer protocol errors, Receipt Vouchers live.
