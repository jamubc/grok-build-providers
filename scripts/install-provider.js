#!/usr/bin/env node
'use strict';

// Single install entry point used by both the TUI and headless mode.
// Dispatches by provider type from the manifest:
//   passthrough -> installPassthrough in providers/_shared/install.js
//   custom      -> installCustom in providers/_shared/install.js
//   proxy       -> deferred (not yet implemented)
//
// Both installers are driven entirely by the manifest entry, so adding a
// connector is a providers.json edit.
//
// Usage: node scripts/install-provider.js <name>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'providers', 'providers.json'), 'utf8'),
);

const name = process.argv[2];
if (!name) {
  process.stderr.write('Usage: install-provider <name>\n');
  process.exit(1);
}

const entry = manifest[name];
if (!entry) {
  process.stderr.write(`Unknown provider: ${name}\n`);
  process.exit(1);
}

if (entry.type === 'passthrough' || entry.type === 'custom') {
  try {
    const installer = require('../providers/_shared/install');
    if (entry.type === 'passthrough') installer.installPassthrough(name, entry);
    else installer.installCustom(name, entry);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Failed to install ${name}: ${err.message}\n`);
    process.exit(1);
  }
} else if (entry.type === 'proxy') {
  process.stderr.write(
    `provider type 'proxy' is not implemented yet (${name}); see providers/_shared/proxy.js\n`,
  );
  process.exit(1);
} else {
  process.stderr.write(`Unknown provider type '${entry.type}' for ${name}\n`);
  process.exit(1);
}
