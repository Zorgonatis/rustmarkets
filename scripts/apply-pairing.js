#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgJson(arg){
  if(!arg) throw new Error('Usage: node scripts/apply-pairing.js <pairing.json | inline-json>');
  // arg is a path?
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    return JSON.parse(fs.readFileSync(arg, 'utf8'));
  }
  // otherwise treat as inline JSON
  try { return JSON.parse(arg); } catch(e) {
    throw new Error('Argument is neither a file nor valid JSON');
  }
}

function upsertEnv(envPath, pairs){
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  }
  const map = new Map();
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    map.set(key, line);
  }
  for (const [k,v] of Object.entries(pairs)){
    map.set(k, `${k}=${v}`);
  }
  // rebuild preserving comments and order where possible
  const keysWritten = new Set(Object.keys(pairs));
  const out = [];
  // write existing lines, replacing those we updated
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) { out.push(line); continue; }
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    if (keysWritten.has(key)) {
      out.push(map.get(key));
      keysWritten.delete(key);
    } else {
      out.push(line);
    }
  }
  // append any new keys we added that weren’t present
  if (out.length && out[out.length-1] !== '') out.push('');
  for (const key of Object.keys(pairs)){
    if ([...lines].some(l => l.startsWith(key+'='))) continue;
    out.push(map.get(key));
  }
  fs.writeFileSync(envPath, out.join('\n'));
}

try {
  const arg = process.argv[2];
  const data = parseArgJson(arg);
  const { ip, port, playerId, playerToken } = data;
  if (!ip || !port || !playerId || (playerToken === undefined || playerToken === null)){
    throw new Error('JSON must contain ip, port, playerId, playerToken');
  }
  const envPath = path.join(process.cwd(), '.env');
  upsertEnv(envPath, {
    RUST_ADDRESS: ip,
    RUST_PORT: port,
    RUST_PLAYER_ID: playerId,
    RUST_PLAYER_TOKEN: playerToken,
  });
  console.log('Updated .env with pairing details.');
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}

