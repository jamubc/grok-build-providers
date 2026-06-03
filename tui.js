#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const readline = require('readline');

const config = require('./providers/_shared/config');

// ---------------------------------------------------------------------------
// Provider registry — everything below is driven by this manifest.
// ---------------------------------------------------------------------------
const PROVIDERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'providers', 'providers.json'), 'utf8'),
);
const NAMES = Object.keys(PROVIDERS);
const INSTALL_PROVIDER = path.join(__dirname, 'scripts', 'install-provider.js');

function labelOf(name) {
  return PROVIDERS[name].label || PROVIDERS[name].name || name;
}
function modelsOf(name) {
  return PROVIDERS[name].models || [];
}

// ---------------------------------------------------------------------------
// Headless / non-interactive mode
// ---------------------------------------------------------------------------
function installHeadless(name) {
  const res = spawnSync('node', [INSTALL_PROVIDER, name], { stdio: 'inherit' });
  return res.status ?? 1;
}

const arg = process.argv[2];
if (arg) {
  if (NAMES.includes(arg)) {
    console.log(`Running headless installer for ${arg}...`);
    process.exit(installHeadless(arg));
  } else if (arg === 'all') {
    console.log('Running headless installer for all connectors...');
    let success = true;
    for (const name of NAMES) {
      console.log(`\n--- Installing ${name.toUpperCase()} ---`);
      if (installHeadless(name) !== 0) success = false;
    }
    process.exit(success ? 0 : 1);
  } else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: open-grok-build [${NAMES.join('|')}|all]`);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    console.log(`Usage: open-grok-build [${NAMES.join('|')}|all]`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Colors & Styling (x.ai / Grok minimalist aesthetic)
// ---------------------------------------------------------------------------
const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_DIM = '\x1b[2m';

// Minimalist theme palette
const C_GRAY = '\x1b[90m';  // Dim/unselected text
const C_WHITE = '\x1b[97m'; // High contrast headlines/selected text

// Soft semantic accents (TrueColor RGB)
const C_GREEN = '\x1b[38;2;34;197;94m';  // Tailwind Green 500
const C_YELLOW = '\x1b[38;2;234;179;8m'; // Tailwind Yellow 500
const C_RED = '\x1b[38;2;239;68;68m';    // Tailwind Red 500
const C_ORANGE = '\x1b[38;2;249;115;22m'; // x.ai Orange Accent

// x.ai Purple-to-Orange Gradient Palette (representing cosmic energy / heat)
const COLOR_PURPLE = [168, 85, 247]; // #a855f7
const COLOR_ORANGE = [249, 115, 22];  // #f97316

function interpolate(start, end, factor) {
  return Math.round(start + (end - start) * factor);
}

function gradientText(text, startColor, endColor) {
  const len = text.length;
  if (len === 0) return '';
  let result = '';
  for (let i = 0; i < len; i++) {
    const factor = len > 1 ? i / (len - 1) : 0;
    const r = interpolate(startColor[0], endColor[0], factor);
    const g = interpolate(startColor[1], endColor[1], factor);
    const b = interpolate(startColor[2], endColor[2], factor);
    result += `\x1b[38;2;${r};${g};${b}m${text[i]}`;
  }
  result += '\x1b[0m';
  return result;
}

function xaiGradient(text) {
  return gradientText(text, COLOR_PURPLE, COLOR_ORANGE);
}

function animatedXaiGradient(text, tick, italicFromIndex = -1) {
  const len = text.length;
  if (len === 0) return '';
  let result = '';
  const shift = (tick % 40) / 20;
  for (let i = 0; i < len; i++) {
    const val = (i / len + shift) % 2;
    const factor = val > 1 ? 2 - val : val;
    const r = interpolate(COLOR_PURPLE[0], COLOR_ORANGE[0], factor);
    const g = interpolate(COLOR_PURPLE[1], COLOR_ORANGE[1], factor);
    const b = interpolate(COLOR_PURPLE[2], COLOR_ORANGE[2], factor);
    const isItalic = italicFromIndex !== -1 && i >= italicFromIndex;
    result += `${isItalic ? '\x1b[3m' : ''}\x1b[38;2;${r};${g};${b}m${text[i]}`;
  }
  result += '\x1b[0m';
  return result;
}

function padANSI(str, len) {
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return str + ' '.repeat(Math.max(0, len - visibleLen));
}

function renderCodeSnippet(activeName) {
  const hasActive = activeName && !['None', 'Unknown', 'Error'].includes(activeName);
  const target = hasActive ? activeName : '<connector>';

  console.log(`  ${C_GRAY}────────────────────────────────────────────────────────${C_RESET}`);
  console.log(`  ${C_GRAY}QUICK START${C_RESET}\n`);
  console.log(`  ${C_GRAY}# interactive session on the active connector${C_RESET}`);
  console.log(`  ${C_ORANGE}$${C_RESET} ${C_WHITE}grok-${target}${C_RESET}`);
  console.log('');
  console.log(`  ${C_GRAY}# one-shot prompt${C_RESET}`);
  console.log(`  ${C_ORANGE}$${C_RESET} ${C_WHITE}grok-${target}${C_RESET} ${C_GRAY}-p${C_RESET} ${C_GREEN}"explain this codebase"${C_RESET}`);
  if (!hasActive) {
    console.log('');
    console.log(`  ${C_GRAY}(set an active connector from the main menu first)${C_RESET}`);
  }
  console.log(`  ${C_GRAY}────────────────────────────────────────────────────────${C_RESET}`);
}

// Setup raw input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// ---------------------------------------------------------------------------
// State & System Diagnostics
// ---------------------------------------------------------------------------
const os = require('os');

let currentView = 'main'; // main | status | set-active | config-options | config-models | install
let menuIndex = 0;
let message = '';
let messageExpiry = 0;

// Set a transient status line. The main view repaints ~12x/s, so a message that
// cleared itself after a single render was invisible; keep it up for a few
// seconds instead.
function setMessage(msg, ms = 4000) {
  message = msg;
  messageExpiry = Date.now() + ms;
}
let installLogs = '';
let lastTaskElapsed = '';
let taskStatus = '';
let taskStartTime = 0;
let verifierProcess = null;

let animationFrame = 0;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

let bootState = 'booting'; // booting | ready
let currentBootStep = 0;
let bootLines = [];
let bootError = null;

const MAIN_MENU_ITEMS = [
  'view connector status',
  'set active connector (global)',
  'set default model (per connector)',
  'install / update connectors',
  'uninstall connectors',
  'exit',
];

let activeModelIndex = 0;
let configProviderIndex = 0;
let selectedProvider = NAMES[0];
let optionIndex = 0;

// ---------------------------------------------------------------------------
// Boot sequence steps (raw checks, no theatre)
// ---------------------------------------------------------------------------
const bootSteps = [
  {
    name: 'Loading registry manifest (providers.json)',
    run: () => {
      const registryPath = path.join(__dirname, 'providers', 'providers.json');
      if (!fs.existsSync(registryPath)) {
        throw new Error(`Registry manifest missing at ${registryPath}`);
      }
      JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
  },
  {
    name: 'Verifying connector launcher scripts',
    run: () => {
      if (!fs.existsSync(INSTALL_PROVIDER)) {
        throw new Error(`Installer script missing at ${INSTALL_PROVIDER}`);
      }
    }
  },
  {
    name: 'Checking config folder write permissions (~/.grok)',
    run: () => {
      const dir = path.dirname(config.GROK_CONFIG);
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          throw new Error(`Config folder not writeable: ${err.message}`);
        }
      } else {
        const testFile = path.join(dir, '.write-test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
        } catch (err) {
          throw new Error(`Config folder write test failed: ${err.message}`);
        }
      }
    }
  },
  {
    name: 'Verifying environment PATH integration',
    run: () => {
      const pathDirs = process.env.PATH.split(path.delimiter).map(p => path.normalize(p));
      const isBinInPath = pathDirs.includes(path.normalize(config.LOCAL_BIN));
      if (!isBinInPath) {
        return `WARNING: ${config.LOCAL_BIN} is not in your shell PATH. Launcher commands won't execute globally.`;
      }
    }
  }
];

function runBootSequence() {
  bootState = 'booting';
  currentBootStep = 0;
  bootLines = [];
  bootError = null;

  render();

  for (let i = 0; i < bootSteps.length; i++) {
    currentBootStep = i;
    const step = bootSteps[i];
    
    try {
      const result = step.run();
      if (typeof result === 'string' && result.startsWith('WARNING:')) {
        bootLines.push(` [${C_YELLOW}WARN${C_RESET}] ${step.name}`);
        bootLines.push(`        ${C_YELLOW}${result}${C_RESET}`);
      } else {
        bootLines.push(` [${C_GREEN}OK${C_RESET}] ${step.name}`);
      }
    } catch (err) {
      bootLines.push(` [${C_RED}FAIL${C_RESET}] ${step.name}`);
      bootError = err;
      render();
      return; // Stop boot sequence on failure
    }
    render();
  }

  bootState = 'ready';
  render();
}

// ---------------------------------------------------------------------------
// Config helpers (shared)
// ---------------------------------------------------------------------------
function statusLabel(name) {
  const s = config.checkStatus(name);
  if (s === 'installed') return `${C_GREEN}Installed${C_RESET}`;
  if (s === 'partial') return `${C_YELLOW}Partial${C_RESET}`;
  return `${C_RED}Not Installed${C_RESET}`;
}

function setActiveModel(name) {
  try {
    config.setDefaultModel(name);
    return true;
  } catch (err) {
    setMessage(`${C_RED}Error writing config: ${err.message}${C_RESET}`);
    return false;
  }
}

function updateProviderModel(name, modelName) {
  try {
    if (config.updateModelField(name, modelName)) {
      setMessage(`${C_GREEN}Updated ${name} default model to ${modelName}${C_RESET}`);
    } else {
      setMessage(`${C_RED}Connector ${name} configuration block not found in config.toml${C_RESET}`);
    }
  } catch (err) {
    setMessage(`${C_RED}Error writing config: ${err.message}${C_RESET}`);
  }
}

function renderDashboard() {
  const activeGrok = config.getDefaultModel();
  let installedCount = 0;
  NAMES.forEach((name) => {
    if (config.checkStatus(name) === 'installed') installedCount++;
  });

  const configExists = fs.existsSync(config.GROK_CONFIG);
  const pathDirs = process.env.PATH.split(path.delimiter).map(p => path.normalize(p));
  const isBinInPath = pathDirs.includes(path.normalize(config.LOCAL_BIN));
  
  const home = require('os').homedir();
  const shortenPath = (p) => p.startsWith(home) ? '~' + p.slice(home.length) : p;

  const configStatus = configExists ? `${C_GRAY}(exists)${C_RESET}` : `${C_YELLOW}(missing)${C_RESET}`;
  const pathStatus = isBinInPath ? `${C_GREEN}(in PATH)${C_RESET}` : `${C_RED}(not in PATH)${C_RESET}`;

  // Format default model using provider/model format (e.g. deepseek/deepseek-v4-flash)
  let modelFormat = activeGrok;
  if (activeGrok !== 'None' && activeGrok !== 'Error' && activeGrok !== 'Unknown') {
    const activeModel = config.getModelField(activeGrok);
    if (activeModel && activeModel !== 'Not Configured' && activeModel !== 'Unknown') {
      modelFormat = `${activeGrok}/${activeModel}`;
    }
  }

  const left1 = `${C_GRAY}config     :${C_RESET} ${C_WHITE}${shortenPath(config.GROK_CONFIG)}${C_RESET} ${configStatus}`;
  const right1 = `${C_GRAY}bin path   :${C_RESET} ${C_WHITE}${shortenPath(config.LOCAL_BIN)}${C_RESET} ${pathStatus}`;
  
  const left2 = `${C_GRAY}default    :${C_RESET} ${C_WHITE}${modelFormat}${C_RESET}`;
  const right2 = `${C_GRAY}connectors :${C_RESET} ${C_WHITE}${installedCount}/${NAMES.length} ready${C_RESET}`;

  const termWidth = process.stdout.columns || 80;
  const divider = C_GRAY + '─'.repeat(Math.max(20, termWidth - 4)) + C_RESET;

  if (termWidth < 80) {
    // Narrow viewport: Stack elements vertically to prevent wrapping
    console.log(`  ${left1}`);
    console.log(`  ${right1}`);
    console.log(`  ${left2}`);
    console.log(`  ${right2}`);
  } else {
    // Wide viewport: Clean two-column alignment
    const colWidth = Math.floor((termWidth - 4) / 2);
    console.log(`  ${padANSI(left1, colWidth)}${right1}`);
    console.log(`  ${padANSI(left2, colWidth)}${right2}`);
  }
  console.log(`  ${divider}\n`);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  // Use flicker-free escape code to home cursor and clear viewport
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[H\x1b[J');
  } else {
    console.clear();
  }

  const termWidth = process.stdout.columns || 80;
  const divider = C_GRAY + '─'.repeat(Math.max(20, termWidth - 4)) + C_RESET;

  // MS-DOS Diagnostics Boot Screen Layout (no fake details / "theatre")
  if (bootState === 'booting') {
    const freeGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const totalGB = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const memoryStr = `${freeGB} GB free / ${totalGB} GB total`;

    console.log(`\n  ${C_BOLD}${C_WHITE}OPEN-GROK-BUILD(R) CONFIG SYSTEM VERSION 1.0.0${C_RESET}`);
    console.log(`  ${C_GRAY}(C) Copyright 2026 jamubc. All rights reserved.${C_RESET}`);
    console.log(`  ${C_GRAY}────────────────────────────────────────────────────────${C_RESET}\n`);
    
    console.log(`  Detecting system configuration...`);
    console.log(`  OS       : ${os.type()} ${os.release()} (${os.arch()})`);
    console.log(`  Node     : ${process.version}`);
    console.log(`  Memory   : ${memoryStr}`);
    console.log(`  Terminal : ${termWidth}x${process.stdout.rows || 24}`);
    console.log('');
    console.log(`  Boot sequence:`);

    bootLines.forEach(line => {
      console.log(`  ${line}`);
    });

    if (currentBootStep < bootSteps.length && !bootError) {
      const spinner = xaiGradient(SPINNER_FRAMES[animationFrame % SPINNER_FRAMES.length]);
      console.log(`   [${spinner}] ${bootSteps[currentBootStep].name}...`);
    }

    if (bootError) {
      console.log(`\n  ${C_RED}CRITICAL BOOT ERROR: ${bootError.message}${C_RESET}`);
      console.log(`  ${C_GRAY}Press Escape or Ctrl+C to terminate session.${C_RESET}`);
    }
    
    return;
  }

  const activePointer = xaiGradient('▶');

  // open // grok build header
  console.log(`\n  \x1b[1;3m${C_WHITE}open${C_RESET}  ${C_GRAY}//${C_RESET}  ${C_BOLD}${xaiGradient('GROK BUILD')}`);
  console.log(`  ${divider}\n`);

  if (message) {
    if (Date.now() < messageExpiry) {
      console.log(`  ${C_ORANGE}status:${C_RESET} ${message}\n`);
    } else {
      message = '';
    }
  }

  if (currentView === 'main') {
    renderDashboard();

    console.log(`  ${C_BOLD}${C_WHITE}MAIN MENU${C_RESET}\n`);
    MAIN_MENU_ITEMS.forEach((item, index) => {
      const displayItem = item;
      const num = `0${index + 1}.`;
      if (index === menuIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${num} ${displayItem}${C_RESET}`);
      } else {
        console.log(`     ${C_GRAY}${num} ${displayItem}${C_RESET}`);
      }
    });
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Select  [esc/←] Cancel  ${animatedXaiGradient('[space] Launch grok', animationFrame, 8)}${C_RESET}`);
  }

  else if (currentView === 'status') {
    renderDashboard();

    // Scale columns dynamically based on terminal size
    const nameColWidth = termWidth < 65 ? 14 : 19;
    const statusColWidth = termWidth < 65 ? 14 : 18;

    const colHeader = `${C_GRAY}CONNECTOR${' '.repeat(Math.max(1, nameColWidth - 9))}STATUS${' '.repeat(Math.max(1, statusColWidth - 6))}ACTIVE MODEL${C_RESET}`;
    console.log(`  ${colHeader}`);
    console.log(`  ${divider}`);

    NAMES.forEach((name) => {
      const s = config.checkStatus(name);
      
      let statusText = 'offline';
      let statusColor = C_GRAY;
      let symbol = '○';
      if (s === 'installed') {
        statusText = 'ready';
        statusColor = C_GREEN;
        symbol = '●';
      } else if (s === 'partial') {
        statusText = 'partial';
        statusColor = C_YELLOW;
        symbol = '▲';
      }
      
      const rawStatus = `${symbol} ${statusText}`;
      const statusPart = `${statusColor}${rawStatus}${C_RESET}${' '.repeat(Math.max(1, statusColWidth - rawStatus.length))}`;
      
      const nameText = name.toUpperCase();
      const namePart = `  ${C_BOLD}${C_WHITE}${nameText}${C_RESET}${' '.repeat(Math.max(1, nameColWidth - nameText.length))}`;
      
      const activeModel = config.getModelField(name);
      let modelText = activeModel;
      let modelColor = C_WHITE;
      if (activeModel === 'Not Configured' || activeModel === 'Unknown' || s === 'missing') {
        modelText = '—';
        modelColor = C_GRAY;
      }
      const modelPart = `${modelColor}${modelText}${C_RESET}`;
      
      console.log(`${namePart}${statusPart}${modelPart}`);
    });

    console.log('');
    const activeGrok = config.getDefaultModel();
    renderCodeSnippet(activeGrok);
    console.log(`\n  ${C_GRAY}Press [v] to run live verification, or any other key to return to main menu.${C_RESET}`);
  }

  else if (currentView === 'set-active') {
    console.log(`  ${C_BOLD}${C_WHITE}SET ACTIVE CONNECTOR (GLOBAL)${C_RESET}\n`);
    const current = config.getDefaultModel();
    NAMES.forEach((name, index) => {
      const isCurrent = name === current ? `  ${C_GRAY}(active)${C_RESET}` : '';
      if (index === activeModelIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${name.toUpperCase()}${C_RESET}${isCurrent}`);
      } else {
        console.log(`     ${C_GRAY}${name.toUpperCase()}${C_RESET}${isCurrent}`);
      }
    });
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Select  [esc/←] Cancel${C_RESET}`);
  }

  else if (currentView === 'config-options') {
    console.log(`  ${C_BOLD}${C_WHITE}SET DEFAULT MODEL (PER CONNECTOR)${C_RESET}\n`);
    NAMES.forEach((name, index) => {
      if (index === configProviderIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${name.toUpperCase()}${C_RESET}`);
      } else {
        console.log(`     ${C_GRAY}${name.toUpperCase()}${C_RESET}`);
      }
    });
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Select  [esc/←] Return${C_RESET}`);
  }

  else if (currentView === 'config-models') {
    console.log(`  ${C_BOLD}${C_WHITE}SELECT DEFAULT MODEL FOR ${labelOf(selectedProvider).toUpperCase()}${C_RESET}\n`);
    const current = config.getModelField(selectedProvider);
    modelsOf(selectedProvider).forEach((model, index) => {
      const isCurrent = model === current ? `  ${C_GRAY}(current)${C_RESET}` : '';
      if (index === optionIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${model}${C_RESET}${isCurrent}`);
      } else {
        console.log(`     ${C_GRAY}${model}${C_RESET}${isCurrent}`);
      }
    });
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Select  [esc/←] Cancel${C_RESET}`);
  }

  else if (currentView === 'install') {
    console.log(`  ${C_BOLD}${C_WHITE}INSTALL / UPDATE CONNECTORS${C_RESET}\n`);
    const options = [...NAMES.map(labelOf), 'Install All Connectors'];
    options.forEach((opt, index) => {
      if (index === optionIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${opt}${C_RESET}`);
      } else {
        console.log(`     ${C_GRAY}${opt}${C_RESET}`);
      }
    });
    if (installLogs) {
      let elapsedStr = '';
      if (taskStatus === 'Running verification...') {
        const spinner = xaiGradient(SPINNER_FRAMES[animationFrame % SPINNER_FRAMES.length]);
        elapsedStr = `  ${C_GRAY}[${spinner}]${C_RESET}`;
      } else if (lastTaskElapsed) {
        elapsedStr = `  ${C_GRAY}[${lastTaskElapsed}]${C_RESET}`;
      }
      const statusStr = taskStatus ? `  ${taskStatus}` : '';
      console.log(`\n  ${C_BOLD}${C_WHITE}Task${C_RESET}${elapsedStr}${statusStr}`);
      console.log(`  ${divider}`);
      const indentedLogs = installLogs.trim().split('\n').map(line => `    ${C_GRAY}${line.replace(/\x1b\[0m/g, C_RESET + C_GRAY)}${C_RESET}`).join('\n');
      console.log(indentedLogs);
      console.log(`  ${divider}`);
    }
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Execute  [v] Verify  [esc/←] Return${C_RESET}`);
  }

  else if (currentView === 'uninstall') {
    console.log(`  ${C_BOLD}${C_WHITE}UNINSTALL CONNECTORS${C_RESET}\n`);
    const options = [...NAMES.map(labelOf), 'Uninstall All Connectors'];
    options.forEach((opt, index) => {
      if (index === optionIndex) {
        console.log(`  ${activePointer}  ${C_BOLD}${C_WHITE}${opt}${C_RESET}`);
      } else {
        console.log(`     ${C_GRAY}${opt}${C_RESET}`);
      }
    });
    if (installLogs) {
      let elapsedStr = '';
      if (taskStatus === 'Running verification...') {
        const spinner = xaiGradient(SPINNER_FRAMES[animationFrame % SPINNER_FRAMES.length]);
        elapsedStr = `  ${C_GRAY}[${spinner}]${C_RESET}`;
      } else if (lastTaskElapsed) {
        elapsedStr = `  ${C_GRAY}[${lastTaskElapsed}]${C_RESET}`;
      }
      const statusStr = taskStatus ? `  ${taskStatus}` : '';
      console.log(`\n  ${C_BOLD}${C_WHITE}Task${C_RESET}${elapsedStr}${statusStr}`);
      console.log(`  ${divider}`);
      const indentedLogs = installLogs.trim().split('\n').map(line => `    ${C_GRAY}${line.replace(/\x1b\[0m/g, C_RESET + C_GRAY)}${C_RESET}`).join('\n');
      console.log(indentedLogs);
      console.log(`  ${divider}`);
    }
    console.log(`\n  ${C_GRAY}[↑/↓] Navigate  [enter/→] Execute  [v] Verify  [esc/←] Return${C_RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Install execution
// ---------------------------------------------------------------------------
async function runSanityCheck(name, baseLogs = '') {
  const HOME = require('os').homedir();
  const binaryPath = path.join(config.LOCAL_BIN, `grok-${name}`);
  const envFile = path.join(HOME, '.cli-proxy-api', `grok-${name}.env`);
  
  // Resolve the environment key name
  const providerEntry = PROVIDERS[name] || {};
  const envKey = providerEntry.envKey || `GROK_${name.toUpperCase()}_PROXY_API_KEY`;
  
  const yieldTick = () => new Promise(resolve => setImmediate(resolve));
  const startTime = performance.now();

  let logs = [];
  logs.push(`Running sanity check for connector '${name}'...`);
  
  installLogs = baseLogs + logs.join('\n');
  render();
  await yieldTick();
  
  // 1. Launcher check
  let launcherExists = false;
  let launcherSize = 0;
  let launcherMode = '';
  try {
    const stats = await fs.promises.stat(binaryPath);
    launcherExists = true;
    launcherSize = stats.size;
    launcherMode = (stats.mode & 0o777).toString(8);
  } catch (_) {}

  if (launcherExists) {
    logs.push(`  ├── ${C_GREEN}✔ [PASS] Launcher script found at: ~/.local/bin/grok-${name}${C_RESET}`);
    logs.push(`  │   |_ ${C_GREEN}checked: ~/.local/bin/grok-${name} (size: ${launcherSize} B, mode: 0${launcherMode})${C_RESET}`);
  } else {
    logs.push(`  ├── ${C_RED}✘ [FAIL] Launcher script NOT found at: ~/.local/bin/grok-${name}${C_RESET}`);
    logs.push(`  │   |_ checked: ~/.local/bin/grok-${name}`);
    logs.push(`  │   |_ suggestion: ${C_GREEN}select "install / update connectors" in the main menu to install the launcher${C_RESET}`);
  }
  
  installLogs = baseLogs + logs.join('\n');
  let elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();
  
  // 2. Config check
  let configExists = false;
  let hasBlock = false;
  let tomlSize = 0;
  let tomlMode = '';
  try {
    const stats = await fs.promises.stat(config.GROK_CONFIG);
    configExists = true;
    tomlSize = stats.size;
    tomlMode = (stats.mode & 0o777).toString(8);
  } catch (_) {}

  if (configExists) {
    try {
      const toml = await fs.promises.readFile(config.GROK_CONFIG, 'utf8');
      const linesCount = toml.split(/\r?\n/).length;
      if (toml.includes(`[model.${name}]`)) {
        hasBlock = true;
        logs.push(`  ├── ${C_GREEN}✔ [PASS] config.toml contains block: [model.${name}]${C_RESET}`);
        logs.push(`  │   |_ ${C_GREEN}checked: ${linesCount} of ${linesCount} lines (size: ${tomlSize} B, mode: 0${tomlMode})${C_RESET}`);
        const re = new RegExp(`\\[model\\.${name}\\][^\\[]*?model\\s*=\\s*"([^"]+)"`);
        const match = toml.match(re);
        if (match) {
          logs.push(`  │   |_ ${C_GREEN}configured model: ${match[1]}${C_RESET}`);
        }
        
        // Grab and format preview of the matched block
        const reFull = new RegExp(`\\[model\\.${name}\\][^\\[]*`);
        const blockMatch = toml.match(reFull);
        if (blockMatch) {
          logs.push(`  │   ${C_GREEN}──[ preview ]──────────────────────────${C_RESET}`);
          const blockLines = blockMatch[0].trim().split('\n');
          blockLines.forEach(line => {
            logs.push(`  │   ${C_GREEN}| ${line}${C_RESET}`);
          });
          logs.push(`  │   ${C_GREEN}────────────────────────────────────────${C_RESET}`);
        }
      } else {
        logs.push(`  ├── ${C_RED}✘ [FAIL] config.toml is missing block: [model.${name}]${C_RESET}`);
        logs.push(`  │   |_ checked: ${linesCount} of ${linesCount} lines (size: ${tomlSize} B, mode: 0${tomlMode})`);
        logs.push(`  │   |_ suggestion: ${C_GREEN}select "install / update connectors" in the main menu to patch config.toml${C_RESET}`);
      }
    } catch (err) {
      logs.push(`  ├── ${C_RED}✘ [FAIL] failed to read config.toml: ${err.message}${C_RESET}`);
    }
  } else {
    logs.push(`  ├── ${C_RED}✘ [FAIL] config.toml not found at: ${config.GROK_CONFIG}${C_RESET}`);
    logs.push(`  │   |_ checked: 0 lines`);
    logs.push(`  │   |_ suggestion: ${C_GREEN}select "install / update connectors" in the main menu to create config.toml${C_RESET}`);
  }
  
  installLogs = baseLogs + logs.join('\n');
  elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();
  
  // 3. Env file check (last first-level child)
  let envFileExists = false;
  let envSize = 0;
  let envMode = '';
  try {
    const stats = await fs.promises.stat(envFile);
    envFileExists = true;
    envSize = stats.size;
    envMode = (stats.mode & 0o777).toString(8);
  } catch (_) {}

  if (envFileExists) {
    logs.push(`  └── ${C_GREEN}✔ [PASS] Env credentials file found at: ~/.cli-proxy-api/grok-${name}.env${C_RESET}`);
    logs.push(`      |_ ${C_GREEN}checked: ~/.cli-proxy-api/grok-${name}.env (size: ${envSize} B, mode: 0${envMode})${C_RESET}`);
  } else {
    logs.push(`  └── ${C_RED}✘ [FAIL] Env credentials file NOT found at: ~/.cli-proxy-api/grok-${name}.env${C_RESET}`);
    logs.push(`      |_ checked: ~/.cli-proxy-api/grok-${name}.env`);
    logs.push(`      |_ suggestion: ${C_GREEN}run 'export ${envKey}="<your_api_key>"' to configure it${C_RESET}`);
  }
  
  installLogs = baseLogs + logs.join('\n');
  elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();

  return { launcherExists, hasBlock, allPassed: launcherExists && hasBlock && envFileExists };
}

async function runInstaller(name) {
  const startTime = Date.now();
  installLogs = `${C_YELLOW}Running installer for ${name}...${C_RESET}\n`;
  taskStatus = 'Running installer...';
  render();

  const res = spawnSync('node', [INSTALL_PROVIDER, name], { encoding: 'utf8' });
  lastTaskElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (res.status === 0) {
    installLogs += `${C_GREEN}${res.stdout}${C_RESET}\n`;
    setMessage(`${C_GREEN}Successfully installed ${name}!${C_RESET}`);
    taskStatus = 'Running sanity check...';
    render();
    const checkResult = await runSanityCheck(name, installLogs);
    if (checkResult.allPassed) {
      taskStatus = `${C_GREEN}Successfully installed!${C_RESET}`;
    } else {
      taskStatus = `${C_YELLOW}Installed with warnings${C_RESET}`;
    }
    render();
  } else {
    installLogs += `${C_RED}Error details:\n${res.stderr || res.stdout || 'Unknown error'}${C_RESET}`;
    setMessage(`${C_RED}Failed to install ${name}${C_RESET}`);
    taskStatus = `${C_RED}Failed to install${C_RESET}`;
    render();
  }
}

async function runInstallAll() {
  const startTime = Date.now();
  installLogs = `${C_YELLOW}Installing all connectors...${C_RESET}\n\n`;
  taskStatus = 'Running installers...';
  render();

  for (const name of NAMES) {
    installLogs += `[${name.toUpperCase()}]\n`;
    render();
    const res = spawnSync('node', [INSTALL_PROVIDER, name], { encoding: 'utf8' });
    if (res.status === 0) {
      installLogs += `${C_GREEN}${res.stdout}${C_RESET}\n`;
      render();
      await runSanityCheck(name, installLogs);
      installLogs += '\n';
    } else {
      installLogs += `${C_RED}Failed to install ${name}: ${res.stderr || res.stdout || 'Unknown error'}${C_RESET}\n\n`;
      render();
    }
  }

  lastTaskElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  setMessage(`${C_GREEN}All installation runs complete.${C_RESET}`);
  taskStatus = `${C_GREEN}All installations complete!${C_RESET}`;
  render();
}

async function runVerifier(name, baseLogs = '') {
  const HOME = require('os').homedir();
  const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
  const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';

  // Check if grok binary is available
  let grokExists = fs.existsSync(grokLocal);
  if (!grokExists) {
    const check = spawnSync('which', ['grok'], { encoding: 'utf8' });
    if (check.status === 0) {
      grokExists = true;
    }
  }

  if (!grokExists) {
    installLogs = `${C_RED}Error: Main command 'grok' not found in PATH or ~/.grok/bin/grok.${C_RESET}\n`;
    lastTaskElapsed = '';
    taskStatus = 'Failed';
    render();
    return;
  }

  // Pre-check: always run the sanity check progressively first!
  const { launcherExists, hasBlock } = await runSanityCheck(name, baseLogs);

  if (!launcherExists || !hasBlock) {
    taskStatus = `${C_RED}Error: did you install?${C_RESET}`;
    render();
    return;
  }

  return new Promise((resolve) => {
    taskStartTime = Date.now();
    lastTaskElapsed = '0.00';
    taskStatus = 'Running verification...';
    const launcherBin = path.join(HOME, '.local', 'bin', `grok-${name}`);
    installLogs += `\n\nExecuting: grok-${name} -p 'Say ok'\n\n`;
    render();

    const child = spawn(launcherBin, ['-p', 'Say ok'], {
      env: { ...process.env } // inherit env keys
    });
    verifierProcess = child;

    child.stdout.on('data', (data) => {
      installLogs += data.toString();
      render();
    });

    child.stderr.on('data', (data) => {
      installLogs += data.toString();
      render();
    });

    child.on('close', (code) => {
      verifierProcess = null;
      lastTaskElapsed = ((Date.now() - taskStartTime) / 1000).toFixed(2);
      if (taskStatus === 'Running verification...') {
        if (code === 0) {
          taskStatus = `${C_GREEN}Verification command succeeded!${C_RESET}`;
        } else {
          taskStatus = `${C_RED}Verification command failed (exit code ${code}).${C_RESET}`;
          if (!installLogs.includes('API key')) {
            installLogs += `\n${C_RED}Please check your API key in ~/.cli-proxy-api/grok-${name}.env${C_RESET}\n`;
          }
        }
      }
      render();
      resolve();
    });
  });
}

async function runVerifierAll() {
  const startTime = Date.now();
  installLogs = '';
  taskStatus = 'Running verifications...';
  render();

  for (const name of NAMES) {
    installLogs += `[VERIFYING ${name.toUpperCase()}]\n`;
    render();
    await runVerifier(name, installLogs);
    installLogs += '\n\n';
    render();
  }

  lastTaskElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  taskStatus = `${C_GREEN}All verifications complete!${C_RESET}`;
  render();
}

// ---------------------------------------------------------------------------
// Uninstall execution
// ---------------------------------------------------------------------------
const UNINSTALL_PROVIDER = path.join(__dirname, 'scripts', 'uninstall-provider.js');

async function runUninstallerAsync(name, baseLogs = '') {
  const HOME = require('os').homedir();
  const binaryPath = path.join(config.LOCAL_BIN, `grok-${name}`);
  const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
  const envFile = path.join(CLIPROXY_AUTH_DIR, `grok-${name}.env`);
  const providerEntry = PROVIDERS[name] || {};
  
  const yieldTick = () => new Promise(resolve => setImmediate(resolve));
  const startTime = performance.now();

  let logs = [];
  logs.push(`Uninstalling connector '${name}'...`);
  
  installLogs = baseLogs + logs.join('\n');
  render();
  await yieldTick();

  // 1. Launcher script check/delete
  let launcherSize = 0;
  let launcherExists = false;
  try {
    const stats = await fs.promises.stat(binaryPath);
    launcherSize = stats.size;
    launcherExists = true;
  } catch (_) {}

  if (launcherExists) {
    try {
      await fs.promises.unlink(binaryPath);
      logs.push(`  ├── ${C_GREEN}✔ [PASS] Removed launcher script: ~/.local/bin/grok-${name} (freed: ${launcherSize} B)${C_RESET}`);
    } catch (err) {
      logs.push(`  ├── ${C_RED}✘ [FAIL] Failed to remove launcher script: ${err.message}${C_RESET}`);
    }
  } else {
    logs.push(`  ├── ${C_GRAY}○ [SKIP] Launcher script not found at: ~/.local/bin/grok-${name}${C_RESET}`);
  }

  installLogs = baseLogs + logs.join('\n');
  let elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();

  // 2. Config check/remove block
  let configExists = false;
  let blockLines = 0;
  try {
    await fs.promises.access(config.GROK_CONFIG);
    configExists = true;
  } catch (_) {}

  if (configExists) {
    try {
      const toml = await fs.promises.readFile(config.GROK_CONFIG, 'utf8');
      if (toml.includes(`[model.${name}]`)) {
        // Count how many lines are in the block
        const reFull = new RegExp(`\\[model\\.${name}\\][^\\[]*`);
        const blockMatch = toml.match(reFull);
        if (blockMatch) {
          blockLines = blockMatch[0].trim().split('\n').length;
        }
        
        // Remove block
        config.removeModelBlock(name);
        logs.push(`  ├── ${C_GREEN}✔ [PASS] Removed configuration block [model.${name}] from config.toml (cleaned: ${blockLines} lines)${C_RESET}`);
      } else {
        logs.push(`  ├── ${C_GRAY}○ [SKIP] config.toml already missing block: [model.${name}]${C_RESET}`);
      }
    } catch (err) {
      logs.push(`  ├── ${C_RED}✘ [FAIL] Failed to modify config.toml: ${err.message}${C_RESET}`);
    }
  } else {
    logs.push(`  ├── ${C_GRAY}○ [SKIP] config.toml not found at: ${config.GROK_CONFIG}${C_RESET}`);
  }

  installLogs = baseLogs + logs.join('\n');
  elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();

  // 3. Env credentials check/delete
  let envSize = 0;
  let envExists = false;
  try {
    const stats = await fs.promises.stat(envFile);
    envSize = stats.size;
    envExists = true;
  } catch (_) {}

  if (envExists) {
    try {
      await fs.promises.unlink(envFile);
      logs.push(`  ├── ${C_GREEN}✔ [PASS] Removed env credentials file: ~/.cli-proxy-api/grok-${name}.env (freed: ${envSize} B)${C_RESET}`);
    } catch (err) {
      logs.push(`  ├── ${C_RED}✘ [FAIL] Failed to remove env credentials file: ${err.message}${C_RESET}`);
    }
  } else {
    logs.push(`  ├── ${C_GRAY}○ [SKIP] Env credentials file not found at: ~/.cli-proxy-api/grok-${name}.env${C_RESET}`);
  }

  // Clean up directory if empty
  try {
    const files = await fs.promises.readdir(CLIPROXY_AUTH_DIR);
    if (files.length === 0) {
      await fs.promises.rmdir(CLIPROXY_AUTH_DIR);
      logs.push(`  ├── ${C_GREEN}✔ [PASS] Removed empty config directory: ~/.cli-proxy-api${C_RESET}`);
    }
  } catch (_) {}

  installLogs = baseLogs + logs.join('\n');
  elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();

  // 4. Custom uninstaller script if exists
  if (providerEntry.type === 'custom') {
    const dir = path.join(__dirname, 'providers', providerEntry.dir || name);
    const customUninstall = path.join(dir, 'lib', 'uninstall.js');
    let customExists = false;
    try {
      await fs.promises.access(customUninstall);
      customExists = true;
    } catch (_) {}

    if (customExists) {
      logs.push(`  ├── Running custom uninstaller hook...`);
      installLogs = baseLogs + logs.join('\n');
      render();
      await yieldTick();

      const { spawnSync } = require('child_process');
      const res = spawnSync('node', ['lib/uninstall.js'], { cwd: dir, encoding: 'utf8' });
      if (res.status === 0) {
        logs.push(`  └── ${C_GREEN}✔ [PASS] Custom uninstaller hook succeeded: ${res.stdout.trim()}${C_RESET}`);
      } else {
        logs.push(`  └── ${C_RED}✘ [FAIL] Custom uninstaller hook failed (exit ${res.status}): ${res.stderr || res.stdout}${C_RESET}`);
      }
    } else {
      logs.push(`  └── ${C_GRAY}○ [SKIP] No custom uninstaller hook to execute${C_RESET}`);
    }
  } else {
    // If it's the last item and we didn't do custom uninstaller, we should change the previous node symbol to └──
    if (logs.length > 0) {
      const lastIdx = logs.length - 1;
      if (logs[lastIdx].startsWith('  ├──')) {
        logs[lastIdx] = logs[lastIdx].replace('  ├──', '  └──');
      }
    }
  }

  installLogs = baseLogs + logs.join('\n');
  elapsedSecs = (performance.now() - startTime) / 1000;
  lastTaskElapsed = elapsedSecs < 0.01 ? '0.01' : elapsedSecs.toFixed(2);
  render();
  await yieldTick();
}

async function runUninstaller(name) {
  const startTime = Date.now();
  installLogs = '';
  taskStatus = 'Running uninstaller...';
  render();

  await runUninstallerAsync(name);
  lastTaskElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  taskStatus = `${C_GREEN}Successfully uninstalled ${name}!${C_RESET}`;
  render();
}

async function runUninstallAll() {
  const startTime = Date.now();
  installLogs = '';
  taskStatus = 'Running uninstallers...';
  render();

  for (const name of NAMES) {
    await runUninstallerAsync(name, installLogs + '\n');
    installLogs += '\n';
  }

  lastTaskElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  taskStatus = `${C_GREEN}All uninstallation runs complete.${C_RESET}`;
  render();
}

// ---------------------------------------------------------------------------
// Spawn/Launch grok interactively
// ---------------------------------------------------------------------------
function launchGrok() {
  const active = config.getDefaultModel();

  // Custom connectors (agy/codex) only work through their `grok-<name>` wrapper,
  // which starts the local proxy daemon before launching grok. Launching the raw
  // `grok` binary against such a connector hits a dead port and spins on
  // "retrying". The wrapper is the correct entry point for every connector type
  // (passthrough wrappers simply exec `grok -m <name>`), so prefer it.
  const HOME = require('os').homedir();
  const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
  const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';

  let cmd = grokBin;
  let args = [];
  let launchedVia = 'grok';
  const hasActive = active && active !== 'None' && active !== 'Unknown' && active !== 'Error';
  if (hasActive) {
    const wrapper = path.join(config.LOCAL_BIN, `grok-${active}`);
    if (fs.existsSync(wrapper)) {
      cmd = wrapper;
      launchedVia = `grok-${active}`;
    } else {
      // Connector selected but not installed: warn instead of launching into a
      // guaranteed failure.
      setMessage(`${C_YELLOW}${active.toUpperCase()} is not installed yet — install it before launching${C_RESET}`, 6000);
      render();
      return;
    }
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[H\x1b[J');
  } else {
    console.clear();
  }

  console.log(`${C_GRAY}Launching ${launchedVia} session...${C_RESET}\n`);

  spawnSync(cmd, args, { stdio: 'inherit' });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  render();
}

// ---------------------------------------------------------------------------
// Keypress handling
// ---------------------------------------------------------------------------
process.stdin.on('keypress', (str, key) => {
  if (!key) return;
  if (key.ctrl && key.name === 'c') {
    cleanupAndExit();
  }

  // Treat 'left' arrow key as escape (back / cancel)
  // and 'right' arrow key as return (select / enter)
  const keyName = (key.name === 'left') ? 'escape' : (key.name === 'right') ? 'return' : key.name;

  if (keyName === 'escape' && bootState === 'booting' && bootError) {
    cleanupAndExit();
  }

  // Prevent input buffering or menu interaction during DOS booting sequence
  if (bootState === 'booting') {
    return;
  }

  // Prevent input buffering during active task verification, EXCEPT escape to cancel/kill
  if (taskStatus === 'Running verification...') {
    if (keyName === 'escape') {
      if (verifierProcess) {
        verifierProcess.kill('SIGINT');
        verifierProcess = null;
      }
      taskStatus = `${C_RED}Verification cancelled by user.${C_RESET}`;
      installLogs += `\n${C_RED}Process terminated by user.${C_RESET}\n`;
      render();
    }
    return;
  }

  if (keyName === 'escape') {
    if (currentView !== 'main') {
      currentView = 'main';
      installLogs = '';
      render();
      return;
    } else {
      cleanupAndExit();
    }
  }

  if (currentView === 'main') {
    if (keyName === 'up') {
      menuIndex = (menuIndex - 1 + MAIN_MENU_ITEMS.length) % MAIN_MENU_ITEMS.length;
      render();
    } else if (keyName === 'down') {
      menuIndex = (menuIndex + 1) % MAIN_MENU_ITEMS.length;
      render();
    } else if (keyName === 'space' || str === ' ') {
      launchGrok();
    } else if (keyName === 'return') {
      installLogs = '';
      if (menuIndex === 0) {
        currentView = 'status';
      } else if (menuIndex === 1) {
        currentView = 'set-active';
        activeModelIndex = 0;
      } else if (menuIndex === 2) {
        // Always pick the connector first so any connector's model can be
        // configured, not just the currently-active one. Preselect the active
        // connector for convenience.
        const activeGrok = config.getDefaultModel();
        const activeIdx = NAMES.indexOf(activeGrok);
        configProviderIndex = activeIdx >= 0 ? activeIdx : 0;
        currentView = 'config-options';
      } else if (menuIndex === 3) {
        currentView = 'install';
        optionIndex = 0;
      } else if (menuIndex === 4) {
        currentView = 'uninstall';
        optionIndex = 0;
      } else if (menuIndex === 5) {
        cleanupAndExit();
      }
      render();
    }
  }

  else if (currentView === 'status') {
    if (keyName === 'v' || (key && key.name === 'v') || str === 'v') {
      currentView = 'install';
      runVerifierAll();
      return;
    }
    currentView = 'main';
    render();
  }

  else if (currentView === 'set-active') {
    if (keyName === 'up') {
      activeModelIndex = (activeModelIndex - 1 + NAMES.length) % NAMES.length;
      render();
    } else if (keyName === 'down') {
      activeModelIndex = (activeModelIndex + 1) % NAMES.length;
      render();
    } else if (keyName === 'return') {
      const selected = NAMES[activeModelIndex];
      if (setActiveModel(selected)) {
        const installed = config.checkStatus(selected) === 'installed';
        if (installed) {
          setMessage(`${C_GREEN}Active connector set to ${selected.toUpperCase()} — press [space] to launch${C_RESET}`);
        } else {
          setMessage(`${C_YELLOW}Active connector set to ${selected.toUpperCase()}, but it isn't installed yet — install it first${C_RESET}`, 6000);
        }
      }
      currentView = 'main';
      render();
    }
  }

  else if (currentView === 'config-options') {
    if (keyName === 'up') {
      configProviderIndex = (configProviderIndex - 1 + NAMES.length) % NAMES.length;
      render();
    } else if (keyName === 'down') {
      configProviderIndex = (configProviderIndex + 1) % NAMES.length;
      render();
    } else if (keyName === 'return') {
      selectedProvider = NAMES[configProviderIndex];
      currentView = 'config-models';
      optionIndex = 0;
      render();
    }
  }

  else if (currentView === 'config-models') {
    const models = modelsOf(selectedProvider);
    if (keyName === 'up') {
      optionIndex = (optionIndex - 1 + models.length) % models.length;
      render();
    } else if (keyName === 'down') {
      optionIndex = (optionIndex + 1) % models.length;
      render();
    } else if (keyName === 'return') {
      updateProviderModel(selectedProvider, models[optionIndex]);
      currentView = 'main';
      render();
    }
  }

  else if (currentView === 'install') {
    const total = NAMES.length + 1; // providers + "Install All"
    if (keyName === 'up') {
      optionIndex = (optionIndex - 1 + total) % total;
      render();
    } else if (keyName === 'down') {
      optionIndex = (optionIndex + 1) % total;
      render();
    } else if (keyName === 'v' || key.name === 'v') {
      if (optionIndex < NAMES.length) {
        runVerifier(NAMES[optionIndex]);
      } else {
        runVerifierAll();
      }
    } else if (keyName === 'return') {
      if (optionIndex < NAMES.length) {
        runInstaller(NAMES[optionIndex]);
      } else {
        runInstallAll();
      }
    }
  }

  else if (currentView === 'uninstall') {
    const total = NAMES.length + 1; // providers + "Uninstall All"
    if (keyName === 'up') {
      optionIndex = (optionIndex - 1 + total) % total;
      render();
    } else if (keyName === 'down') {
      optionIndex = (optionIndex + 1) % total;
      render();
    } else if (keyName === 'v' || key.name === 'v') {
      if (optionIndex < NAMES.length) {
        runVerifier(NAMES[optionIndex]);
      } else {
        runVerifierAll();
      }
    } else if (keyName === 'return') {
      if (optionIndex < NAMES.length) {
        runUninstaller(NAMES[optionIndex]);
      } else {
        runUninstallAll();
      }
    }
  }
});

// Helper to safely stop timer and exit
function cleanupAndExit() {
  clearInterval(animationTimer);
  process.exit(0);
}

// Listen to terminal resizing events for instant layout adaptability
process.stdout.on('resize', () => {
  render();
});

// Start loop for animations (spinner/gradient runs at ~12.5 FPS during boot loading or on main screen)
const animationTimer = setInterval(() => {
  animationFrame = (animationFrame + 1) % 240;
  if (bootState === 'booting' || currentView === 'main' || taskStatus === 'Running verification...') {
    if (taskStatus === 'Running verification...') {
      lastTaskElapsed = ((Date.now() - taskStartTime) / 1000).toFixed(2);
    }
    render();
  }
}, 80);

process.on('exit', () => {
  clearInterval(animationTimer);
});

// Kick off the diagnostics bootloader
runBootSequence();
