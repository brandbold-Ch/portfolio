const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const COUNT_PATH = path.join(__dirname, 'count.json');

function readCount() {
  try {
    const raw = fs.readFileSync(COUNT_PATH, 'utf8');
    return JSON.parse(raw || '{"count":0,"ips":[]}');
  } catch (e) {
    console.error('Error parsing count.json, returning default:', e.message);
    return { count: 0, ips: [] };
  }
}

function writeCount(obj) {
  // Use atomic write to prevent another process from reading an empty/truncated file
  const tmpPath = COUNT_PATH + `.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmpPath, COUNT_PATH);
}

// Serve static files (index.html, assets)
app.use(express.static(path.join(__dirname)));

// Get current count
app.get('/count', (req, res) => {
  const data = readCount();
  res.json({ count: data.count || 0 });
});

// Register a hit: increments only if IP not seen before
app.post('/count/hit', (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = '';
  if (forwarded) ip = forwarded.split(',')[0].trim();
  else ip = req.socket.remoteAddress || '';
  // normalize IPv4-mapped IPv6
  if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

  const data = readCount();
  if (!Array.isArray(data.ips)) data.ips = [];
  if (typeof data.count !== 'number') data.count = 0;

  const already = ip && data.ips.includes(ip);

  if (!already) {
    if (ip) data.ips.push(ip);
    data.count = (data.count || 0) + 1;
    try { writeCount(data); } catch (e) { console.error('Failed writing count.json', e); }
    return res.json({ count: data.count, ip, added: true });
  }

  // IP already registered, do not increment
  return res.json({ count: data.count, ip, added: false });
});

// Return the list of IPs (admin)
app.get('/count/ips', (req, res) => {
  const data = readCount();
  res.json({ count: data.count || 0, ips: data.ips || [] });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
