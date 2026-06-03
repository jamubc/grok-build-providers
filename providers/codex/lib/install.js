#!/usr/bin/env node
'use strict';

// Thin entry point for standalone use (install.sh). All logic is shared and
// manifest-driven; see providers/_shared/install.js and providers.json.
const fs = require('fs');
const path = require('path');
const { installCustom } = require('../../_shared/install');

const NAME = 'codex';
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'providers.json'), 'utf8'),
);
installCustom(NAME, manifest[NAME]);
