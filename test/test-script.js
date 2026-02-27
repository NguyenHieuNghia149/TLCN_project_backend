const http = require('http');
const fs = require('fs');

const payload = fs.readFileSync('/app/heavy_test.json', 'utf8');

const options = {
  hostname: 'sandbox',
  port: 4000,
  path: '/api/sandbox/execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();
