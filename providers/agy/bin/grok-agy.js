#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { startProxy } = require('../../_shared/proxy');

// Everything except the backend-specific output format and CLI invocation comes
// from the manifest, so adding/retuning a connector means editing providers.json.
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

startProxy({
  name: NAME,
  port: entry.port,
  envKey: entry.envKey,
  binaryName: entry.binaryName,
  format: 'plain',
  models,
  spawnArgs: (model, prompt) => ['-p', prompt, '--print-timeout', '10m']
});
