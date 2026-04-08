const axios = require('axios');
const TALLY_URL = 'http://localhost:9000';

function generateReceiptXML(amount, partyLedger) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const vNo = `WAPP${Date.now().toString().slice(-6)}`;

  const xml = `<ENVELOPE>
        <HEADER><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE></HEADER>
        <BODY><DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
            <VOUCHER VCHTYPE="Receipt Voucher" ACTION="Create">
                <DATE>${today}</DATE>
                <VOUCHERTYPENAME>Receipt Voucher</VOUCHERTYPENAME>
                <VOUCHERNUMBER>${vNo}</VOUCHERNUMBER>
                <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                    <LEDGERNAME>Cash</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                    <AMOUNT>-${amount}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                    <LEDGERNAME>${partyLedger}</LEDGERNAME>
                    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                    <AMOUNT>${amount}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
            </VOUCHER>
        </TALLYMESSAGE></DATA></BODY>
    </ENVELOPE>`;
  return { xml, vNo }; // Return both
}

async function tallyImport(xml) {
  const r = await axios.post(TALLY_URL, xml, { headers: { 'Content-Type': 'text/xml' } });
  return r.data;
}

function parseImportResponse(raw, vNo) {
  if (raw.includes('<CREATED>1</CREATED>')) return { success: true, voucherNo: vNo };
  return { success: false, error: 'Tally Import Failed' };
}

module.exports = { generateReceiptXML, tallyImport, parseImportResponse };