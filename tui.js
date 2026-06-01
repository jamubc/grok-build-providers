#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();
const GROK_CONFIG = path.join(HOME, '.grok', 'config.toml');
const CLIPROXY_AUTH_DIR = path.join(HOME, '.cli-proxy-api');

// Color codes
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
// Main Menu State
// ---------------------------------------------------------------------------
let currentView = 'main'; // 'main', 'set-active', 'install', 'config-options', 'status'
let menuIndex = 0;
let message = '';
let installLogs = '';

const MAIN_MENU_ITEMS = [
  '📊 Show Status of Connectors',
  '🔄 Set Active Default Model in Grok',
  '⚙️  Configure Model Specific Options',
  '🚀 Install / Re-install Connectors',
  '❌ Exit'
];

let activeModels = ['agy', 'codex', 'deepseek'];
let activeModelIndex = 0;

let configModelIndex = 0;
const CONFIG_MODELS = ['agy', 'codex', 'deepseek'];

// Model options state
let agyModels = ['gemini-3.5-flash', 'gemini-3-pro', 'gemini-3-pro-thinking', 'gemini-2.5-pro', 'gemini-2.5-flash'];
let codexModels = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'];
let deepseekModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];

// ---------------------------------------------------------------------------
// Config Helpers
// ---------------------------------------------------------------------------
function getGrokDefaultModel() {
  if (!fs.existsSync(GROK_CONFIG)) return 'None';
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const m = toml.match(/^default\s*=\s*"([^"]+)"/m);
    return m ? m[1] : 'None';
  } catch {
    return 'Error';
  }
}

function setGrokDefaultModel(model) {
  if (!fs.existsSync(GROK_CONFIG)) {
    fs.mkdirSync(path.dirname(GROK_CONFIG), { recursive: true });
    fs.writeFileSync(GROK_CONFIG, `[models]\ndefault = "${model}"\n`, 'utf8');
    return;
  }
  try {
    let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    if (/^default\s*=\s*/m.test(toml)) {
      toml = toml.replace(/^default\s*=\s*"[^"]*"/m, `default = "${model}"`);
    } else if (/^\[models\]/m.test(toml)) {
      toml = toml.replace(/^\[models\]/m, `[models]\ndefault = "${model}"`);
    } else {
      toml = `[models]\ndefault = "${model}"\n\n` + toml;
    }
    fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
  } catch (err) {
    message = `${C_RED}Error updating default model: ${err.message}${C_RESET}`;
  }
}

function getSubmoduleModel(tool) {
  if (!fs.existsSync(GROK_CONFIG)) return 'Unknown';
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const re = new RegExp(`\\[model\\.${tool}\\][\\s\\S]*?model\\s*=\\s*"([^"]+)"`);
    const m = toml.match(re);
    return m ? m[1] : 'Not Configured';
  } catch {
    return 'Error';
  }
}

function updateSubmoduleModel(tool, modelName) {
  if (!fs.existsSync(GROK_CONFIG)) return;
  try {
    let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const re = new RegExp(`(\\[model\\.${tool}\\][\\s\\S]*?model\\s*=\\s*")[^"]+(")`);
    if (re.test(toml)) {
      toml = toml.replace(re, `$1${modelName}$2`);
      fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
      message = `${C_GREEN}Updated ${tool} default model to ${modelName}${C_RESET}`;
    } else {
      message = `${C_RED}Submodule ${tool} configuration block not found in config.toml${C_RESET}`;
    }
  } catch (err) {
    message = `${C_RED}Error updating: ${err.message}${C_RESET}`;
  }
}

function checkInstallationStatus(tool) {
  const binaryPath = path.join(HOME, '.local', 'bin', `grok-${tool}`);
  const hasWrapper = fs.existsSync(binaryPath);
  
  let hasConfig = false;
  if (fs.existsSync(GROK_CONFIG)) {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    hasConfig = new RegExp(`\\[model\\.${tool}\\]`).test(toml);
  }
  
  if (hasWrapper && hasConfig) return `${C_GREEN}Installed${C_RESET}`;
  if (hasWrapper || hasConfig) return `${C_YELLOW}Partial${C_RESET}`;
  return `${C_RED}Not Installed${C_RESET}`;
}

// ---------------------------------------------------------------------------
// Sub-menu Option Items
// ---------------------------------------------------------------------------
let optionIndex = 0;

// ---------------------------------------------------------------------------
// Render Screen
// ---------------------------------------------------------------------------
function render() {
  console.clear();
  
  // Header
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
    
    const activeGrok = getGrokDefaultModel();
    
    console.log(`  Current Active Default in Grok: ${C_BOLD}${C_CYAN}${activeGrok}${C_RESET}\n`);
    
    ['agy', 'codex', 'deepseek'].forEach((tool) => {
      const status = checkInstallationStatus(tool);
      const activeModel = getSubmoduleModel(tool);
      console.log(`  • ${C_BOLD}${tool.toUpperCase()}${C_RESET}:`);
      console.log(`    - Status: ${status}`);
      console.log(`    - Active Model: ${C_YELLOW}${activeModel}${C_RESET}`);
    });
    
    console.log(`\n${C_YELLOW}Press any key (or Esc) to return to main menu.${C_RESET}`);
  } 
  
  else if (currentView === 'set-active') {
    console.log(`${C_BOLD}Select Active Default Model for Grok Build:${C_RESET}\n`);
    
    const current = getGrokDefaultModel();
    activeModels.forEach((model, index) => {
      const isCurrent = model === current ? ` ${C_GREEN}(Active)${C_RESET}` : '';
      if (index === activeModelIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${model.toUpperCase()} ${C_RESET}${isCurrent}`);
      } else {
        console.log(`   ${model.toUpperCase()}${isCurrent}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to cancel.${C_RESET}`);
  } 
  
  else if (currentView === 'config-options') {
    console.log(`${C_BOLD}Select Submodule to Configure Model Options:${C_RESET}\n`);
    
    CONFIG_MODELS.forEach((model, index) => {
      if (index === configModelIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${model.toUpperCase()} ${C_RESET}`);
      } else {
        console.log(`   ${model.toUpperCase()}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to return.${C_RESET}`);
  } 
  
  else if (currentView === 'config-options-agy') {
    console.log(`${C_BOLD}Select Default Model for AGY Connector:${C_RESET}\n`);
    
    const current = getSubmoduleModel('agy');
    agyModels.forEach((model, index) => {
      const isCurrent = model === current ? ` ${C_GREEN}(Current)${C_RESET}` : '';
      if (index === optionIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${model} ${C_RESET}${isCurrent}`);
      } else {
        console.log(`   ${model}${isCurrent}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to cancel.${C_RESET}`);
  } 
  
  else if (currentView === 'config-options-codex') {
    console.log(`${C_BOLD}Select Default Model for Codex Connector:${C_RESET}\n`);
    
    const current = getSubmoduleModel('codex');
    codexModels.forEach((model, index) => {
      const isCurrent = model === current ? ` ${C_GREEN}(Current)${C_RESET}` : '';
      if (index === optionIndex) {
        console.log(` > ${C_CYAN}${C_BOLD}${C_REVERSE} ${model} ${C_RESET}${isCurrent}`);
      } else {
        console.log(`   ${model}${isCurrent}`);
      }
    });
    console.log(`\n${C_YELLOW}Select with Enter. Press Esc to cancel.${C_RESET}`);
  } 
  
  else if (currentView === 'config-options-deepseek') {
    console.log(`${C_BOLD}Select Default Model for DeepSeek Connector:${C_RESET}\n`);
    
    const current = getSubmoduleModel('deepseek');
    deepseekModels.forEach((model, index) => {
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
    console.log(`${C_BOLD}Install/Re-install Submodule Connectors:${C_RESET}\n`);
    
    const options = ['AGY (Antigravity)', 'Codex', 'DeepSeek', 'Install All Connectors'];
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
// Run install execution
// ---------------------------------------------------------------------------
function runInstaller(tool) {
  installLogs = `${C_YELLOW}Running installer for ${tool}...${C_RESET}\n`;
  render();
  
  const targetDir = path.join(__dirname, tool);
  if (!fs.existsSync(targetDir)) {
    installLogs += `${C_RED}Error: Directory ${targetDir} does not exist. Make sure submodules are cloned.${C_RESET}\n`;
    render();
    return;
  }

  const res = spawnSync('node', ['lib/install.js'], {
    cwd: targetDir,
    encoding: 'utf8'
  });
  
  if (res.status === 0) {
    installLogs += `${C_GREEN}${res.stdout}${C_RESET}`;
    message = `${C_GREEN}Successfully installed ${tool}!${C_RESET}`;
  } else {
    installLogs += `${C_RED}Error details:\n${res.stderr || res.stdout || 'Unknown error'}${C_RESET}`;
    message = `${C_RED}Failed to install ${tool}${C_RESET}`;
  }
  render();
}

function runInstallAll() {
  installLogs = `${C_YELLOW}Installing all submodules...${C_RESET}\n\n`;
  render();
  
  ['agy', 'codex', 'deepseek'].forEach((tool) => {
    installLogs += `[${tool.toUpperCase()}]\n`;
    const targetDir = path.join(__dirname, tool);
    if (!fs.existsSync(targetDir)) {
      installLogs += `${C_RED}Directory not found: ${targetDir}${C_RESET}\n\n`;
      return;
    }
    const res = spawnSync('node', ['lib/install.js'], {
      cwd: targetDir,
      encoding: 'utf8'
    });
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
// Keypress Handlers
// ---------------------------------------------------------------------------
process.stdin.on('keypress', (str, key) => {
  // Exit instantly on Ctrl+C
  if (key.ctrl && key.name === 'c') {
    process.exit();
  }

  // Escape key returns to main menu
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

  // --- Main Menu Navigation ---
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
        configModelIndex = 0;
      } else if (menuIndex === 3) {
        currentView = 'install';
        optionIndex = 0;
      } else if (menuIndex === 4) {
        process.exit();
      }
      render();
    }
  } 
  
  // --- Status screen returns on any key press ---
  else if (currentView === 'status') {
    currentView = 'main';
    render();
  } 
  
  // --- Set Active default model ---
  else if (currentView === 'set-active') {
    if (key.name === 'up') {
      activeModelIndex = (activeModelIndex - 1 + activeModels.length) % activeModels.length;
      render();
    } else if (key.name === 'down') {
      activeModelIndex = (activeModelIndex + 1) % activeModels.length;
      render();
    } else if (key.name === 'return') {
      const selected = activeModels[activeModelIndex];
      setGrokDefaultModel(selected);
      message = `${C_GREEN}Set active Grok model to: ${selected.toUpperCase()}${C_RESET}`;
      currentView = 'main';
      render();
    }
  } 
  
  // --- Config Models list ---
  else if (currentView === 'config-options') {
    if (key.name === 'up') {
      configModelIndex = (configModelIndex - 1 + CONFIG_MODELS.length) % CONFIG_MODELS.length;
      render();
    } else if (key.name === 'down') {
      configModelIndex = (configModelIndex + 1) % CONFIG_MODELS.length;
      render();
    } else if (key.name === 'return') {
      const selected = CONFIG_MODELS[configModelIndex];
      currentView = `config-options-${selected}`;
      optionIndex = 0;
      render();
    }
  } 
  
  // --- Configure AGY options ---
  else if (currentView === 'config-options-agy') {
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + agyModels.length) % agyModels.length;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % agyModels.length;
      render();
    } else if (key.name === 'return') {
      const selected = agyModels[optionIndex];
      updateSubmoduleModel('agy', selected);
      currentView = 'main';
      render();
    }
  } 
  
  // --- Configure Codex options ---
  else if (currentView === 'config-options-codex') {
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + codexModels.length) % codexModels.length;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % codexModels.length;
      render();
    } else if (key.name === 'return') {
      const selected = codexModels[optionIndex];
      updateSubmoduleModel('codex', selected);
      currentView = 'main';
      render();
    }
  } 
  
  // --- Configure DeepSeek options ---
  else if (currentView === 'config-options-deepseek') {
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + deepseekModels.length) % deepseekModels.length;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % deepseekModels.length;
      render();
    } else if (key.name === 'return') {
      const selected = deepseekModels[optionIndex];
      updateSubmoduleModel('deepseek', selected);
      currentView = 'main';
      render();
    }
  } 
  
  // --- Install execution ---
  else if (currentView === 'install') {
    if (key.name === 'up') {
      optionIndex = (optionIndex - 1 + 4) % 4;
      render();
    } else if (key.name === 'down') {
      optionIndex = (optionIndex + 1) % 4;
      render();
    } else if (key.name === 'return') {
      if (optionIndex === 0) {
        runInstaller('agy');
      } else if (optionIndex === 1) {
        runInstaller('codex');
      } else if (optionIndex === 2) {
        runInstaller('deepseek');
      } else if (optionIndex === 3) {
        runInstallAll();
      }
    }
  }
});

// Initial render
render();
