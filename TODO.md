✅ Git clean

## Receipt Vouchers Implementation (Approved - In Progress)

**Changes made to index.js:**
- `getReceiptVouchers()` (renamed from getSalesInvoices)
- `<VOUCHERTYPENAME>Receipt Vouchers</VOUCHERTYPENAME>`
- Filter `'receipt'` 
- `/receipts` endpoint
- Messages "No receipt vouchers", "Receipt VCH"

**Test:**
1. Close terminals Ctrl+C
2. `node index.js`
3. `curl localhost:3000/receipts` - should fetch Receipt Vouchers + mobiles
4. `/run-text` sends receipt reminders

**Next:** Confirm test results before PDF/receipt voucher details.
