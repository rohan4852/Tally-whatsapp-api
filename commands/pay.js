const { generateReceiptXML, tallyImport, parseImportResponse } = require('../utils/tally-import.js');

const AUTH_MOBILES = ['919876543210']; // TODO: Add your WhatsApp numbers (country code, e.g. '91xxxxxxxxxx')

async function handlePay(from, body, client) {
    // Parse /pay 5000 Rohan
    const match = body.match(/^\/pay\\s+([0-9.]+)\\s+(.+)/i);
    if (!match) {
        return client.sendMessage(from, 'Usage: /pay <amount> <party>\\nEx: /pay 5000 Rohan');
    }

    const amount = parseFloat(match[1]);
    const partyLedger = match[2].trim();

    if (amount <= 0 || !partyLedger) {
        return client.sendMessage(from, 'Invalid: Amount >0, party required.');
    }

    try {
        await client.sendMessage(from, `⏳ Processing Rs.${amount.toLocaleString()} for ${partyLedger}...`);

        const xml = generateReceiptXML(amount, partyLedger);
        const rawResponse = await tallyImport(xml);
        const result = parseImportResponse(rawResponse);

        if (result.success) {
            await client.sendMessage(from, `✅ Payment Recorded!\\nVoucher: ${result.voucherNo}\\nAmount: Rs.${amount.toLocaleString()}\\nParty: ${partyLedger}\\nCheck Tally Receipts.`);
        } else {
            await client.sendMessage(from, `❌ Failed: ${result.error}`);
            console.error('Pay failed:', result.error);
        }
    } catch (err) {
        await client.sendMessage(from, `Error: ${err.message}`);
        console.error('Pay error:', err);
    }
}

function canAccess(from) {
    const mobile = from.replace(/@c.us$/, '');
    return AUTH_MOBILES.includes(mobile);
}

module.exports = { handlePay, canAccess };

