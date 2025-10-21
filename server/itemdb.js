const fs = require('fs');
const path = require('path');

const DEFAULT_ITEMS_PATH = process.env.ITEMS_FILE || path.join(process.cwd(), 'data', 'items.json');

let cache = null;

function loadDb() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DEFAULT_ITEMS_PATH, 'utf8');
    const data = JSON.parse(raw);
    // normalize keys to string numbers
    const map = new Map();
    Object.entries(data).forEach(([k, v]) => {
      map.set(String(Number(k)), v);
    });
    cache = map;
  } catch (e) {
    cache = new Map();
  }
  return cache;
}

function lookup(id) {
  const db = loadDb();
  const rec = db.get(String(Number(id)));
  if (!rec) return null;
  // support both { name } and { displayName }
  const name = rec.displayName || rec.name || rec.shortName || null;
  return {
    id: Number(id),
    name,
    shortName: rec.shortName || null,
    displayName: rec.displayName || rec.name || null,
    category: rec.category || null,
    icon: rec.icon || null,
  };
}

module.exports = { lookup, loadDb };

