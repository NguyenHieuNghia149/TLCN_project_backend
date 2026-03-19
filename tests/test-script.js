const http = require('http');
const fs = require('fs');

const payload = fs.readFileSync('/app/heavy_test.json', 'utf8');
const hostname = process.env.SANDBOX_HTTP_HOST || process.env.SANDBOX_HOST || 'sandbox';
const port = Number(process.env.SANDBOX_HTTP_PORT || process.env.SANDBOX_PORT || 4000);

const options = {
  hostname,
  port,
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
  console.error(Problem with request: );
});

req.write(payload);
req.end();