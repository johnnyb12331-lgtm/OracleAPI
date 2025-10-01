const http = require('http');

// Test the profile endpoint
const options = {
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/user/68d33c7a871f6cf5af00e51d/profile',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer fake_token_for_testing'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  res.on('data', (chunk) => {
    console.log(`Body: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();