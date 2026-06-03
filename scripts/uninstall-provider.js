#!/usr/bin/env node
'use strict';

// Single uninstall entry point used by both the TUI and potentially headless mode.
// Reverts all configuration patches and deletes launcher binaries and env keys.
//
// Usage: node scripts/uninstall-provider.js <name>

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const config = require('../providers/_shared/config');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'providers', 'providers.json'), 'utf8'),
);

const name = process.argv[2];
if (!name) {
  process.stderr.write('Usage: uninstall-provider <name>\n');
  process.exit(1);
}

const entry = manifest[name];
if (!entry) {
  process.stderr.write(`Unknown provider: ${name}\n`);
  process.exit(1);
}

try {
  // 1. Remove launcher wrapper binary
  const binaryPath = path.join(config.LOCAL_BIN, `grok-${name}`);
  if (fs.existsSync(binaryPath)) {
    fs.unlinkSync(binaryPath);
    console.log(`Removed launcher script: grok-${name}`);
  }

  // 2. Remove credentials file
  const HOME = require('os').homedir();
  const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
  const envFile = path.join(CLIPROXY_AUTH_DIR, `grok-${name}.env`);
  if (fs.existsSync(envFile)) {
    fs.unlinkSync(envFile);
    console.log(`Removed env credentials file: grok-${name}.env`);
  }

  // Clean up directory if empty
  if (fs.existsSync(CLIPROXY_AUTH_DIR)) {
    const files = fs.readdirSync(CLIPROXY_AUTH_DIR);
    if (files.length === 0) {
      fs.rmdirSync(CLIPROXY_AUTH_DIR);
      console.log('Removed empty config directory: ~/.cli-proxy-api');
    }
  }

  // 3. Remove configuration block from config.toml
  config.removeModelBlock(name);
  console.log(`Removed configuration block [model.${name}] from config.toml`);

  // 4. Custom uninstaller script if exists
  if (entry.type === 'custom') {
    const dir = path.join(ROOT, 'providers', entry.dir || name);
    const customUninstall = path.join(dir, 'lib', 'uninstall.js');
    if (fs.existsSync(customUninstall)) {
      console.log(`Running custom uninstaller for ${name}...`);
      const { spawnSync } = require('child_process');
      const res = spawnSync('node', ['lib/uninstall.js'], { cwd: dir, stdio: 'inherit' });
      if (res.status !== 0) {
        throw new Error(`Custom uninstaller failed with status ${res.status}`);
      }
    }
  }

  console.log(`Successfully uninstalled connector: ${name}`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`Failed to uninstall ${name}: ${err.message}\n`);
  process.exit(1);
}
