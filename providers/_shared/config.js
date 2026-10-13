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

// Wire protocols Grok Build can speak to a [model.<name>] endpoint, and the
// header it uses to carry the key. Both are documented in Grok Build's
// custom-models guide (api_backend / auth_scheme).
const BACKENDS = ['chat_completions', 'responses', 'messages'];
const AUTH_SCHEMES = ['bearer', 'x-api-key'];
const DEFAULT_BACKEND = 'chat_completions';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Regex for one whole `[model.<name>]` section: from its header up to (not
// including) the next line that opens a table, or end of file.
function sectionRegex(name) {
  return new RegExp(`^\\[model\\.${escapeRegExp(name)}\\][^]*?(?=^\\[|(?![^]))`, 'm');
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

// --- Per-model wire protocol ----------------------------------------------

// Which api_backend a given model needs on this connector. Gateways such as
// OpenCode front models that speak different protocols behind one base URL
// (Claude via Anthropic messages, GPT via Responses, everything else via chat
// completions); `backendRules` in the manifest maps model ids to the protocol,
// first match wins, else `apiBackend`, else chat_completions.
function backendFor(entry, model) {
  if (entry && Array.isArray(entry.backendRules)) {
    for (const rule of entry.backendRules) {
      if (!rule || !rule.match || !rule.backend) continue;
      let re;
      try { re = new RegExp(rule.match); } catch { continue; }
      if (re.test(String(model))) return rule.backend;
    }
  }
  return (entry && entry.apiBackend) || DEFAULT_BACKEND;
}

// Serialise a flat string map as a TOML inline table.
function tomlInlineTable(obj) {
  const pairs = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(String(v))}`);
  return `{ ${pairs.join(', ')} }`;
}

// Render a complete [model.<name>] block for a connector. `entry` carries the
// manifest fields (name, baseUrl, envKey, apiBackend, authScheme, backendRules,
// contextWindow, extraHeaders); `model` is the model id to pin.
function renderModelBlock(name, entry, model) {
  const lines = [
    `[model.${name}]`,
    `model = "${model}"`,
    `base_url = "${entry.baseUrl}"`,
    `name = "${entry.name}"`,
    `env_key = "${entry.envKey}"`,
    `api_backend = "${backendFor(entry, model)}"`,
    `auth_scheme = "${entry.authScheme || 'bearer'}"`,
  ];
  if (entry.contextWindow) lines.push(`context_window = ${Number(entry.contextWindow)}`);
  if (entry.extraHeaders && Object.keys(entry.extraHeaders).length) {
    lines.push(`extra_headers = ${tomlInlineTable(entry.extraHeaders)}`);
  }
  return lines.join('\n') + '\n';
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

// Read one key out of a connector's `extra_headers` inline table, or
// undefined. Used to keep per-install values (OpenCode's session id) stable
// across reinstalls.
function getExtraHeader(name, header) {
  if (!fs.existsSync(GROK_CONFIG)) return undefined;
  try {
    const toml = fs.readFileSync(GROK_CONFIG, 'utf8');
    const section = toml.match(sectionRegex(name));
    if (!section) return undefined;
    const table = section[0].match(/^extra_headers\s*=\s*\{([^}]*)\}/m);
    if (!table) return undefined;
    const re = new RegExp(`"${escapeRegExp(header)}"\\s*=\\s*"([^"]*)"`);
    const m = table[1].match(re);
    return m ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

// Update the `model` field inside an existing [model.<name>] section. When the
// connector has backend rules, the `api_backend` line follows the model so a
// switch from a chat-completions model to a Claude or GPT model on the same
// gateway keeps working. Returns true on success, false if the section was not
// found.
function updateModelField(name, modelName, entry) {
  if (!fs.existsSync(GROK_CONFIG)) return false;
  let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
  const secRe = sectionRegex(name);
  const sec = toml.match(secRe);
  if (!sec) return false;

  let section = sec[0];
  const modelRe = /^(model\s*=\s*")[^"]*(")/m;
  if (modelRe.test(section)) {
    section = section.replace(modelRe, `$1${modelName}$2`);
  } else {
    section = section.replace(/^\[model\.[^\]]+\]\s*\n?/, (h) => `${h.trimEnd()}\nmodel = "${modelName}"\n`);
  }

  if (entry && Array.isArray(entry.backendRules) && entry.backendRules.length) {
    const backend = backendFor(entry, modelName);
    const backendRe = /^(api_backend\s*=\s*")[^"]*(")/m;
    if (backendRe.test(section)) {
      section = section.replace(backendRe, `$1${backend}$2`);
    } else {
      section = section.replace(modelRe, (m) => `${m}\napi_backend = "${backend}"`);
    }
  }

  toml = toml.replace(sec[0], section);
  fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
  return true;
}

// Upsert a connector's [model.<name>] block from its manifest entry. The block
// is regenerated in full (model pinned back to `entry.defaultModel`) so an
// "install / update" pass picks up schema changes such as a new api_backend or
// extra_headers; everything outside the section is left untouched.
function patchModelBlock(name, entry) {
  const block = renderModelBlock(name, entry, entry.defaultModel);

  if (!fs.existsSync(GROK_CONFIG)) {
    fs.mkdirSync(path.dirname(GROK_CONFIG), { recursive: true });
    fs.writeFileSync(GROK_CONFIG, block, 'utf8');
    return;
  }

  let toml = fs.readFileSync(GROK_CONFIG, 'utf8');
  const sec = toml.match(sectionRegex(name));
  if (sec) {
    // Keep the blank-line spacing that followed the old section.
    const trailing = sec[0].match(/\n*$/)[0];
    const keep = trailing.length > 1 ? trailing : '\n';
    toml = toml.replace(sec[0], block.trimEnd() + keep);
  } else {
    if (!toml.endsWith('\n')) toml += '\n';
    toml += '\n' + block;
  }
  fs.writeFileSync(GROK_CONFIG, toml, 'utf8');
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
    toml = toml.replace(sectionRegex(name), '');

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
  BACKENDS,
  AUTH_SCHEMES,
  DEFAULT_BACKEND,
  getDefaultModel,
  setDefaultModel,
  getModelField,
  getExtraHeader,
  updateModelField,
  patchModelBlock,
  renderModelBlock,
  backendFor,
  checkStatus,
  removeModelBlock,
};
