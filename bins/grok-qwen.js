#!/usr/bin/env node
'use strict';
// Built from providers/providers.json by scripts/generate-bins.js.
// Do not edit by hand; update the manifest and re-run that script.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const ENV_FILE = path.join(CLIPROXY_AUTH_DIR, 'grok-' + "qwen" + '.env');

// Load env
if (fs.existsSync(ENV_FILE)) {
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    // Skip empty values so a placeholder `KEY=` line written at install time
    // does not clobber a key the user exported in their shell.
    if (m && m[2] !== '') process.env[m[1]] = m[2];
  }
}

if (!process.env["DASHSCOPE_API_KEY"]) {
  process.stderr.write('missing ' + "DASHSCOPE_API_KEY" + '. Write it to ~/.cli-proxy-api/grok-' + "qwen" + '.env as ' + "DASHSCOPE_API_KEY" + '=<key>\n');
  process.exit(1);
}

// Resolve grok binary
const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';

// Exec grok -m qwen <args>
const args = ['-m', "qwen", ...process.argv.slice(2)];
const result = spawnSync(grokBin, args, { stdio: 'inherit' });

if (result.status !== null) {
  process.exit(result.status);
} else if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(1);
}
