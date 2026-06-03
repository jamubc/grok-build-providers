'use strict';

// Shared helpers for reading and patching ~/.grok/config.toml.
//
// These were previously inlined in tui.js and duplicated (with small
// variations) across each provider's lib/install.js. Centralising them keeps
// the TUI and the generic passthrough installer in agreement.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const GROK_HOME = process.env.GROK_HOME || path.join(HOME, '.grok');
const GROK_CONFIG = process.env.GROK_CONFIG || path.join(GROK_HOME, 'config.toml');
const LOCAL_BIN = process.env.LOCAL_BIN || path.join(HOME, '.local', 'bin');

// --- Default model (the [models] default = "..." line) --------------------

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Default model (the [models] default = "..." line) --------------------

function getDefaultModel() {
  if (!fs.existsSync(GROK_CONFIG)) return 'None';
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const sectionMatch = toml.match(/^\[models\]([^\[]*)/m);
    if (sectionMatch) {
      const m = sectionMatch[1].match(/^default\s*=\s*"([^"]+)"/m);
      return m ? m[1] : 'None';
    }
    return 'None';
  } catch {
    return 'Error';
  }
}

function setDefaultModel(model) {
  if (!fs.existsSync(GROK_CONFIG)) {
    fs.mkdirSync(path.dirname(GROK_CONFIG), { recursive: true });
    fs.writeFileSync(GROK_CONFIG, `[models]\ndefault = "${model}"\n`, 'utf8');
    return;
  }
  let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
  const sectionRe = /^\[models\]([^\[]*)/m;
  const sectionMatch = toml.match(sectionRe);

  if (sectionMatch) {
    const sectionContent = sectionMatch[1];
    if (/^default\s*=\s*/m.test(sectionContent)) {
      const newSectionContent = sectionContent.replace(/^default\s*=\s*"[^"]*"/m, `default = "${model}"`);
      toml = toml.replace(sectionMatch[0], `[models]${newSectionContent}`);
    } else {
      toml = toml.replace(/^\[models\]/m, `[models]\ndefault = "${model}"`);
    }
  } else {
    toml = `[models]\ndefault = "${model}"\n\n` + toml;
  }
  fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
}

// --- Per-connector [model.<name>] sections --------------------------------

// Read the `model` field inside a [model.<name>] section.
function getModelField(name) {
  if (!fs.existsSync(GROK_CONFIG)) return 'Unknown';
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const re = new RegExp(`\\[model\\.${escapeRegExp(name)}\\][^\\[]*?model\\s*=\\s*"([^"]+)"`);
    const m = toml.match(re);
    return m ? m[1] : 'Not Configured';
  } catch {
    return 'Error';
  }
}

// Update the `model` field inside an existing [model.<name>] section.
// Returns true on success, false if the section was not found.
function updateModelField(name, modelName) {
  if (!fs.existsSync(GROK_CONFIG)) return false;
  let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
  const re = new RegExp(`(\\[model\\.${escapeRegExp(name)}\\][^\\[]*?model\\s*=\\s*")[^"]+(")`);
  if (!re.test(toml)) return false;
  toml = toml.replace(re, `$1${modelName}$2`);
  fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
  return true;
}

// Upsert a passthrough connector's [model.<name>] block. Mirrors the historical
// deepseek/qwen installer behaviour exactly: if the section exists, only the
// model field is reset to the default; otherwise the full block is appended.
function patchModelBlock(name, entry) {
  const modelBlock = [
    '',
    `[model.${name}]`,
    `model = "${entry.defaultModel}"`,
    `base_url = "${entry.baseUrl}"`,
    `name = "${entry.name}"`,
    `env_key = "${entry.envKey}"`,
    'api_backend = "chat_completions"',
    'auth_scheme = "bearer"',
    '',
  ].join('\n');

  if (fs.existsSync(GROK_CONFIG)) {
    let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const escapedName = escapeRegExp(name);
    const sectionRe = new RegExp(`^\\[model\\.${escapedName}\\]`, 'm');
    if (sectionRe.test(toml)) {
      const fieldRe = new RegExp(
        `(\\[model\\.${escapedName}\\][^\\[]*?model\\s*=\\s*")[^"]+(")`,
      );
      if (fieldRe.test(toml)) {
        toml = toml.replace(fieldRe, `$1${entry.defaultModel}$2`);
      } else {
        // Section exists but model field is missing. Insert model line right after section header.
        toml = toml.replace(sectionRe, `[model.${name}]\nmodel = "${entry.defaultModel}"`);
      }
      fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
    } else {
      fs.appendFileSync(GROK_CONFIG, modelBlock, 'utf8');
    }
  } else {
    fs.writeFileSync(GROK_CONFIG, modelBlock.trimStart(), 'utf8');
  }
}

// Installation status for a connector: green/Installed when both the wrapper
// binary and the config section exist, partial when only one does.
function checkStatus(name) {
  try {
    const binaryPath = path.join(LOCAL_BIN, `grok-${name}`);
    const hasWrapper = fs.existsSync(binaryPath);

    let hasConfig = false;
    if (fs.existsSync(GROK_CONFIG)) {
      const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
      hasConfig = new RegExp(`\\[model\\.${escapeRegExp(name)}\\]`).test(toml);
    }

    if (hasWrapper && hasConfig) return 'installed';
    if (hasWrapper || hasConfig) return 'partial';
    return 'missing';
  } catch {
    return 'missing';
  }
}

// Cleanly remove a model configuration block and reset default pointer if it matches
function removeModelBlock(name) {
  if (!fs.existsSync(GROK_CONFIG)) return;
  try {
    let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const escapedName = escapeRegExp(name);
    const re = new RegExp(`\\[model\\.${escapedName}\\][^]*?(?=\\[|$)`, 'g');
    toml = toml.replace(re, '');

    const sectionMatch = toml.match(/^\[models\]([^\[]*)/m);
    if (sectionMatch) {
      const sectionContent = sectionMatch[1];
      const defaultMatch = sectionContent.match(/^default\s*=\s*"([^"]+)"/m);
      if (defaultMatch && defaultMatch[1] === name) {
        const newSectionContent = sectionContent.replace(/^default\s*=\s*"[^"]*"/m, 'default = "None"');
        toml = toml.replace(sectionMatch[0], `[models]${newSectionContent}`);
      }
    }

    toml = toml.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
  } catch (err) {
    throw new Error(`Failed to remove block from config: ${err.message}`);
  }
}

module.exports = {
  GROK_HOME,
  GROK_CONFIG,
  LOCAL_BIN,
  getDefaultModel,
  setDefaultModel,
  getModelField,
  updateModelField,
  patchModelBlock,
  checkStatus,
  removeModelBlock,
};
