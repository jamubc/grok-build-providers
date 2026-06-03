'use strict';

// Shared .env handling for grok connectors.
//
// Connector env files live at ~/.cli-proxy-api/grok-<name>.env and contain
// simple KEY=VALUE lines. This is the single source of truth for the loader
// logic that used to be duplicated in every provider wrapper.

const fs = require('fs');

// Load KEY=VALUE pairs from an env file into process.env (no override of
// values already present is intentional NOT done here — last write wins, which
// matches the historical per-provider behaviour).
function loadEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) return;
  const lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    // Skip empty values so a placeholder `KEY=` line does not clobber a key
    // already present in the environment.
    if (m && m[2] !== '') process.env[m[1]] = m[2];
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Read a single KEY's value from an env file without touching process.env.
// Returns undefined if the file or key is absent.
function readKey(envFilePath, key) {
  if (!fs.existsSync(envFilePath)) return undefined;
  const existing = fs.readFileSync(envFilePath, 'utf8');
  const m = existing.match(new RegExp(`^${escapeRegExp(key)}=([^\\r\\n]+)`, 'm'));
  return m ? m[1] : undefined;
}

module.exports = { loadEnvFile, readKey };
