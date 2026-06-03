'use strict';

// Shared installer logic.
//
// `mkdirSafe`/`writeSecure` were copy-pasted into every provider's
// lib/install.js. `installPassthrough` is the generic installer that fully
// replaces the per-provider install scripts for OpenAI-compatible
// (passthrough) providers — everything it needs comes from the manifest entry.

const fs = require('fs');
const path = require('path');
const os = require('os');

const { readKey } = require('./env');
const config = require('./config');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR =
  process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const REPO_ROOT = path.join(__dirname, '..', '..');

function mkdirSafe(...dirs) {
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(d, 0o700);
    } catch {}
  }
}

function writeSecure(filePath, content, mode = 0o600) {
  const fd = fs.openSync(filePath, 'w', mode);
  try {
    // openSync's mode only applies when the file is created; force it so a
    // pre-existing (possibly world-readable) secret file is tightened too.
    fs.fchmodSync(fd, mode);
    fs.writeSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

// Install a passthrough connector purely from its manifest entry.
function installPassthrough(name, entry) {
  const envFile = path.join(CLIPROXY_AUTH_DIR, `grok-${name}.env`);

  // 1. Directories
  mkdirSafe(CLIPROXY_AUTH_DIR, config.LOCAL_BIN, config.GROK_HOME);

  // 2. API key — prefer any value already on disk, then the environment.
  let apiKey = readKey(envFile, entry.envKey) || process.env[entry.envKey];
  if (!apiKey) {
    apiKey = '';
    writeSecure(envFile, `${entry.envKey}=\n`);
  } else {
    writeSecure(envFile, `${entry.envKey}=${apiKey}\n`);
  }

  // 3. Grok config.toml — [model.<name>]
  config.patchModelBlock(name, entry);

  // 4. Copy the generated wrapper into ~/.local/bin
  const wrapperSrc = path.join(REPO_ROOT, 'bins', `grok-${name}.js`);
  const wrapperDst = path.join(config.LOCAL_BIN, `grok-${name}`);
  fs.copyFileSync(wrapperSrc, wrapperDst);
  fs.chmodSync(wrapperDst, 0o755);

  // 5. Summary
  console.log(`installed grok-${name}`);
  console.log(`model: ${entry.defaultModel}`);
  if (!apiKey) {
    console.log(
      `WARNING: missing ${entry.envKey}. Write it to ~/.cli-proxy-api/grok-${name}.env`,
    );
  }
  console.log(`verify: grok-${name} -p 'Say ok'`);
}

module.exports = { mkdirSafe, writeSecure, installPassthrough };
