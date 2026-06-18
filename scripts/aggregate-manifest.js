#!/usr/bin/env node
'use strict';

// Manifest aggregator: scans providers/<id>/provider.json fragments and
// combines them into providers/providers.json (sorted alphabetically by id).
//
// Each provider owns one fragment in its own directory, so adding a provider is
// a new file in a new directory, with no edits to a shared manifest and no
// merge conflicts. providers/providers.json is a GENERATED aggregate; do not
// edit it by hand. Edit the per-provider fragment and re-run this script.
//
// Run directly to (re)write providers.json. Pass --check to verify the on-disk
// providers.json matches the fragments without writing (CI / pre-commit hook).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROVIDERS_DIR = path.join(ROOT, 'providers');
const MANIFEST_PATH = path.join(PROVIDERS_DIR, 'providers.json');

// Directories under providers/ that are not providers. The provider.json
// presence check below already self-filters these; the set is defense-in-depth.
const SKIP_DIRS = new Set(['_shared']);

function aggregate() {
  const dirents = fs.readdirSync(PROVIDERS_DIR, { withFileTypes: true });
  const byId = {};
  const ids = [];

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    if (SKIP_DIRS.has(dirent.name)) continue;

    const fragmentPath = path.join(PROVIDERS_DIR, dirent.name, 'provider.json');
    if (!fs.existsSync(fragmentPath)) continue; // self-filters non-provider dirs

    const id = dirent.name;

    // Same validation rules as scripts/generate-bins.js (the downstream consumer).
    if (!/^[a-z0-9_-]+$/i.test(id)) {
      throw new Error(`Invalid provider identifier "${id}": must contain only alphanumeric characters, hyphens, or underscores.`);
    }
    if (Object.prototype.hasOwnProperty.call(byId, id)) {
      throw new Error(`Duplicate provider identifier "${id}".`);
    }

    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse ${fragmentPath}: ${err.message}`);
    }

    if (entry.envKey && !/^[A-Z_][A-Z0-9_]*$/.test(entry.envKey)) {
      throw new Error(`Invalid envKey "${entry.envKey}" for provider "${id}": must be a valid environment variable identifier.`);
    }

    byId[id] = entry;
    ids.push(id);
  }

  // Deterministic, coordination-free ordering: alphabetical by id. Iteration
  // order of this object drives the TUI menu and the package.json bin map.
  ids.sort();
  const ordered = {};
  for (const id of ids) ordered[id] = byId[id];
  return ordered;
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function writeManifest(obj) {
  fs.writeFileSync(MANIFEST_PATH, serialize(obj), 'utf8');
}

function main() {
  const check = process.argv.includes('--check');
  const aggregated = aggregate();
  const ids = Object.keys(aggregated);

  if (check) {
    const expected = serialize(aggregated);
    const actual = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, 'utf8') : '';
    if (expected !== actual) {
      process.stderr.write('providers.json is out of sync with provider fragments. Run: npm run build:manifest\n');
      process.exit(1);
    }
    console.log(`providers.json is in sync (${ids.length} providers: ${ids.join(', ')})`);
    return;
  }

  writeManifest(aggregated);
  console.log(`aggregated ${ids.length} providers -> providers/providers.json (${ids.join(', ')})`);
}

if (require.main === module) main();

module.exports = { aggregate, writeManifest, MANIFEST_PATH };
