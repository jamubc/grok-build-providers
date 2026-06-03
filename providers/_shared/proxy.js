'use strict';

// Inline, dependency-free OpenAI-compatible proxy for "custom" connectors.
//
// A `grok-<name>` launcher runs in two roles:
//   * client  – ensures a daemon is listening, registers itself, then execs
//               `grok -m <name> <args>` so Grok talks to the local daemon.
//   * daemon  – a tiny HTTP server (spawned detached by the first client) that
//               turns each /v1/chat/completions call into one invocation of the
//               backend CLI (`agy`, `codex`, …) and streams the result back.
//
// The daemon shuts itself down a short while after the last client exits, so
// nothing lingers in the background.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { loadEnvFile } = require('./env');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Optional file logging for troubleshooting: `GROK_PROXY_DEBUG=1 grok-agy …`.
const DEBUG = !!process.env.GROK_PROXY_DEBUG;
const DEBUG_LOG = path.join(CLIPROXY_AUTH_DIR, 'logs', 'inline-proxy-debug.log');
function dlog(role, msg) {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [${role} pid=${process.pid}] ${msg}\n`);
  } catch {}
}

function findBinary(cmd) {
  const paths = [
    path.join(HOME, '.local', 'bin', cmd),
    path.join('/opt/homebrew/bin', cmd),
    path.join('/usr/local/bin', cmd),
    cmd
  ];
  for (const p of paths) {
    if (p !== cmd && fs.existsSync(p)) return p;
  }
  return cmd;
}

function startProxy(options) {
  const {
    name,
    port,
    envKey,
    models,
    binaryName,
    format, // 'plain' or 'json-lines'
    spawnArgs, // (model, prompt) => Array
  } = options;

  const isDaemon = process.argv.includes('--daemon');
  const envFile = path.join(CLIPROXY_AUTH_DIR, `grok-${name}.env`);

  // Load env
  loadEnvFile(envFile);

  const expectedKey = process.env[envKey];
  if (!expectedKey) {
    process.stderr.write(`Error: missing ${envKey} in environment or env file.\n`);
    process.exit(1);
  }

  const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
  const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';
  const backendBin = findBinary(binaryName);

  if (isDaemon) {
    runDaemon({ port, expectedKey, backendBin, binaryName, models, format, spawnArgs });
  } else {
    runClient(port, expectedKey, grokBin, name);
  }
}

// --- Client logic ----------------------------------------------------------

function sendProxyRef(port, expectedKey, action) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: `/v1/proxy-ref?action=${action}&pid=${process.pid}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${expectedKey}`
      }
    }, (res) => {
      res.resume();
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Server responded with ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Timeout connecting to proxy server'));
    });

    req.end();
  });
}

async function runClient(port, expectedKey, grokBin, name) {
  dlog('client', `runClient name=${name} port=${port} grokBin=${grokBin}`);

  // Try to register with a daemon; spawn one (detached) on the first failure
  // and keep retrying until it is up. The ceiling (~8s) tolerates a slow cold
  // start under load while still failing fast when something is truly wrong.
  let registered = false;
  for (let i = 0; i < 40; i++) {
    try {
      await sendProxyRef(port, expectedKey, 'add');
      registered = true;
      dlog('client', `registered on attempt ${i}`);
      break;
    } catch (err) {
      if (i === 0) {
        dlog('client', `no daemon on ${port}; spawning one`);
        const daemon = spawn(process.execPath, [process.argv[1], '--daemon'], {
          detached: true,
          stdio: 'ignore',
          env: process.env
        });
        daemon.unref();
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  if (!registered) {
    process.stderr.write(`Error: Could not start or connect to proxy daemon on port ${port}\n`);
    process.exit(1);
  }

  // Spawn grok and forward arguments
  const args = ['-m', name, ...process.argv.slice(2)];
  const grokProcess = spawn(grokBin, args, {
    stdio: 'inherit',
    env: process.env
  });

  const forwardSignal = (signal) => {
    try { grokProcess.kill(signal); } catch {}
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  grokProcess.on('exit', async (code, signal) => {
    try {
      await sendProxyRef(port, expectedKey, 'remove');
    } catch {}

    if (code !== null) {
      process.exit(code);
    } else if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(1);
    }
  });

  grokProcess.on('error', (err) => {
    process.stderr.write(`Failed to start grok: ${err.message}\n`);
    process.exit(1);
  });
}

// --- Backend output parsing ------------------------------------------------

// Returns a stateful parser that converts decoded backend stdout into text
// deltas (and surfaces backend-reported errors), so the streaming and
// non-streaming response paths can share one extraction routine.
//
//   plain      – stdout *is* the assistant text (agy --print).
//   json-lines – Codex `exec --json`: one JSON event per line. Assistant text
//                arrives as item.completed/agent_message; errors as `error` or
//                `turn.failed`.
function makeParser(format) {
  if (format !== 'json-lines') {
    // 'plain' (default): pass stdout straight through as content.
    return {
      feed: (s) => ({ text: s, error: null }),
      finalize: () => ({ text: '', error: null }),
    };
  }

  let buffer = '';
  const consume = (chunk, isFinal) => {
    buffer += chunk;
    let lines;
    if (isFinal) {
      lines = buffer ? buffer.split('\n') : [];
      buffer = '';
    } else {
      lines = buffer.split('\n');
      buffer = lines.pop();
    }
    let text = '';
    let error = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let p;
      try { p = JSON.parse(trimmed); } catch { continue; }
      if (p.type === 'error') {
        error = p.message || error;
      } else if (p.type === 'turn.failed' && p.error) {
        error = p.error.message || error;
      } else if (p.type === 'item.completed' && p.item && p.item.type === 'agent_message' && typeof p.item.text === 'string') {
        text += p.item.text;
      }
    }
    return { text, error };
  };

  return {
    feed: (s) => consume(s, false),
    finalize: () => consume('', true),
  };
}

// --- Daemon logic ----------------------------------------------------------

function runDaemon({ port, expectedKey, backendBin, binaryName, models, format, spawnArgs }) {
  const activePIDs = new Set();
  const IDLE_MS = 10000;        // shut down this long after the last client exits
  const STARTUP_GRACE_MS = 30000; // …or if no client ever registers
  let idleTimer = null;
  let startupTimer = null;

  function isPidAlive(pid) {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  function cancelIdle() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function scheduleIdle() {
    if (idleTimer || activePIDs.size > 0) return;
    idleTimer = setTimeout(() => {
      if (activePIDs.size === 0) {
        dlog('daemon', 'idle timeout reached, shutting down');
        shutdownServer();
        process.exit(0);
      }
    }, IDLE_MS);
    idleTimer.unref();
  }

  function onActiveChange() {
    if (activePIDs.size === 0) scheduleIdle();
    else cancelIdle();
  }

  const cleanupInterval = setInterval(() => {
    let changed = false;
    for (const pid of activePIDs) {
      if (!isPidAlive(pid)) { activePIDs.delete(pid); changed = true; }
    }
    if (changed) onActiveChange();
  }, 3000);
  cleanupInterval.unref();

  function shutdownServer() {
    clearInterval(cleanupInterval);
    cancelIdle();
    if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
    try { server.close(); } catch {}
  }

  const server = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const expected = `Bearer ${expectedKey}`;
    const authHeaderHash = crypto.createHash('sha256').update(authHeader).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(authHeaderHash, expectedHash)) {
      res.writeHead(401, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: 'Unauthorized: Invalid API Key' } }));
      return;
    }

    if (req.url.startsWith('/v1/proxy-ref')) {
      const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      const action = urlObj.searchParams.get('action');
      const pid = parseInt(urlObj.searchParams.get('pid'), 10);

      if (action === 'add' && pid) {
        activePIDs.add(pid);
        if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
        onActiveChange();
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
        return;
      } else if (action === 'remove' && pid) {
        activePIDs.delete(pid);
        onActiveChange();
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: 'Invalid action or pid' } }));
      return;
    }

    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ object: 'list', data: models }));
      return;
    }

    if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
      handleCompletion(req, res, { backendBin, binaryName, models, format, spawnArgs });
      return;
    }

    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: { message: 'Not Found' } }));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Another daemon already owns the port; let it serve and exit quietly.
      dlog('daemon', `port ${port} already in use; deferring to existing daemon`);
      process.exit(0);
    }
    process.stderr.write(`Server error: ${err.message}\n`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    dlog('daemon', `listening on 127.0.0.1:${port}`);
    // If the spawning client never registers (e.g. it died), don't linger.
    startupTimer = setTimeout(() => {
      if (activePIDs.size === 0) {
        dlog('daemon', 'no client registered within startup grace; shutting down');
        shutdownServer();
        process.exit(0);
      }
    }, STARTUP_GRACE_MS);
    startupTimer.unref();
  });
}

function handleCompletion(req, res, { backendBin, binaryName, models, format, spawnArgs }) {
  let body = '';
  let size = 0;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  req.on('aborted', () => { try { req.destroy(); } catch {} });

  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      if (!res.headersSent) {
        res.writeHead(413, JSON_HEADERS);
        res.end(JSON.stringify({ error: { message: 'Request Entity Too Large' } }));
      }
      try { req.destroy(); } catch {}
      return;
    }
    body += chunk;
  });

  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
      return;
    }

    const prompt = messagesToPrompt(payload.messages || []);
    const isStream = payload.stream === true;
    const model = payload.model || (models[0] && models[0].id) || 'unknown';

    const args = spawnArgs(model, prompt);
    const t0 = Date.now();
    dlog('daemon', `POST ${req.url} model=${model} stream=${isStream} promptLen=${prompt.length} -> spawn ${backendBin}`);
    const child = spawn(backendBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // Hard cap so a stuck backend can't hold the slot forever.
    const watchdog = setTimeout(() => {
      if (!child.killed) { try { child.kill('SIGKILL'); } catch {} }
    }, 10 * 60 * 1000);
    watchdog.unref();

    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    // Abort the backend ONLY when the client genuinely disconnects before we
    // finished responding. Crucially we do *not* listen on req's 'close'/'end':
    // those fire the instant the request body is fully read (normal, and only
    // milliseconds after spawn), which previously SIGTERM-ed the backend before
    // it could emit a single token — the root cause of grok's retry loop.
    res.on('error', () => {});
    res.on('close', () => {
      if (!res.writableEnded) {
        dlog('daemon', `client disconnected after ${Date.now() - t0}ms; killing backend`);
        clearTimeout(watchdog);
        if (!child.killed) { try { child.kill('SIGTERM'); } catch {} }
      }
    });

    const decoder = new StringDecoder('utf8');
    const parser = makeParser(format);
    const cid = `chatcmpl-${Date.now()}`;
    const now = () => Math.floor(Date.now() / 1000);

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked'
      });

      // Emit the OpenAI-style opening chunk immediately and send SSE keepalive
      // comments while the backend is still thinking. Agentic CLIs (notably
      // `codex`) can spend several seconds reasoning before producing any
      // assistant text; without early bytes Grok hits its first-byte timeout,
      // disconnects, and retries — the second failure mode behind the retry loop.
      res.write(`data: ${JSON.stringify({
        id: cid, object: 'chat.completion.chunk', created: now(), model,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
      })}\n\n`);

      const keepalive = setInterval(() => {
        if (res.writableEnded || res.destroyed) return;
        res.write(': keepalive\n\n');
      }, 3000);
      keepalive.unref();
      const stopKeepalive = () => clearInterval(keepalive);

      let firstContent = false;
      const sendContent = (text) => {
        if (!firstContent) { firstContent = true; stopKeepalive(); dlog('daemon', `first content after ${Date.now() - t0}ms`); }
        res.write(`data: ${JSON.stringify({
          id: cid, object: 'chat.completion.chunk', created: now(), model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
        })}\n\n`);
      };
      const sendError = (message) => {
        dlog('daemon', `sendError after ${Date.now() - t0}ms: ${String(message).slice(0, 120)}`);
        res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
      };

      child.stdout.on('data', chunk => {
        if (res.writableEnded || res.destroyed) return;
        const { text, error } = parser.feed(decoder.write(chunk));
        if (text) sendContent(text);
        if (error) sendError(error);
      });

      child.on('close', code => {
        clearTimeout(watchdog);
        stopKeepalive();
        dlog('daemon', `backend closed code=${code} after ${Date.now() - t0}ms stderrLen=${stderr.length}`);
        if (res.writableEnded || res.destroyed) return;
        const tail = parser.feed(decoder.end());
        const fin = parser.finalize();
        const text = (tail.text || '') + (fin.text || '');
        const error = tail.error || fin.error || exitError(code, stderr, binaryName);
        if (text) sendContent(text);
        if (error) sendError(error);
        res.write(`data: ${JSON.stringify({
          id: cid, object: 'chat.completion.chunk', created: now(), model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });

      child.on('error', err => {
        clearTimeout(watchdog);
        stopKeepalive();
        if (res.writableEnded || res.destroyed) return;
        sendError(`Failed to spawn ${binaryName} CLI: ${err.message}`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    } else {
      let fullText = '';
      let errText = null;

      child.stdout.on('data', chunk => {
        const { text, error } = parser.feed(decoder.write(chunk));
        if (text) fullText += text;
        if (error) errText = error;
      });

      child.on('close', code => {
        clearTimeout(watchdog);
        dlog('daemon', `backend closed code=${code} after ${Date.now() - t0}ms stderrLen=${stderr.length}`);
        if (res.writableEnded || res.destroyed) return;
        const tail = parser.feed(decoder.end());
        const fin = parser.finalize();
        fullText += (tail.text || '') + (fin.text || '');
        const error = errText || tail.error || fin.error || exitError(code, stderr, binaryName);
        if (error && !fullText) {
          res.writeHead(500, JSON_HEADERS);
          res.end(JSON.stringify({ error: { message: error } }));
          return;
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({
          id: cid, object: 'chat.completion', created: now(), model,
          choices: [{ index: 0, message: { role: 'assistant', content: fullText }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        }));
      });

      child.on('error', err => {
        clearTimeout(watchdog);
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: { message: `Failed to spawn ${binaryName} CLI: ${err.message}` } }));
      });
    }
  });
}

// Turn a non-zero / signalled backend exit into a human-readable error, or null
// for a clean exit. (A clean exit with empty output is a valid empty response.)
function exitError(code, stderr, binaryName) {
  if (code === 0) return null;
  if (stderr && stderr.trim()) return stderr.trim();
  if (code === null) return `${binaryName} CLI was terminated before completing`;
  return `${binaryName} CLI exited with code ${code}`;
}

function messagesToPrompt(messages) {
  const sections = [];
  for (const message of messages) {
    if (!message) continue;
    const role = message.role || 'user';
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content.map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      }).join('\n');
    }
    text = text.trim();
    if (!text) continue;
    if (role === 'system') sections.push(`System instructions:\n${text}`);
    else if (role === 'assistant') sections.push(`Assistant previous message:\n${text}`);
    else if (role === 'tool') sections.push(`Tool result:\n${text}`);
    else sections.push(`User:\n${text}`);
  }
  sections.push('Assistant:');
  return sections.join('\n\n');
}

module.exports = { startProxy };
