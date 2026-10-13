#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { startProxy } = require('../../_shared/proxy');

// Everything except the backend-specific output format and CLI invocation comes
// from the manifest, so adding/retuning a connector means editing the fragment.
const NAME = 'codex';
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'providers.json'), 'utf8'));
const entry = manifest[NAME];
if (!entry || !entry.models || !entry.port || !entry.envKey || !entry.binaryName) {
  process.stderr.write(`Error: provider "${NAME}" is not fully configured in providers.json (need models, port, envKey, binaryName)\n`);
  process.exit(1);
}
const models = entry.models.map(id => ({
  id,
  object: 'model',
  created: 1677610602,
  owned_by: 'openai'
}));

// The Codex CLI caches the model roster it fetched for the signed-in account
// at ~/.codex/models_cache.json (`{ models: [{ slug, display_name, ... }] }`).
// Reading it keeps the picker current without a network call; the manifest
// list is the fallback when the cache is absent.
function discoverModels() {
  return new Promise((resolve, reject) => {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    fs.readFile(path.join(codexHome, 'models_cache.json'), 'utf8', (err, raw) => {
      if (err) { reject(err); return; }
      let json;
      try { json = JSON.parse(raw); } catch (e) { reject(e); return; }
      const list = Array.isArray(json) ? json : Array.isArray(json.models) ? json.models : [];
      // Codex marks retired and internal entries (gpt-reserve, codex-auto-review,
      // legacy models) `visibility: "hide"`; mirror its own picker and keep its
      // priority order.
      const visible = list
        .filter((m) => m && typeof m.slug === 'string' && m.slug && m.visibility !== 'hide')
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      resolve(visible.map((m) => m.slug));
    });
  });
}

startProxy({
  name: NAME,
  port: entry.port,
  envKey: entry.envKey,
  binaryName: entry.binaryName,
  format: 'json-lines',
  models,
  discoverModels,
  spawnArgs: (model, prompt) => [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '--model', model,
    prompt
  ]
});
