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
    return { count: 0, ips: [] };
  }
}

function writeCount(obj) {
  fs.writeFileSync(COUNT_PATH, JSON.stringify(obj, null, 2), 'utf8');
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
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

  const data = readCount();
  if (!Array.isArray(data.ips)) data.ips = [];
  if (typeof data.count !== 'number') data.count = 0;

  const already = data.ips.includes(ip);
  if (!already) {
    data.ips.push(ip);
    data.count = (data.count || 0) + 1;
    try { writeCount(data); } catch (e) { console.error('Failed writing count.json', e); }
  }

  res.json({ count: data.count, ip, added: !already });
});

// Return the list of IPs (admin)
app.get('/count/ips', (req, res) => {
  const data = readCount();
  res.json({ count: data.count || 0, ips: data.ips || [] });
});

// Reset counter (requires admin token in header 'x-admin-token')
app.post('/count/reset', (req, res) => {
  const token = req.headers['x-admin-token'] || '';
  const expected = process.env.ADMIN_TOKEN || '';
  if (!expected || token !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const data = { count: 0, ips: [] };
  try { writeCount(data); } catch (e) { return res.status(500).json({ error: 'failed' }); }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
