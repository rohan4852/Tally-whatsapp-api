# Receipt Vouchers Implementation Plan ✅ Confirmed

## Information Gathered
- Current: `getSalesInvoices()` uses `<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>`, filter `'sales'`
- Target: `getReceiptVouchers()` → `'Receipt Vouchers'`, filter `'receipt'`
- Ledger mobiles work for students ✓
- Git clean, main up-to-date ✓

## Plan (index.js only)
1. Rename `getSalesInvoices()` → `getReceiptVouchers()`
2. Replace Sales → "Receipt Vouchers" in XML
3. Filter `'receipt'` instead of `'sales'`
4. Update messages/curls: "receipts" endpoint, "No receipt vouchers", "Receipt recorded"
5. `/receipts` endpoint (new), `/run-text` calls `getReceiptVouchers()`
6. Update getVoucherDetails/getInvoicePdf default "Receipt Vouchers"

## Dependent Files: index.js

## Followup Steps
- Test `curl localhost:3000/receipts`
- Test `/run-text` sends receipts
- `node index.js` for WhatsApp

Approve to proceed?

