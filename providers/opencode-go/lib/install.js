#!/usr/bin/env node
'use strict';

// Thin entry point for standalone use. All logic is shared and manifest-driven.
const fs = require('fs');
const path = require('path');
const { installCustom } = require('../../_shared/install');

const NAME = 'opencode-go';
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'providers.json'), 'utf8'),
);
installCustom(NAME, manifest[NAME]);
