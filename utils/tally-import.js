const axios = require('axios');
const TALLY_URL = 'http://localhost:9000';

// Generate XML for Receipt Voucher import
function generateReceiptXML(amount, partyLedger, narration = 'Payment received via WhatsApp') {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const voucherNumber = `WAPP-${Date.now()}`;

  return `<ENVELOPE>
<HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Import</TALLYREQUEST>
  <TYPE>Data</TYPE>
  <ID>udf</ID>
</HEADER>
<BODY>
  <DESC>
    <STATICVARIABLES>
      <IMPORTDATE>${today}</IMPORTDATE>
    </STATICVARIABLES>
  </DESC>
  <DATA>
    <TALLYMESSAGE>
      <VOUCHER VCHTYPE="Receipt" ACTION="Create">
        <DATE>${today}</DATE>
        <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
        <NARRATION>${narration}</NARRATION>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>Cash</LEDGERNAME>
          <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${partyLedger}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
      </VOUCHER>
    </TALLYMESSAGE>
  </DATA>
</BODY>
</ENVELOPE>`;
}

// POST Import XML to Tally (reuse logic)
function tallyImport(xml) {
  return axios({
    method: 'post',
    url: TALLY_URL,
    data: xml.trim(),
    headers: {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(xml.trim())
    },
    timeout: 30000,
    responseType: 'text'
  }).then(r => r.data.replace(/&#\\d+;/g, ''));
}

// Parse Tally Import response
function parseImportResponse(raw) {
  const created = raw.match(/VOUCHER.*CREATED/i);
  const error = raw.match(/ERROR|FAILED/i);
  const voucherNo = raw.match(/VOUCHERNUMBER[^<]*<[^<]*/i)?.[0] || 'Unknown';

  if (created) return { success: true, voucherNo: voucherNo.replace(/[^\w]/g, ''), raw };
  if (error) return { success: false, error: 'Tally rejected: ' + (raw.match(/LINEERROR|MSGSTR/i)?.[0] || 'Unknown'), raw };
  return { success: false, error: 'Invalid response', raw };
}

module.exports = { generateReceiptXML, tallyImport, parseImportResponse };
