#!/usr/bin/env node
'use strict';

// Code generator: reads providers/providers.json and writes one
// bins/grok-<name>.js per provider, then rewrites the package.json `bin` map.
//
//   passthrough -> self-contained wrapper (loads env, requires the key, then
//                  execs `grok -m <name> <args>`). Standalone so it keeps
//                  working after being copied to ~/.local/bin.
//   custom      -> a thin shim that requires the provider's own bin under
//                  providers/<dir>/bin/grok-<name>.js.
//   proxy       -> deferred; skipped with a warning (see _shared/proxy.js).
//
// Generated files are committed so `npm publish` needs no prepublish step.
// Re-running this script must be idempotent.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'providers', 'providers.json');
const BINS_DIR = path.join(ROOT, 'bins');
const PKG_PATH = path.join(ROOT, 'package.json');

const HEADER_NOTE =
  '// Built from providers/providers.json by scripts/generate-bins.js.\n' +
  '// Do not edit by hand; update the manifest and re-run that script.\n';

function passthroughWrapper(name, entry) {
  const envKey = entry.envKey;
  return `#!/usr/bin/env node
'use strict';
${HEADER_NOTE}
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const ENV_FILE = path.join(CLIPROXY_AUTH_DIR, 'grok-' + ${JSON.stringify(name)} + '.env');

// Load env
if (fs.existsSync(ENV_FILE)) {
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\\r?\\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    // Skip empty values so a placeholder \`KEY=\` line written at install time
    // does not clobber a key the user exported in their shell.
    if (m && m[2] !== '') process.env[m[1]] = m[2];
  }
}

if (!process.env[${JSON.stringify(envKey)}]) {
  process.stderr.write('missing ' + ${JSON.stringify(envKey)} + '. Write it to ~/.cli-proxy-api/grok-' + ${JSON.stringify(name)} + '.env as ' + ${JSON.stringify(envKey)} + '=<key>\\n');
  process.exit(1);
}

// Resolve grok binary
const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';

// Exec grok -m ${name} <args>
const args = ['-m', ${JSON.stringify(name)}, ...process.argv.slice(2)];
const result = spawnSync(grokBin, args, { stdio: 'inherit' });

if (result.status !== null) {
  process.exit(result.status);
} else if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(1);
}
`;
}

function customShim(name, entry) {
  const dir = entry.dir || name;
  return `#!/usr/bin/env node
'use strict';
${HEADER_NOTE}
// Custom provider: delegate to the provider's own self-contained bin.
require(${JSON.stringify(`../providers/${dir}/bin/grok-${name}.js`)});
`;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.mkdirSync(BINS_DIR, { recursive: true });

  const binMap = { 'open-grok-build': './tui.js' };
  const written = [];

  for (const [name, entry] of Object.entries(manifest)) {
    let content;
    if (entry.type === 'passthrough') {
      content = passthroughWrapper(name, entry);
    } else if (entry.type === 'custom') {
      content = customShim(name, entry);
    } else if (entry.type === 'proxy') {
      console.warn(`skip ${name}: provider type 'proxy' is deferred (no generated bin)`);
      continue;
    } else {
      console.warn(`skip ${name}: unknown provider type '${entry.type}'`);
      continue;
    }

    const dest = path.join(BINS_DIR, `grok-${name}.js`);
    fs.writeFileSync(dest, content, 'utf8');
    fs.chmodSync(dest, 0o755);
    binMap[`grok-${name}`] = `./bins/grok-${name}.js`;
    written.push(`grok-${name}`);
  }

  // Rewrite package.json bin map, preserving key order elsewhere.
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkg.bin = binMap;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  console.log(`generated ${written.length} bin(s): ${written.join(', ')}`);
  console.log(`updated package.json bin map (${Object.keys(binMap).length} entries)`);
}

main();
