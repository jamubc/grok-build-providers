#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const { mkdirSafe, writeSecure } = require('../../_shared/install');
const { GROK_HOME, GROK_CONFIG, LOCAL_BIN, patchModelBlock } = require('../../_shared/config');
const { readKey } = require('../../_shared/env');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const ENV_FILE = path.join(CLIPROXY_AUTH_DIR, 'grok-codex.env');

// ---------------------------------------------------------------------------
// 1. Setup Directories
// ---------------------------------------------------------------------------
mkdirSafe(CLIPROXY_AUTH_DIR, LOCAL_BIN, GROK_HOME);

// ---------------------------------------------------------------------------
// 2. Generate/Load API Key
// ---------------------------------------------------------------------------
let apiKey = readKey(ENV_FILE, 'GROK_CODEX_PROXY_API_KEY') || process.env.GROK_CODEX_PROXY_API_KEY;
if (!apiKey) {
  apiKey = crypto.randomBytes(24).toString('hex');
}
writeSecure(ENV_FILE, `GROK_CODEX_PROXY_API_KEY=${apiKey}\n`);

// ---------------------------------------------------------------------------
// 3. Patch Grok config.toml
// ---------------------------------------------------------------------------
patchModelBlock('codex', {
  defaultModel: 'gpt-5.5',
  baseUrl: 'http://127.0.0.1:8319/v1',
  name: 'Codex (inline)',
  envKey: 'GROK_CODEX_PROXY_API_KEY'
});

// ---------------------------------------------------------------------------
// 4. Write grok-codex wrapper shim to ~/.local/bin
// ---------------------------------------------------------------------------
const wrapperSrc = path.join(__dirname, '..', 'bin', 'grok-codex.js');
const wrapperDst = path.join(LOCAL_BIN, 'grok-codex');

const wrapperContent = [
  '#!/usr/bin/env node',
  "'use strict';",
  `require(${JSON.stringify(wrapperSrc)});`,
  ''
].join('\n');

fs.writeFileSync(wrapperDst, wrapperContent, 'utf8');
fs.chmodSync(wrapperDst, 0o755);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log('installed grok-codex (Node-native inline proxy)');
console.log('model: gpt-5.5');
console.log("verify: grok-codex -p 'Say ok'");
