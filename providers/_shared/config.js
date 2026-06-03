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

function getDefaultModel() {
  if (!fs.existsSync(GROK_CONFIG)) return 'None';
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const m = toml.match(/^default\s*=\s*"([^"]+)"/m);
    return m ? m[1] : 'None';
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
  if (/^default\s*=\s*/m.test(toml)) {
    toml = toml.replace(/^default\s*=\s*"[^"]*"/m, `default = "${model}"`);
  } else if (/^\[models\]/m.test(toml)) {
    toml = toml.replace(/^\[models\]/m, `[models]\ndefault = "${model}"`);
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
    const re = new RegExp(`\\[model\\.${name}\\][^\\[]*?model\\s*=\\s*"([^"]+)"`);
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
  const re = new RegExp(`(\\[model\\.${name}\\][^\\[]*?model\\s*=\\s*")[^"]+(")`);
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
    const sectionRe = new RegExp(`^\\[model\\.${name}\\]`, 'm');
    if (sectionRe.test(toml)) {
      // Section-bounded ([^\[] cannot cross into the next section) and
      // whitespace-tolerant, matching getModelField/updateModelField. The old
      // `(?:[^\[]|\[(?!model\.))*?` form crossed non-[model.*] sections and
      // could overwrite an unrelated section's `model` field.
      const fieldRe = new RegExp(
        `(\\[model\\.${name}\\][^\\[]*?model\\s*=\\s*")[^"]+(")`,
      );
      toml = toml.replace(fieldRe, `$1${entry.defaultModel}$2`);
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
  const binaryPath = path.join(LOCAL_BIN, `grok-${name}`);
  const hasWrapper = fs.existsSync(binaryPath);

  let hasConfig = false;
  if (fs.existsSync(GROK_CONFIG)) {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    hasConfig = new RegExp(`\\[model\\.${name}\\]`).test(toml);
  }

  if (hasWrapper && hasConfig) return 'installed';
  if (hasWrapper || hasConfig) return 'partial';
  return 'missing';
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
};
