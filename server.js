require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const geoip = require('geoip-lite');

const app = express();
app.use(express.json());

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.URL_POSTGRES,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database schema
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visits (
        ip_address VARCHAR(30) UNIQUE NOT NULL,
        country VARCHAR(30) NOT NULL,
        total INTEGER NOT NULL
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

initDb();

// Serve static files (index.html, assets)
app.use(express.static(path.join(__dirname)));

// Get current count (total unique IPs)
app.get('/count', async (req, res) => {
  try {
    const result = await pool.query('SELECT SUM(total) as sum_total FROM visits');
    res.json({ count: parseInt(result.rows[0].sum_total || 0, 10) });
  } catch (err) {
    console.error('Error getting count:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register a hit: increments total if IP seen before, adds to DB otherwise
app.post('/count/hit', async (req, res) => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = '';
    if (forwarded) ip = forwarded.split(',')[0].trim();
    else ip = req.socket.remoteAddress || '';
    
    // normalize IPv4-mapped IPv6
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    
    if (!ip) {
       return res.status(400).json({ error: 'No IP found' });
    }

    const geo = geoip.lookup(ip);
    const country = geo && geo.country ? geo.country : 'Unknown';

    // Insert or update visitor
    const query = `
      INSERT INTO visits (ip_address, country, total)
      VALUES ($1, $2, 1)
      ON CONFLICT (ip_address) 
      DO UPDATE SET total = visits.total + 1
      RETURNING *;
    `;
    const result = await pool.query(query, [ip, country]);
    const added = result.rows[0].total === 1;

    // Get the total unique count to send back
    const countResult = await pool.query('SELECT SUM(total) as sum_total FROM visits');
    const totalCount = parseInt(countResult.rows[0].sum_total || 0, 10);

    return res.json({ count: totalCount, ip, added, country, total_visits: result.rows[0].total });
  } catch (err) {
    console.error('Error registering hit:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Return the list of IPs (admin)
app.get('/count/ips', async (req, res) => {
  try {
    const countResult = await pool.query('SELECT SUM(total) as sum_total FROM visits');
    const totalCount = parseInt(countResult.rows[0].sum_total || 0, 10);
    
    const result = await pool.query('SELECT * FROM visits ORDER BY total DESC');
    res.json({ count: totalCount, ips: result.rows });
  } catch (err) {
    console.error('Error fetching IPs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
