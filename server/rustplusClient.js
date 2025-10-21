const RustPlus = require('../lib/simpleRustPlus');
const itemdb = require('./itemdb');

const DEFAULT_TIMEOUT_MS = Number(process.env.RUST_TIMEOUT_MS || 10000);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

class RustplusClient {
  constructor() {
    this.server = requiredEnv('RUST_ADDRESS');
    this.port = Number(requiredEnv('RUST_PORT'));
    this.playerId = String(requiredEnv('RUST_PLAYER_ID'));
    this.playerToken = Number(requiredEnv('RUST_PLAYER_TOKEN'));
    this.useProxy = String(process.env.RUST_USE_FACEPUNCH_PROXY || 'false').toLowerCase() === 'true';

    this.rp = new RustPlus(this.server, this.port, this.playerId, this.playerToken, this.useProxy);

    this._isConnected = false;
    this._connectPromise = null;
    this._connectResolve = null;
    this._connectReject = null;
    this._reconnectTimer = null;

    this._wireEvents();
  }

  _wireEvents() {
    this.rp.on('connecting', () => {
      // no-op; useful for logging
    });
    this.rp.on('connected', () => {
      this._isConnected = true;
      if (this._connectResolve) {
        this._connectResolve();
        this._resetConnectPromise();
      }
    });
    this.rp.on('disconnected', () => {
      this._isConnected = false;
      // trigger reconnect with backoff
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
    });
    this.rp.on('error', (err) => {
      // log errors for visibility
      try { console.error('Rust+ error:', err && err.message ? err.message : err); } catch (_) {}
      // propagate to pending connect promise if present
      if (this._connectReject) {
        this._connectReject(err);
        this._resetConnectPromise();
      }
    });
  }

  _resetConnectPromise() {
    this._connectPromise = null;
    this._connectResolve = null;
    this._connectReject = null;
  }

  async connect(timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this._isConnected) return;
    if (!this._connectPromise) {
      this._connectPromise = new Promise((resolve, reject) => {
        this._connectResolve = resolve;
        this._connectReject = reject;
        // start actual connection attempt
        try {
          this.rp.connect();
        } catch (e) {
          reject(e);
        }
      });
    }
    if (timeoutMs && timeoutMs > 0) {
      await Promise.race([
        this._connectPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Rust+ connect timeout')), timeoutMs)),
      ]);
    } else {
      await this._connectPromise;
    }
  }

  async ensureConnected(timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this._isConnected) return;
    await this.connect(timeoutMs);
  }

  async getInfo(timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.ensureConnected(timeoutMs);
    const res = await this.rp.sendRequestAsync({ getInfo: {} }, timeoutMs);
    return res.info;
  }

  async getMapMarkersRaw(timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.ensureConnected(timeoutMs);
    const res = await this.rp.sendRequestAsync({ getMapMarkers: {} }, timeoutMs);
    return res.mapMarkers || { markers: [] };
  }

  async getMapRaw(timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.ensureConnected(timeoutMs);
    const res = await this.rp.sendRequestAsync({ getMap: {} }, timeoutMs);
    return res.map;
  }

  async getVendingMachines(timeoutMs = DEFAULT_TIMEOUT_MS) {
    const markers = (await this.getMapMarkersRaw(timeoutMs)).markers || [];
    const VENDING_MACHINE_TYPE = 3; // AppMarkerType.VendingMachine
    const vending = markers.filter((m) => m.type === VENDING_MACHINE_TYPE);
    // Shape for frontend consumption
    return vending.map((m) => ({
      id: m.id,
      name: m.name || '',
      x: m.x,
      y: m.y,
      outOfStock: Boolean(m.outOfStock),
      sellOrders: (m.sellOrders || []).map((o) => ({
        itemId: o.itemId,
        itemName: (itemdb.lookup(o.itemId) || {}).name || null,
        quantity: o.quantity,
        currencyId: o.currencyId,
        currencyName: (itemdb.lookup(o.currencyId) || {}).name || null,
        costPerItem: o.costPerItem,
        amountInStock: typeof o.amountInStock === 'number' ? o.amountInStock : null,
        itemIsBlueprint: o.itemIsBlueprint,
        currencyIsBlueprint: o.currencyIsBlueprint,
        itemCondition: o.itemCondition,
        itemConditionMax: o.itemConditionMax,
      })),
    }));
  }
}

module.exports = new RustplusClient();
