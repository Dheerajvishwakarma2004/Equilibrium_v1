#!/usr/bin/env node
/**
 * update-ip.js
 * Detects the machine's local IPv4 address and updates:
 *   frontend/.env  →  LOCAL_IP=<ip>
 *   backend/.env   →  IP=<ip>
 *
 * Runs automatically on:
 *   - VS Code folder open  (via .vscode/tasks.json)
 *   - Every new integrated terminal  (via .vscode/settings.json + .vscode/terminal-init.sh)
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Detect IPv4 address, preferring Wi-Fi > Ethernet > others
// ---------------------------------------------------------------------------
function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const n = name.toLowerCase();
      const priority =
        n.includes('wi-fi') || n.includes('wifi') || n.includes('wlan') ? 1 :
        n.includes('eth')   || n.includes('lan')                         ? 2 : 3;
      candidates.push({ ip: addr.address, priority, name });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0].ip;
}

// ---------------------------------------------------------------------------
// 2. Update a single key in a .env file, preserving all other content
// ---------------------------------------------------------------------------
function updateEnvValue(content, key, value) {
  // Matches:  KEY=value  or  KEY = value  (spaces around = are preserved)
  const regex = new RegExp(`^(${key}\\s*=\\s*)(.*)$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `$1${value}`);
  }
  // Key not present — append it
  const trimmed = content.trimEnd();
  return trimmed ? `${trimmed}\n${key}=${value}\n` : `${key}=${value}\n`;
}

// ---------------------------------------------------------------------------
// 3. Main
// ---------------------------------------------------------------------------
const ip = getLocalIPv4();

if (!ip) {
  console.warn('[update-ip] WARNING: No IPv4 address detected. .env files not updated.');
  process.exit(0); // soft exit so terminal startup is not blocked
}

const rootDir = __dirname;
const targets = [
  { file: path.join(rootDir, 'frontend', '.env'), key: 'LOCAL_IP' },
  { file: path.join(rootDir, 'backend',  '.env'), key: 'IP'       },
];

let anyChanged = false;

for (const { file, key } of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`[update-ip] WARNING: ${path.relative(rootDir, file)} not found — skipping.`);
    continue;
  }

  const original = fs.readFileSync(file, 'utf8');
  const updated  = updateEnvValue(original, key, ip);

  if (original !== updated) {
    fs.writeFileSync(file, updated, 'utf8');
    anyChanged = true;
    console.log(`[update-ip] Updated  ${key}=${ip}  →  ${path.relative(rootDir, file)}`);
  }
}

if (!anyChanged) {
  console.log(`[update-ip] IP already up to date (${ip}) — no changes needed.`);
} else {
  console.log(`[update-ip] Done. Local IP set to: ${ip}`);
}
