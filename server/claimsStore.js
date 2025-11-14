const fs = require('fs');
const path = require('path');

const DEFAULT_CLAIMS_FILE = process.env.CLAIMS_FILE || path.join(process.cwd(), 'data', 'claims.json');

class ClaimsStore {
  constructor() {
    this.filePath = DEFAULT_CLAIMS_FILE;
    this.claims = {};
    this._writeChain = Promise.resolve();
    this._loadPromise = null;
    this._ensureDirectory();
    this._loadPromise = this._load();
  }

  _ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async _load() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      this.claims = typeof parsed.claims === 'object' && parsed.claims !== null ? parsed.claims : {};
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('Failed to read claims file:', e.message || e);
      }
      this.claims = {};
    }
  }

  async _ready() {
    if (this._loadPromise) {
      await this._loadPromise;
      this._loadPromise = null;
    }
  }

  async _persist() {
    const payload = JSON.stringify({ claims: this.claims }, null, 2);
    this._writeChain = this._writeChain.then(() =>
      fs.promises.writeFile(this.filePath, payload, 'utf8')
        .catch((err) => {
          console.error('Failed to write claims file:', err.message || err);
          throw err;
        })
    );
    return this._writeChain;
  }

  async setClaim(machineId, claimData) {
    await this._ready();
    this.claims = { ...this.claims, [machineId]: claimData };
    await this._persist();
    return this.claims[machineId];
  }

  async removeClaim(machineId) {
    await this._ready();
    if (!(machineId in this.claims)) return false;
    const next = { ...this.claims };
    delete next[machineId];
    this.claims = next;
    await this._persist();
    return true;
  }

  async getClaim(machineId) {
    await this._ready();
    return this.claims[machineId] || null;
  }

  async getAllClaims() {
    await this._ready();
    return { ...this.claims };
  }
}

module.exports = new ClaimsStore();