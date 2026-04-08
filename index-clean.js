const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');
const payCmd = require('./commands/pay.js');

const app = express();
app.use(express.json());

const TALLY_URL = 'http://localhost:9000';

let isReady = false;
let client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

function initializeClient() {
    client.initialize().catch(err => console.error('Init error:', err.message));
}

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => { isReady = true; console.log('✅ WHATSAPP READY'); });

client.on('message', async (msg) => {
    if (msg.body.startsWith('/pay') && payCmd.canAccess(msg.from)) {
        await payCmd.handlePay(msg.from, msg.body, client);
    }
});

function tallyPost(xml) {
    return axios.post(TALLY_URL, xml.trim(), { headers: { 'Content-Type': 'text/xml' } })
        .then(r => r.data.replace(/&#\d+;/g, ''));
}

function getTag(xml, tag) {
    const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));
    return m ? m[1].trim() : '';
}

function getAllBlocks(xml, tag) {
    const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
}

// FIXED: Simplified Company Fetching
async function getCompanyInfo() {
    const xml = `<ENVELOPE>
        <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
        <BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY>
    </ENVELOPE>`;
    try {
        const raw = await tallyPost(xml);
        // Tally returns the current company in the HEADER or specific tags
        let companyName = getTag(raw, 'SVCURRENTCOMPANY') || getTag(raw, 'COMPANYNAME') || 'My College';
        return { name: companyName };
    } catch (e) {
        return { name: 'College' };
    }
}

// FIXED: Correct Collection of Debtors using "Closing Balances" report logic
async function getSundryDebtorOutstanding() {
    const xml = `<ENVELOPE>
        <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
        <BODY><EXPORTDATA><REQUESTDESC>
            <REPORTNAME>List of Accounts</REPORTNAME>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>
            </STATICVARIABLES>
        </REQUESTDESC></EXPORTDATA></BODY>
    </ENVELOPE>`;

    try {
        const raw = await tallyPost(xml);
        const ledgers = getAllBlocks(raw, 'LEDGER');
        const debtors = [];

        for (const l of ledgers) {
            const parent = getTag(l, 'PARENT');
            if (parent.includes('Sundry Debtors')) {
                const name = getTag(l, 'NAME');
                const balance = Math.abs(parseFloat(getTag(l, 'CLOSINGBALANCE')) || 0);

                // DYNAMIC FETCH: Get mobile number directly from Tally XML tags
                let mobile = getTag(l, 'LEDGERMOBILE') ||
                    getTag(l, 'MOBILENUMBER') ||
                    getTag(l, 'PHONENUMBER') || "";

                // Clean and format the mobile number for WhatsApp
                mobile = mobile.replace(/\D/g, '');
                if (mobile.length === 10) mobile = '91' + mobile;

                if (balance > 0 && mobile.length >= 10) {
                    debtors.push({
                        party: name,
                        outstanding: balance,
                        mobile: mobile + '@c.us'
                    });
                }
            }
        }
        return debtors;
    } catch (e) {
        console.error('Debtor fetch error:', e.message);
        return [];
    }
}

async function getVoucherPdf(voucherNo, type) {
    const xml = `<ENVELOPE>
        <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
        <BODY><EXPORTDATA><REQUESTDESC>
            <REPORTNAME>Voucher Register</REPORTNAME>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>PDF</SVEXPORTFORMAT>
                <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
                <SVVOUCHERNUMBER>${voucherNo}</SVVOUCHERNUMBER>
            </STATICVARIABLES>
        </REQUESTDESC></EXPORTDATA></BODY>
    </ENVELOPE>`;
    try {
        const r = await axios.post(TALLY_URL, xml, { responseType: 'arraybuffer' });
        return r.data;
    } catch (e) {
        return null;
    }
}

app.post('/send-reminders', async (req, res) => {
    try {
        const company = await getCompanyInfo();
        const debtors = await getSundryDebtorOutstanding();
        let sentCount = 0;

        for (const debtor of debtors) {
            if (isReady) {
                const text = `*FEE REMINDER - ${company.name}*\n\nDear ${debtor.party},\n\nYour outstanding balance is: *Rs. ${debtor.outstanding.toLocaleString()}*.\n\nReply with /pay <amount> ${debtor.party} to update.`;
                await client.sendMessage(debtor.mobile, text);
                sentCount++;
            }
        }

        res.json({
            success: true,
            processed: sentCount,
            totalDebtorsFound: debtors.length,
            details: debtors.map(d => ({ name: d.party, mobile: d.mobile }))
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(3000, () => {
    console.log('✅ Tally WhatsApp Reminders Ready - port 3000');
    initializeClient();
});