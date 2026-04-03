const axios = require('axios');
const xml = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>';
axios.post('http://localhost:9000', xml, {headers:{'Content-Type':'text/xml'}})
  .then(r => {
    console.log('len', r.data.length);
    const m = r.data.match(/SVCURRENTCOMPANY[^<]*/gi);
    console.log('match', m);
    const company = r.data.match(/<SVCURRENTCOMPANY[^>]*>([\s\S]*?)<\/SVCURRENTCOMPANY>/i);
    console.log('company', company && company[1]);
  })
  .catch(e => { console.error('err', e.message); if (e.response) console.error('res', e.response.data); });
