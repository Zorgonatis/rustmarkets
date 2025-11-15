const fs = require('fs');
const path = require('path');

const DEFAULT_CLAIMS_FILE = process.env.CLAIMS_FILE || path.join(process.cwd(), 'data', 'claims.json');

class ClaimsStore {
  constructor() {
    this.filePath = DEFAULT_CLAIMS_FILE;
    this.tempFilePath = this.filePath + '.tmp';
    this.claims = {};
    this._writeChain = Promise.resolve();
    this._loadPromise = null;
    this._isWriting = false;
    this._writeQueue = [];
    this._maxRetries = 3;
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
    let retries = 0;
    while (retries < this._maxRetries) {
      try {
        // If there's a write in progress, wait for it to complete
        if (this._isWriting) {
          await this._waitForWriteComplete();
        }
        
        const raw = await fs.promises.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        this.claims = typeof parsed.claims === 'object' && parsed.claims !== null ? parsed.claims : {};
        return;
      } catch (e) {
        retries++;
        if (e.code !== 'ENOENT') {
          console.error(`Failed to read claims file (attempt ${retries}/${this._maxRetries}):`, e.message || e);
        }
        
        if (retries >= this._maxRetries) {
          console.error('Max retries reached, using empty claims');
          this.claims = {};
          return;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
      }
    }
  }

  async _waitForWriteComplete() {
    // Wait for any ongoing write operation to complete
    while (this._isWriting) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async _ready() {
    if (this._loadPromise) {
      await this._loadPromise;
      this._loadPromise = null;
    }
    // Ensure any write operations are complete before proceeding
    await this._waitForWriteComplete();
  }

  async _persist() {
    // Set writing flag to prevent concurrent reads
    this._isWriting = true;
    
    const payload = JSON.stringify({ claims: this.claims }, null, 2);
    
    this._writeChain = this._writeChain.then(async () => {
      let retries = 0;
      while (retries < this._maxRetries) {
        try {
          // Write to temporary file first (atomic operation)
          await fs.promises.writeFile(this.tempFilePath, payload, 'utf8');
          
          // Verify the temporary file was written correctly
          const verification = await fs.promises.readFile(this.tempFilePath, 'utf8');
          const parsed = JSON.parse(verification);
          
          if (!parsed.claims || typeof parsed.claims !== 'object') {
            throw new Error('Invalid data written to temporary file');
          }
          
          // Atomic rename to actual file
          await fs.promises.rename(this.tempFilePath, this.filePath);
          
          return;
        } catch (err) {
          retries++;
          console.error(`Failed to write claims file (attempt ${retries}/${this._maxRetries}):`, err.message || err);
          
          if (retries >= this._maxRetries) {
            // Clean up temp file if it exists
            try {
              await fs.promises.unlink(this.tempFilePath);
            } catch (cleanupErr) {
              // Ignore cleanup errors
            }
            throw err;
          }
          
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
      }
    }).finally(() => {
      this._isWriting = false;
    });
    
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
    // Return a deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.claims));
  }

  async waitForWriteComplete() {
    return this._waitForWriteComplete();
  }

  isWriting() {
    return this._isWriting;
  }
}

module.exports = new ClaimsStore();