#!/usr/bin/env node
'use strict';

// OpenCode Go launcher: ensures the inline proxy daemon is running,
// registers with it, then execs `grok -m opencode-go <args>`.

const path = require('path');
require(path.join(__dirname, '..', 'lib', 'proxy.js'));
