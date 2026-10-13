#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { startProxy } = require('../../_shared/proxy');

// Everything except the backend-specific output format and CLI invocation comes
// from the manifest, so adding/retuning a connector means editing the fragment.
const NAME = 'agy';
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
  owned_by: 'google'
}));

// `agy models` prints one `<id>\t<display name>` line per model the signed-in
// account can use. The roster changes with each Antigravity release, so the
// daemon asks the CLI at start and falls back to the manifest list offline.
function discoverModels(agyBin) {
  return new Promise((resolve, reject) => {
    const child = spawn(agyBin, ['models'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`agy models exited with code ${code}`)); return; }
      const ids = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\t/);
        if (m) ids.push(m[1]);
      }
      resolve(ids);
    });
  });
}

startProxy({
  name: NAME,
  port: entry.port,
  envKey: entry.envKey,
  binaryName: entry.binaryName,
  format: 'plain',
  models,
  discoverModels,
  spawnArgs: (model, prompt) => ['-p', prompt, '--model', model, '--print-timeout', '10m']
});
