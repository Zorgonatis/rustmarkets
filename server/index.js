require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const rust = require('./rustplusClient');
const claimsStore = require('./claimsStore');
const itemdb = require('./itemdb');

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

// Map caching (image + metadata)
const mapCache = { at: 0, data: null, jpg: null };

function isFresh(entry, ttl) {
  return entry && Date.now() - entry.at < ttl;
}

async function getVendingPayload(force = false) {
  const now = Date.now();
  if (!force && cache.vending.data && now - cache.vending.at < VENDING_TTL_MS) {
    return cache.vending.data;
  }
  const machines = await rust.getVendingMachines(25000);
  const payload = { count: machines.length, machines };
  cache.vending = { at: now, data: payload };
  return payload;
}

function clearMarketCaches() {
  // Market caches cleared - comparison and search stats removed
}

function normalizeMachineId(id) {
  return id != null ? String(id) : '';
}

function computeStats(costs) {
  if (!costs || !costs.length) return null;
  const filtered = costs.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!filtered.length) return null;
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return {
    min: Math.min(...filtered),
    max: Math.max(...filtered),
    avg: sum / filtered.length,
  };
}

function resolveFromId(id) {
  if (id == null || Number.isNaN(Number(id))) return null;
  return itemdb.lookup(Number(id));
}

function resolveFromName(name) {
  if (!name || typeof name !== 'string') return null;
  return itemdb.findByName(name);
}

function resolveItemReference(input) {
  if (input == null) return null;
  if (typeof input === 'object') {
    if ('itemId' in input || 'id' in input) {
      return resolveFromId(input.itemId ?? input.id);
    }
    if ('name' in input) {
      return resolveFromName(input.name);
    }
  }
  if (typeof input === 'number' || /^[0-9]+$/.test(String(input))) {
    return resolveFromId(Number(input));
  }
  if (typeof input === 'string') {
    return resolveFromName(input);
  }
  return null;
}

async function buildSearchStats(target) {
  const payload = await getVendingPayload();
  const machines = payload.machines || [];
  const matchingMachines = [];
  const globalCosts = [];
  const normalizedTargetId = String(target.id);
  machines.forEach((machine) => {
    const sellOrders = Array.isArray(machine.sellOrders) ? machine.sellOrders : [];
    const itemOrders = sellOrders.filter(
      (order) => String(order.itemId) === normalizedTargetId
    );
    if (!itemOrders.length) return;
    const costs = itemOrders
      .map((order) => Number(order.costPerItem))
      .filter((value) => Number.isFinite(value));
    if (!costs.length) return;
    globalCosts.push(...costs);
    matchingMachines.push({
      id: machine.id,
      name: machine.name,
      x: machine.x,
      y: machine.y,
      outOfStock: machine.outOfStock,
      stats: computeStats(costs),
      orders: itemOrders.map((order) => ({
        costPerItem: order.costPerItem,
        amountInStock: order.amountInStock,
        currencyId: order.currencyId,
        currencyName: order.currencyName,
        itemCondition: order.itemCondition,
        itemConditionMax: order.itemConditionMax,
      })),
    });
  });
  const aggregatedStats = computeStats(globalCosts);
  return {
    item: { id: target.id, name: target.name || null },
    stats: aggregatedStats
      ? { ...aggregatedStats, machineCount: matchingMachines.length }
      : { min: null, max: null, avg: null, machineCount: 0 },
    machines: matchingMachines,
  };
}

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
    const force = 'force' in req.query;
    const payload = await getVendingPayload(force);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

app.post('/api/market/claim', async (req, res) => {
  try {
    const { machineId, release, metadata } = req.body || {};
    if (!machineId) {
      return res.status(400).json({ success: false, error: 'machineId is required' });
    }
    const normalizedId = normalizeMachineId(machineId);
    const vending = await getVendingPayload();
    const machineExists = (vending.machines || []).some(
      (m) => normalizeMachineId(m.id) === normalizedId
    );
    if (!machineExists) {
      return res.status(404).json({ success: false, error: 'Unknown vending machine' });
    }
    
    // If release flag is true, remove the ownership
    if (release === true) {
      const removed = await claimsStore.removeClaim(normalizedId);
      if (!removed) {
        return res.status(404).json({ success: false, error: 'Machine was not owned' });
      }
      clearMarketCaches();
      // Force immediate invalidation of the vending cache when ownership is released
      cache.vending.at = 0;
      return res.json({ success: true, message: 'Ownership released', machineId: normalizedId });
    }
    
    // Otherwise, take ownership of the machine (without requiring Owner ID)
    const claim = await claimsStore.setClaim(normalizedId, {
      ownerId: 'owned', // Simple placeholder since Owner ID is not required
      claimedAt: new Date().toISOString(),
      metadata: metadata || null,
    });
    clearMarketCaches();
    return res.json({ success: true, claim: { machineId: normalizedId, ...claim } });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e && e.message || e) });
  }
});

app.get('/api/market/claims', async (req, res) => {
  try {
    const [claims, vending] = await Promise.all([claimsStore.getAllClaims(), getVendingPayload()]);
    const machineMap = new Map((vending.machines || []).map((machine) => [
      normalizeMachineId(machine.id),
      machine,
    ]));
    const entries = Object.entries(claims).map(([machineId, claim]) => {
      const machine = machineMap.get(machineId);
      return {
        machineId,
        machineName: machine ? machine.name : null,
        x: machine ? machine.x : null,
        y: machine ? machine.y : null,
        claim: { ...claim },
      };
    });
    res.json({ success: true, count: entries.length, claims: entries });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e && e.message || e) });
  }
});


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
