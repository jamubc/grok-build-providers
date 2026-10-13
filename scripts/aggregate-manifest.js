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

    validateEntry(id, entry);

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

const TYPES = new Set(['passthrough', 'custom', 'proxy']);
const BACKENDS = new Set(['chat_completions', 'responses', 'messages']);
const AUTH_SCHEMES = new Set(['bearer', 'x-api-key']);

function compiles(pattern) {
  try { new RegExp(pattern); return true; } catch { return false; }
}

// Fail the build on a malformed fragment rather than letting the TUI or an
// installer trip over it at runtime on a user's machine.
function validateEntry(id, entry) {
  const fail = (msg) => { throw new Error(`providers/${id}/provider.json: ${msg}`); };

  if (!TYPES.has(entry.type)) fail(`type must be one of ${[...TYPES].join(', ')}`);
  for (const f of ['name', 'defaultModel']) {
    if (typeof entry[f] !== 'string' || !entry[f]) fail(`"${f}" is required`);
  }
  if (entry.envKey && !/^[A-Z_][A-Z0-9_]*$/.test(entry.envKey)) {
    fail(`invalid envKey "${entry.envKey}": must be a valid environment variable identifier`);
  }
  if (entry.type === 'passthrough') {
    if (!/^https:\/\//.test(entry.baseUrl || '')) fail('passthrough needs an https baseUrl');
    if (!entry.envKey) fail('passthrough needs an envKey');
  }
  if (entry.type === 'custom') {
    if (!Number.isInteger(entry.port)) fail('custom needs an integer port');
    if (!entry.envKey) fail('custom needs an envKey');
    if (!Array.isArray(entry.models) || !entry.models.length) fail('custom needs a non-empty models list');
  }
  if (entry.apiBackend !== undefined && !BACKENDS.has(entry.apiBackend)) {
    fail(`apiBackend must be one of ${[...BACKENDS].join(', ')}`);
  }
  if (entry.authScheme !== undefined && !AUTH_SCHEMES.has(entry.authScheme)) {
    fail(`authScheme must be one of ${[...AUTH_SCHEMES].join(', ')}`);
  }
  if (entry.backendRules !== undefined) {
    if (!Array.isArray(entry.backendRules)) fail('backendRules must be an array');
    entry.backendRules.forEach((rule, i) => {
      if (!rule || typeof rule.match !== 'string' || !compiles(rule.match)) fail(`backendRules[${i}].match must be a valid regex`);
      if (!BACKENDS.has(rule.backend)) fail(`backendRules[${i}].backend must be one of ${[...BACKENDS].join(', ')}`);
    });
  }
  if (entry.excludeModels !== undefined && (typeof entry.excludeModels !== 'string' || !compiles(entry.excludeModels))) {
    fail('excludeModels must be a valid regex string');
  }
  if (entry.extraHeaders !== undefined) {
    if (!entry.extraHeaders || typeof entry.extraHeaders !== 'object' || Array.isArray(entry.extraHeaders)) fail('extraHeaders must be an object');
    for (const [k, v] of Object.entries(entry.extraHeaders)) {
      if (!/^[A-Za-z0-9-]+$/.test(k) || typeof v !== 'string') fail(`extraHeaders["${k}"] must map a header name to a string`);
    }
  }
  if (entry.contextWindow !== undefined && !(Number.isInteger(entry.contextWindow) && entry.contextWindow > 0)) {
    fail('contextWindow must be a positive integer');
  }
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

module.exports = { aggregate, writeManifest, validateEntry, MANIFEST_PATH };
