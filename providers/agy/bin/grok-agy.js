#!/usr/bin/env node
'use strict';

const { startProxy } = require('../../_shared/proxy');

startProxy({
  name: 'agy',
  port: 8318,
  envKey: 'GROK_AGY_PROXY_API_KEY',
  binaryName: 'agy',
  format: 'plain',
  models: [
    { id: 'gemini-3.5-flash', object: 'model', created: 1677610602, owned_by: 'google' },
    { id: 'gemini-3-pro', object: 'model', created: 1677610602, owned_by: 'google' },
    { id: 'gemini-3-pro-thinking', object: 'model', created: 1677610602, owned_by: 'google' },
    { id: 'gemini-2.5-pro', object: 'model', created: 1677610602, owned_by: 'google' },
    { id: 'gemini-2.5-flash', object: 'model', created: 1677610602, owned_by: 'google' }
  ],
  spawnArgs: (model, prompt) => ['-p', prompt, '--print-timeout', '10m']
});
