const { MessageMedia } = require('whatsapp-web.js');
const { generateReceiptXML, tallyImport, parseImportResponse } = require('../utils/tally-import.js');
const axios = require('axios');

const AUTH_MOBILES = []; // Allow all for reminders flow
const TALLY_URL = 'http://localhost:9000';

async function handlePay(from, body, client) {
    const match = body.match(/^\/pay\s+([0-9.]+)\s+(.+)/i);
    if (!match) return;

    const amount = parseFloat(match[1]);
    const party = match[2].trim();

    try {
        const { xml, vNo } = generateReceiptXML(amount, party);
        const raw = await tallyImport(xml);
        const result = parseImportResponse(raw, vNo);

        if (result.success) {
            // Fetch PDF for the newly created Receipt
            const pdfXml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>PDF</SVEXPORTFORMAT><VOUCHERTYPENAME>Receipt Voucher</VOUCHERTYPENAME><SVVOUCHERNUMBER>${vNo}</SVVOUCHERNUMBER></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
            const pdfRes = await axios.post(TALLY_URL, pdfXml, { responseType: 'arraybuffer' });

            const media = new MessageMedia('application/pdf', Buffer.from(pdfRes.data).toString('base64'), `Receipt_${vNo}.pdf`);
            await client.sendMessage(from, media, { caption: `✅ Receipt Generated for Rs. ${amount}` });
        }
    } catch (e) {
        client.sendMessage(from, `❌ Error: ${e.message}`);
    }
}

function canAccess(from) {
    return AUTH_MOBILES.includes(from.replace(/@c.us$/, ''));
}

module.exports = { handlePay, canAccess };