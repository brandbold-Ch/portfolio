const http = require('http');

function sendHit(ip) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/count/hit',
      method: 'POST',
      headers: { 'x-forwarded-for': ip }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(sendHit(`192.168.0.${i}`));
  }
  await Promise.all(promises);
  console.log('Done');
}
run();
