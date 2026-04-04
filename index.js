const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');
const payCmd = require('./commands/pay.js');

const app = express();

app.use(express.json());

const TALLY_URL = 'http://localhost:9000';

let isReady = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        protocolTimeout: 60000,
        timeout: 60000,
        ignoreHTTPSErrors: true,
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-images',
            '--user-data-dir=./whatsapp-session'
        ]
    }
});

client.on('qr', qr => { console.log('SCAN QR:'); qrcode.generate(qr, { small: true }); });
client.on('ready', () => { isReady = true; console.log('WHATSAPP READY'); });
client.on('disconnected', () => { isReady = false; });

// Handle incoming WhatsApp messages for Tally push
client.on('message', (msg) => {
    const body = msg.body || '';
    if (body.startsWith('/pay')) {
        if (payCmd.canAccess(msg.from)) {
            payCmd.handlePay(msg.from, body, client);
        } else {
            client.sendMessage(msg.from, '❌ Unauthorized. Contact admin.');
        }
    } else if (body === '/help') {
        client.sendMessage(msg.from, 'Commands:\n/pay <amount> <party> - Record payment in Tally\nEx: /pay 5000 Rohan\n/help - this');
    }
});

function waitReady(ms) {

    ms = ms || 120000;
    return new Promise(function (resolve, reject) {
        if (isReady) return resolve();
        var t = setInterval(function () { if (isReady) { clearInterval(t); resolve(); } }, 500);
        setTimeout(function () { clearInterval(t); reject(new Error('WhatsApp not ready')); }, ms);
    });
}

function tallyPost(xml) {
    return axios({
        method: 'post',
        url: TALLY_URL,
        data: xml.trim(),
        headers: {
            'Content-Type': 'text/xml',
            'Content-Length': Buffer.byteLength(xml.trim())
        },
        timeout: 30000,
        responseType: 'text',
        transformResponse: [function (d) { return d; }],
        maxRedirects: 0
    }).then(function (r) {
        return r.data.replace(/&#\d+;/g, '');
    });
}

function getTag(xml, tag) {
    var m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));
    return m ? m[1].trim() : '';
}

function getAllBlocks(xml, tag) {
    var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi');
    var out = [], m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
}

function parseAmt(s) {
    try { return Math.abs(parseFloat(s.replace(/[^\d.-]/g, '')) || 0); } catch (e) { return 0; }
}

function getCompanyInfo() {
    var xmlVoucher = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';

    function findCompanyName(raw) {
        var companyName = getTag(raw, 'SVCURRENTCOMPANY')
            || getTag(raw, 'COMPANYNAME')
            || getTag(raw, 'CURRENTCOMPANY')
            || getTag(raw, 'NAME');

        if (!companyName) {
            var cblock = raw.match(/<COMPANY[^>]*>([\\s\\S]*?)<\/COMPANY>/i);
            if (cblock) companyName = getTag(cblock[1], 'NAME');
        }

        if (!companyName) {
            companyName = (raw.match(/<SVCURRENTCOMPANY>([\\s\\S]*?)<\/SVCURRENTCOMPANY>/i) || [null, ''])[1]
                || (raw.match(/<COMPANYNAME>([\\s\\S]*?)<\/COMPANYNAME>/i) || [null, ''])[1]
                || (raw.match(/<CURRENTCOMPANY>([\\s\\S]*?)<\/CURRENTCOMPANY>/i) || [null, ''])[1]
                || '';
        }

        return (companyName || '').trim();
    }

    function parseCompany(raw) {
        var companyName = findCompanyName(raw);

        var b = (raw.match(/<COMPANY[^>]*>([\\s\\S]*?)<\/COMPANY>/i) || [null, raw])[1];

        return {
            name: companyName,
            address: getTag(b, 'ADDRESS'),
            city: getTag(b, 'PINCODECITY') || getTag(b, 'CITY'),
            state: getTag(b, 'STATENAME'),
            phone: getTag(b, 'PHONENUMBER') || getTag(b, 'PHONE'),
            email: getTag(b, 'EMAIL'),
            gstin: getTag(b, 'GSTIN') || getTag(b, 'GSTREGISTRATIONNUMBER'),
            pan: getTag(b, 'INCOMETAXNUMBER'),
            fssai: getTag(b, 'FSSAINUMBER'),
            bankName: getTag(b, 'BANKNAME'),
            bankBranch: getTag(b, 'BANKBRANCH'),
            bankAccount: getTag(b, 'BANKACCOUNTNUMBER') || getTag(b, 'ACCOUNTNUMBER'),
            bankIfsc: getTag(b, 'IFSCCODE') || getTag(b, 'IFSC')
        };
    }

    return tallyPost(xmlVoucher).then(function (raw) {
        var company = parseCompany(raw);
        if (company.name) return company;

        var xmlAll = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
        return tallyPost(xmlAll).then(function (rawAll) {
            var allCompany = parseCompany(rawAll);
            return { ...company, name: allCompany.name || company.name };
        }).catch(function () {
            return company;
        });
    }).catch(function (e) {
        console.error('Company err:', e.message);
        return { name: '' };
    });
}

function getLedgerMap() {
    var xml = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    return tallyPost(xml).then(function (raw) {
        var map = {}, re = /<LEDGER NAME="([^"]+)"[^>]*>([\\s\\S]*?)<\/LEDGER>/gi, m;
        while ((m = re.exec(raw)) !== null) {
            var n = m[1].trim(), c = m[2];
            var mobile = ['LEDGERMOBILE', 'MOBILENUMBER', 'MOBILE', 'PHONENUMBER'].map(function (t) { return getTag(c, t); }).filter(Boolean)[0] || '';
            var email = ['EMAIL', 'EMAILID', 'LEDGEREMAIL'].map(function (t) { return getTag(c, t); }).filter(Boolean)[0] || '';
            var state = getTag(c, 'STATENAME') || getTag(c, 'LEDGERSTATE');
            map[n] = { mobile: mobile, email: email, state: state };
        }
        return map;
    }).catch(function (e) { console.error('Ledger err:', e.message); return {}; });
}

function getReceiptVouchers() {
    function mkXml(fmt) {
        return '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>' + fmt + '</SVEXPORTFORMAT><VOUCHERTYPENAME>Receipt Vouchers</VOUCHERTYPENAME></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    }
    return tallyPost(mkXml('$$SysName:XML')).then(function (r1) {
        return (r1.match(/<VOUCHER/gi) || []).length > 0 ? r1 : tallyPost(mkXml('$SysName:XML'));
    }).then(function (raw) {
        var receipts = [];
        getAllBlocks(raw, 'VOUCHER').forEach(function (content) {
            if (getTag(content, 'VOUCHERTYPENAME').toLowerCase().indexOf('receipt') === -1) return;
            var party = getTag(content, 'PARTYLEDGERNAME') || getTag(content, 'PARTYNAME');
            var voucherNo = getTag(content, 'VOUCHERNUMBER');
            var date = getTag(content, 'DATE');
            if (date.length === 8) date = date.slice(6) + '-' + date.slice(4, 6) + '-' + date.slice(0, 4);
            var amount = parseAmt(getTag(content, 'AMOUNT'));
            var narration = getTag(content, 'NARRATION');
            var partyState = getTag(content, 'STATENAME') || getTag(content, 'BUYERSTATENAME');

            var lineItems = [];
            getAllBlocks(content, 'ALLINVENTORYENTRIES.LIST').forEach(function (e) {
                var iname = getTag(e, 'STOCKITEMNAME'); if (!iname) return;
                lineItems.push({ name: iname, hsn: getTag(e, 'HSNCODE') || getTag(e, 'HSN'), qty: getTag(e, 'BILLEDQTY') || getTag(e, 'ACTUALQTY'), rate: getTag(e, 'RATE'), amount: parseAmt(getTag(e, 'AMOUNT')) });
            });
            if (!lineItems.length) {
                getAllBlocks(content, 'ALLLEDGERENTRIES.LIST').forEach(function (e) {
                    var lname = getTag(e, 'LEDGERNAME'), lamt = parseAmt(getTag(e, 'AMOUNT'));
                    if (lname && lname.toLowerCase() !== party.toLowerCase() && lamt > 0)
                        lineItems.push({ name: lname, hsn: '', qty: '', rate: '', amount: lamt });
                });
            }
            if (!lineItems.length) lineItems = [{ name: narration || 'Fee Charges', hsn: '', qty: '', rate: '', amount: amount }];
            if (party && amount > 0) receipts.push({ party: party, voucherNo: voucherNo, date: date, amount: amount, narration: narration, partyState: partyState, lineItems: lineItems });
        });
        return receipts;
    }).catch(function (e) { console.error('Receipt err:', e.message); return []; });
}

app.get('/ping-tally', function (req, res) {
    var xml = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    tallyPost(xml)
        .then(function (data) { res.json({ ok: true, length: data.length, preview: data.slice(0, 500) }); })
        .catch(function (e) { res.status(500).json({ ok: false, error: e.message, code: e.code }); });
});

app.get('/status', function (req, res) { res.json({ ready: isReady }); });

app.get('/receipts', function (req, res) {
    getReceiptVouchers()
        .then(function (receipts) { res.json({ ok: true, receipts: receipts }); })
        .catch(function (e) { res.status(500).json({ ok: false, error: e.message }); });
});

app.get('/receipt/:voucherNo', function (req, res) {
    getVoucherDetails(req.params.voucherNo, 'Receipt Vouchers', req.query.fromDate, req.query.toDate)
        .then(function (raw) { res.set('Content-Type', 'application/xml').send(raw); })
        .catch(function (e) { res.status(500).json({ ok: false, error: e.message }); });
});

app.get('/debug', function (req, res) {
    function mkXml(fmt) {
        return '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>' + fmt + '</SVEXPORTFORMAT><VOUCHERTYPENAME>Receipt Vouchers</VOUCHERTYPENAME></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    }
    Promise.all([tallyPost(mkXml('$$SysName:XML')), tallyPost(mkXml('$SysName:XML'))])
        .then(function (results) {
            res.json({
                receipt_count_dd: (results[0].match(/<VOUCHER/gi) || []).length,
                receipt_count_sd: (results[1].match(/<VOUCHER/gi) || []).length,
                raw_dd: results[0].slice(0, 3000),
                raw_sd: results[1].slice(0, 3000)
            });
        })
        .catch(function (e) { res.status(500).json({ error: e.message }); });
});

function getVoucherDetails(voucherNo, voucherType, fromDate, toDate) {
    voucherType = voucherType || 'Receipt Vouchers';
    fromDate = fromDate || '19000101';
    toDate = toDate || '20991231';
    var xml = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES>' +
        '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>' +
        '<VOUCHERTYPENAME>' + voucherType + '</VOUCHERTYPENAME>' +
        '<SVFROMDATE>' + fromDate + '</SVFROMDATE>' +
        '<SVTODATE>' + toDate + '</SVTODATE>' +
        '<SVVOUCHERNUMBER>' + voucherNo + '</SVVOUCHERNUMBER>' +
        '</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    return tallyPost(xml);
}

function getReceiptPdf(voucherNo) {
    var xml = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES>' +
        '<SVEXPORTFORMAT>PDF</SVEXPORTFORMAT>' +
        '<VOUCHERTYPENAME>Receipt Vouchers</VOUCHERTYPENAME>' +
        '<SVVOUCHERNUMBER>' + voucherNo + '</SVVOUCHERNUMBER>' +
        '</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
    return axios({
        method: 'post',
        url: TALLY_URL,
        data: xml.trim(),
        headers: {
            'Content-Type': 'text/xml',
            'Content-Length': Buffer.byteLength(xml.trim())
        },
        timeout: 60000,
        responseType: 'arraybuffer'
    }).catch(err => {
        console.error('PDF Tally error:', err.response ? err.response.data.slice(0, 200) : err.message);
        return null;
    }).then(r => r ? r.data : null);
}

app.post('/run-text', function (req, res) {
    var results = [];
    waitReady()
        .then(function () {
            return Promise.all([getCompanyInfo(), getLedgerMap(), getReceiptVouchers()]);
        })
        .then(function (data) {
            var company = data[0], ledgerMap = data[1], receipts = data[2];
            console.log('Company: ' + (company.name || 'not found') + '  Receipts: ' + receipts.length);
            if (!receipts.length) { res.json({ status: 'done', message: 'No receipt vouchers found', results: [] }); return; }

            function next(i) {
                if (i >= receipts.length) { res.json({ status: 'done', company: company.name || 'Unknown Company', total: receipts.length, results: results }); return; }
                var rec = receipts[i];
                var info = ledgerMap[rec.party] || {};
                var mobile = (info.mobile || '').replace(/\D/g, '');
                if (!mobile) { results.push({ party: rec.party, status: 'skipped', reason: 'no mobile' }); return next(i + 1); }

                var chatId = (mobile.startsWith('91') ? mobile : '91' + mobile) + '@c.us';
                var msg = '*RECEIPT CONFIRMATION - ' + (company.name || '').toUpperCase() + '*\\n\\n' +
                    'Dear *' + rec.party + '* ,\\n\\n' +
                    'Receipt *' + rec.voucherNo + '* dated ' + rec.date + ' — *Rs. ' + rec.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '* recorded.\\n\\n' +
                    'Thank you for your payment!\\n\\n' +
                    'Amount: Rs. ' + rec.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '\\n' +
                    'Party: ' + rec.party + '\\n' +
                    'Date: ' + rec.date + '\\n' +
                    'Narration: ' + (rec.narration || 'N/A') + '\\n\\n' +
                    '— Accounts Dept, ' + (company.name || '');

                client.sendMessage(chatId, msg)
                    .then(function () {
                        console.log('Sent receipt to ' + rec.party);
                        results.push({ party: rec.party, mobile: mobile, voucherNo: rec.voucherNo, amount: rec.amount, status: 'sent' });
                    })
                    .catch(function (err) {
                        console.error('Failed ' + rec.party + ': ' + err.message);
                        results.push({ party: rec.party, status: 'failed', error: err.message });
                    })
                    .then(function () { return new Promise(function (r) { setTimeout(r, 1500); }); })
                    .then(function () { next(i + 1); });
            }
            next(0);
        })
        .catch(function (err) { res.status(500).json({ error: err.message, results: results }); });
});

app.post('/run', function (req, res) {
    var results = [];
    waitReady()
        .then(function () {
            return Promise.all([getCompanyInfo(), getLedgerMap(), getReceiptVouchers()]);
        })
        .then(function (data) {
            var company = data[0], ledgerMap = data[1], receipts = data[2];
            console.log('Company: ' + (company.name || 'not found') + '  Receipts: ' + receipts.length);
            if (!receipts.length) { res.json({ status: 'done', message: 'No receipt vouchers found', results: [] }); return; }

            function next(i) {
                if (i >= receipts.length) { res.json({ status: 'done', company: company.name || 'Unknown Company', total: receipts.length, results: results }); return; }
                var rec = receipts[i];
                var info = ledgerMap[rec.party] || {};
                var mobile = (info.mobile || '').replace(/\D/g, '');
                if (!mobile) { results.push({ party: rec.party, status: 'skipped', reason: 'no mobile' }); return next(i + 1); }
                getReceiptPdf(rec.voucherNo)
                    .then(function (pdfBuffer) {
                        var chatId = (mobile.startsWith('91') ? mobile : '91' + mobile) + '@c.us';
                        var msg = '*RECEIPT CONFIRMATION - ' + (company.name || '').toUpperCase() + '*\\n\\nDear *' + rec.party + '* ,\\n\\nReceipt *' + rec.voucherNo + '* dated ' + rec.date + ' — *Rs. ' + rec.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '* recorded.\\n\\nThank you!' + (pdfBuffer ? '\\nReceipt PDF attached!' : '') + '\\n— Accounts Dept, ' + (company.name || '');

                        if (pdfBuffer) {
                            var media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), 'receipt.pdf');
                            return client.sendMessage(chatId, msg)
                                .then(() => client.sendMessage(chatId, media, { caption: 'Official Receipt' }))
                                .then(() => {
                                    console.log('✅ PDF receipt sent to ' + rec.party);
                                    results.push({ party: rec.party, mobile: mobile, voucherNo: rec.voucherNo, amount: rec.amount, status: 'sent_pdf' });
                                });
                        } else {
                            console.log('📱 Text-only receipt to ' + rec.party + ' (PDF unavailable)');
                            results.push({ party: rec.party, mobile: mobile, voucherNo: rec.voucherNo, amount: rec.amount, status: 'sent_text' });
                            return client.sendMessage(chatId, msg);
                        }
                    })
                    .catch(function (err) {
                        console.error('❌ Receipt send failed ' + rec.party + ':', err.message);
                        results.push({ party: rec.party, status: 'failed', error: err.message });
                    })
                    .then(function () { return new Promise(r => setTimeout(r, 2000)); })
                    .then(() => next(i + 1));
            }
            next(0);
        })
        .catch(function (err) {
            res.status(500).json({ error: err.message, results: results });
        });
});

app.listen(3000, function () { console.log('Server on http://127.0.0.1:3000'); });
client.initialize();