#!/usr/bin/env node
'use strict';

const { startProxy } = require('../../_shared/proxy');

startProxy({
  name: 'codex',
  port: 8319,
  envKey: 'GROK_CODEX_PROXY_API_KEY',
  binaryName: 'codex',
  format: 'json-lines',
  models: [
    { id: 'gpt-5.5', object: 'model', created: 1677610602, owned_by: 'openai' },
    { id: 'gpt-5.4', object: 'model', created: 1677610602, owned_by: 'openai' },
    { id: 'gpt-5.4-mini', object: 'model', created: 1677610602, owned_by: 'openai' },
    { id: 'gpt-5.3-codex', object: 'model', created: 1677610602, owned_by: 'openai' },
    { id: 'gpt-5.2', object: 'model', created: 1677610602, owned_by: 'openai' }
  ],
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
