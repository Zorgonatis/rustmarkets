require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const rust = require('./rustplusClient');

// simple in-memory cache to reduce Rust+ rate-limit pressure
const cache = {
  info: { at: 0, data: null },
  vending: { at: 0, data: null },
};
const INFO_TTL_MS = Number(process.env.INFO_TTL_MS || 10000); // 10s
const VENDING_TTL_MS = Number(process.env.VENDING_TTL_MS || 5000); // 5s
const MAP_TTL_MS = Number(process.env.MAP_TTL_MS || 5 * 60 * 1000); // 5m

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.get('/api/health', async (req, res) => {
  try {
    await rust.ensureConnected(3000);
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: String(e && e.message || e) });
  }
});

app.get('/api/info', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.info.data && now - cache.info.at < INFO_TTL_MS) {
      return res.json(cache.info.data);
    }
    const info = await rust.getInfo(15000);
    cache.info = { at: now, data: info };
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

app.get('/api/vending-machines', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.vending.data && now - cache.vending.at < VENDING_TTL_MS) {
      return res.json(cache.vending.data);
    }
    const machines = await rust.getVendingMachines(25000);
    const payload = { count: machines.length, machines };
    cache.vending = { at: now, data: payload };
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

// Map caching (image + metadata)
const mapCache = { at: 0, data: null, jpg: null };

app.get('/api/map', async (req, res) => {
  try {
    const now = Date.now();
    const force = 'force' in req.query;
    if (!force && mapCache.data && now - mapCache.at < MAP_TTL_MS) {
      return res.json(mapCache.data);
    }
    const map = await rust.getMapRaw(30000);
    const meta = {
      width: map.width,
      height: map.height,
      oceanMargin: map.oceanMargin,
      background: map.background || null,
      monuments: map.monuments || [],
    };
    // include mapSize from info
    try {
      const infoNow = Date.now();
      if (!cache.info.data || infoNow - cache.info.at >= INFO_TTL_MS) {
        const info = await rust.getInfo(10000);
        cache.info = { at: infoNow, data: info };
      }
      meta.mapSize = cache.info.data.mapSize;
    } catch (_) {}

    mapCache.at = now;
    mapCache.data = meta;
    mapCache.jpg = Buffer.from(map.jpgImage, 'base64');
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

app.get('/api/map.jpg', async (req, res) => {
  try {
    const now = Date.now();
    if (!mapCache.jpg || now - mapCache.at >= MAP_TTL_MS) {
      const map = await rust.getMapRaw(30000);
      mapCache.at = now;
      mapCache.data = {
        width: map.width,
        height: map.height,
        oceanMargin: map.oceanMargin,
        background: map.background || null,
        monuments: map.monuments || [],
      };
      mapCache.jpg = Buffer.from(map.jpgImage, 'base64');
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.end(mapCache.jpg);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

// Static frontend
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// Start server and initiate Rust+ connection
app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  try {
    await rust.connect();
    console.log('Connected to Rust+ websocket');
  } catch (e) {
    console.error('Failed to connect to Rust+ initially:', e.message);
  }
});
