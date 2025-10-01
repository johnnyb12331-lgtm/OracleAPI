const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [{ name: 'commonName', value: '192.168.40.197' }];
const pems = selfsigned.generate(attrs, { days: 365 });

fs.writeFileSync('key.pem', pems.private);
fs.writeFileSync('cert.pem', pems.cert);

console.log('Certificates generated successfully.');