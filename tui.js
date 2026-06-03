#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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
// Colors
// ---------------------------------------------------------------------------
const C_CYAN = '\x1b[36m';
const C_GREEN = '\x1b[32m';
const C_YELLOW = '\x1b[33m';
const C_RED = '\x1b[31m';
const C_RESET = '\x1b[0m';
const C_BOLD = '\x1b[1m';
const C_REVERSE = '\x1b[7m';

// Setup raw input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentView = 'main'; // main | status | set-active | config-options | config-models | install
let menuIndex = 0;
let message = '';
let installLogs = '';

const MAIN_MENU_ITEMS = [
  '📊 Show Status of Connectors',
  '🔄 Set Active Default Model in Grok',
  '⚙️  Configure Model Specific Options',
  '🚀 Install / Re-install Connectors',
  '❌ Exit',
];

let activeModelIndex = 0;
let configProviderIndex = 0;
let selectedProvider = NAMES[0];
let optionIndex = 0;

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
    message = `${C_GREEN}Updated default model to ${name}${C_RESET}`;
  } catch (err) {
    message = `${C_RED}Error writing config: ${err.message}${C_RESET}`;
  }
}

function updateProviderModel(name, modelName) {
  try {
    if (config.updateModelField(name, modelName)) {
      message = `${C_GREEN}Updated ${name} default model to ${modelName}${C_RESET}`;
    } else {
      message = `${C_RED}Connector ${name} configuration block not found in config.toml${C_RESET}`;
    }
  } catch (err) {
    message = `${C_RED}Error writing config: ${err.message}${C_RESET}`;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  console.clear();

  console.log(`${C_BOLD}${C_CYAN}====================================================`);
  console.log(`              Open Grok Build TUI Config            `);
  console.log(`====================================================${C_RESET}\n`);

  if (message) {
    console.log(`💡 ${message}\n`);
    message = '';
  }

  if (currentView === 'main') {
    console.log(`${C_BOLD}Main Menu:${C_RESET}\n`);
    MAIN_MENU_ITEMS.forEach((item, index) => {
      if (index === menuIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${item} ${C_RESET}`);
      } else {
        console.log(`   ${item}`);
      }
    });
    console.log(`\n${C_YELLOW}Use Arrow Keys (Up/Down) to navigate, Enter to select.${C_RESET}`);
  }

  else if (currentView === 'status') {
    console.log(`${C_BOLD}Connector Status List:${C_RESET}\n`);
    const activeGrok = config.getDefaultModel();
    console.log(`  Current Active Default in Grok: ${C_BOLD}${C_CYAN}${activeGrok}${C_RESET}\n`);
    NAMES.forEach((name) => {
      console.log(`  • ${C_BOLD}${name.toUpperCase()}${C_RESET}:`);
      console.log(`    - Status: ${statusLabel(name)}`);
      console.log(`    - Active Model: ${C_YELLOW}${config.getModelField(name)}${C_RESET}`);
    });
    console.log(`\n${C_YELLOW}Press any key (or Esc) to return to main menu.${C_RESET}`);
  }

  else if (currentView === 'set-active') {
    console.log(`${C_BOLD}Select Active Default Model for Grok Build:${C_RESET}\n`);
    const current = config.getDefaultModel();
    NAMES.forEach((name, index) => {
      const isCurrent = name === current ? ` ${C_GREEN}(Active)${C_RESET}` : '';
      if (index === activeModelIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${name.toUpperCase()} ${C_RESET}${isCurrent}`);
      } else {
        console.log(`   ${name.toUpperCase()}${isCurrent}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to cancel.${C_RESET}`);
  }

  else if (currentView === 'config-options') {
    console.log(`${C_BOLD}Select Connector to Configure Model Options:${C_RESET}\n`);
    NAMES.forEach((name, index) => {
      if (index === configProviderIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${name.toUpperCase()} ${C_RESET}`);
      } else {
        console.log(`   ${name.toUpperCase()}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to return.${C_RESET}`);
  }

  else if (currentView === 'config-models') {
    console.log(`${C_BOLD}Select Default Model for ${labelOf(selectedProvider)} Connector:${C_RESET}\n`);
    const current = config.getModelField(selectedProvider);
    modelsOf(selectedProvider).forEach((model, index) => {
      const isCurrent = model === current ? ` ${C_GREEN}(Current)${C_RESET}` : '';
      if (index === optionIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${model} ${C_RESET}${isCurrent}`);
      } else {
        console.log(`   ${model}${isCurrent}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to cancel.${C_RESET}`);
  }

  else if (currentView === 'install') {
    console.log(`${C_BOLD}Install/Re-install Connectors:${C_RESET}\n`);
    const options = [...NAMES.map(labelOf), 'Install All Connectors'];
    options.forEach((opt, index) => {
      if (index === optionIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${opt} ${C_RESET}`);
      } else {
        console.log(`   ${opt}`);
      }
    });
    if (installLogs) {
      console.log(`\n${C_BOLD}Execution Output:${C_RESET}`);
      console.log(`----------------------------------------------------`);
      console.log(installLogs.trim());
      console.log(`----------------------------------------------------`);
    }
    console.log(`\n${C_YELLOW}Press Enter to execute installation. Press Esc to return.${C_RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Install execution
// ---------------------------------------------------------------------------
function runInstaller(name) {
  installLogs = `${C_YELLOW}Running installer for ${name}...${C_RESET}\n`;
  render();

  const res = spawnSync('node', [INSTALL_PROVIDER, name], { encoding: 'utf8' });
  if (res.status === 0) {
    installLogs += `${C_GREEN}${res.stdout}${C_RESET}`;
    message = `${C_GREEN}Successfully installed ${name}!${C_RESET}`;
  } else {
    installLogs += `${C_RED}Error details:\n${res.stderr || res.stdout || 'Unknown error'}${C_RESET}`;
    message = `${C_RED}Failed to install ${name}${C_RESET}`;
  }
  render();
}

function runInstallAll() {
  installLogs = `${C_YELLOW}Installing all connectors...${C_RESET}\n\n`;
  render();

  NAMES.forEach((name) => {
    installLogs += `[${name.toUpperCase()}]\n`;
    const res = spawnSync('node', [INSTALL_PROVIDER, name], { encoding: 'utf8' });
    if (res.status === 0) {
      installLogs += `${C_GREEN}${res.stdout}${C_RESET}\n`;
    } else {
      installLogs += `${C_RED}${res.stderr || res.stdout || 'Failed'}${C_RESET}\n\n`;
    }
  });

  message = `${C_GREEN}All installation runs complete.${C_RESET}`;
  render();
}

// ---------------------------------------------------------------------------
// Keypress handling
// ---------------------------------------------------------------------------
process.stdin.on('keypress', (str, key) => {
  if (!key) return;
  if (key.ctrl && key.name === 'c') {
    process.exit();
  }

  if (key.name === 'escape') {
    if (currentView !== 'main') {
      currentView = 'main';
      installLogs = '';
      render();
      return;
    } else {
      process.exit();
    }
  }

  if (currentView === 'main') {
    if (key.name === 'up') {
      menuIndex = (menuIndex - 1 + MAIN_MENU_ITEMS.length) % MAIN_MENU_ITEMS.length;
      render();
    } else if (key.name === 'down') {
      menuIndex = (menuIndex + 1) % MAIN_MENU_ITEMS.length;
      render();
    } else if (key.name === 'return') {
      installLogs = '';
      if (menuIndex === 0) {
        currentView = 'status';
      } else if (menuIndex === 1) {
        currentView = 'set-active';
        activeModelIndex = 0;
      } else if (menuIndex === 2) {
        currentView = 'config-options';
        configProviderIndex = 0;
      } else if (menuIndex === 3) {
        currentView = 'install';
        optionIndex = 0;
      } else if (menuIndex === 4) {
        process.exit();
      }
      render();
    }
  }

  else if (currentView === 'status') {
    currentView = 'main';
    render();
  }

  else if (currentView === 'set-active') {
    if (key.name === 'up') {
      activeModelIndex = (activeModelIndex - 1 + NAMES.length) % NAMES.length;
      render();
    } else if (key.name === 'down') {
      activeModelIndex = (activeModelIndex + 1) % NAMES.length;
      render();
    } else if (key.name === 'return') {
      const selected = NAMES[activeModelIndex];
      setActiveModel(selected);
      message = `${C_GREEN}Set active Grok model to: ${selected.toUpperCase()}${C_RESET}`;
      currentView = 'main';
      render();
    }
  }

  else if (currentView === 'config-options') {
    if (key.name === 'up') {
      configProviderIndex = (configProviderIndex - 1 + NAMES.length) % NAMES.length;
      render();
    } else if (key.name === 'down') {
      configProviderIndex = (configProviderIndex + 1) % NAMES.length;
      render();
    } else if (key.name === 'return') {
      selectedProvider = NAMES[configProviderIndex];
      currentView = 'config-models';
      optionIndex = 0;
      render();
    }
  }

  else if (currentView === 'config-models') {
    const models = modelsOf(selectedProvider);
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + models.length) % models.length;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % models.length;
      render();
    } else if (key.name === 'return') {
      updateProviderModel(selectedProvider, models[optionIndex]);
      currentView = 'main';
      render();
    }
  }

  else if (currentView === 'install') {
    const total = NAMES.length + 1; // providers + "Install All"
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + total) % total;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % total;
      render();
    } else if (key.name === 'return') {
      if (optionIndex < NAMES.length) {
        runInstaller(NAMES[optionIndex]);
      } else {
        runInstallAll();
      }
    }
  }
});

// Initial render
render();
