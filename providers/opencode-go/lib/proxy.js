#!/usr/bin/env node
'use strict';

// OpenCode Go inline proxy.
// Routes OpenAI-compatible requests to the correct upstream endpoint:
//   - OpenAI models   -> /v1/chat/completions
//   - Anthropic models -> /v1/messages (with format translation)
//
// Works as both a client launcher (ensures daemon is running, then execs grok)
// and a daemon (the HTTP proxy itself).

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { loadEnvFile } = require('../../_shared/env');

const NAME = 'opencode-go';
const PORT = 8320;
const BASE_URL = 'https://opencode.ai/zen/go';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Transfer-Encoding': 'chunked'
};

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const ENV_FILE = path.join(CLIPROXY_AUTH_DIR, `grok-${NAME}.env`);

const DEBUG = !!process.env.GROK_PROXY_DEBUG;
const DEBUG_LOG = path.join(CLIPROXY_AUTH_DIR, 'logs', 'inline-proxy-debug.log');
function dlog(msg) {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [${NAME}] ${msg}\n`);
  } catch {}
}

// Model list (must match providers.json order for stability)
const MODELS = [
  'glm-5.1', 'glm-5',
  'kimi-k2.5', 'kimi-k2.6',
  'deepseek-v4-pro', 'deepseek-v4-flash',
  'mimo-v2.5', 'mimo-v2.5-pro',
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus'
];

const ANTHROPIC_MODELS = new Set([
  'minimax-m3', 'minimax-m2.7', 'minimax-m2.5',
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus'
]);

function isAnthropicModel(model) {
  return ANTHROPIC_MODELS.has(model);
}

// --- Entry point -----------------------------------------------------------

const isDaemon = process.argv.includes('--daemon');

loadEnvFile(ENV_FILE);

const UPSTREAM_API_KEY = process.env.OPENCODE_GO_API_KEY;
const PROXY_API_KEY = process.env.GROK_OPENCODE_GO_PROXY_API_KEY;

if (!UPSTREAM_API_KEY) {
  process.stderr.write('Error: missing OPENCODE_GO_API_KEY in environment or env file.\n');
  process.exit(1);
}

if (!PROXY_API_KEY) {
  process.stderr.write('Error: missing GROK_OPENCODE_GO_PROXY_API_KEY. Did you run grok provider install opencode-go?\n');
  process.exit(1);
}

const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';

if (isDaemon) {
  runDaemon();
} else {
  runClient();
}

// --- Client logic ----------------------------------------------------------

function sendProxyRef(action) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/v1/proxy-ref?action=${action}&pid=${process.pid}`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PROXY_API_KEY}` }
    }, (res) => {
      res.resume();
      if (res.statusCode === 200) resolve(true);
      else reject(new Error(`Server responded with ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function runClient() {
  dlog(`runClient port=${PORT}`);

  let registered = false;
  for (let i = 0; i < 40; i++) {
    try {
      await sendProxyRef('add');
      registered = true;
      dlog(`registered on attempt ${i}`);
      break;
    } catch (err) {
      if (i === 0) {
        dlog('no daemon; spawning one');
        const daemon = spawn(process.execPath, [process.argv[1], '--daemon'], {
          detached: true,
          stdio: 'ignore',
          env: process.env
        });
        daemon.unref();
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!registered) {
    process.stderr.write(`Error: Could not start proxy daemon on port ${PORT}\n`);
    process.exit(1);
  }

  const args = ['-m', NAME, ...process.argv.slice(2)];
  const grokProcess = spawn(grokBin, args, { stdio: 'inherit', env: process.env });

  process.on('SIGINT', () => { try { grokProcess.kill('SIGINT'); } catch {} });
  process.on('SIGTERM', () => { try { grokProcess.kill('SIGTERM'); } catch {} });

  grokProcess.on('exit', async (code, signal) => {
    try { await sendProxyRef('remove'); } catch {}
    if (code !== null) process.exit(code);
    else if (signal) process.kill(process.pid, signal);
    else process.exit(1);
  });

  grokProcess.on('error', (err) => {
    process.stderr.write(`Failed to start grok: ${err.message}\n`);
    process.exit(1);
  });
}

// --- Daemon logic ----------------------------------------------------------

function runDaemon() {
  const activePIDs = new Set();
  const IDLE_MS = 10000;
  const STARTUP_GRACE_MS = 30000;
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
        dlog('idle timeout, shutting down');
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
    // Auth check
    const authHeader = req.headers['authorization'] || '';
    const expected = `Bearer ${PROXY_API_KEY}`;
    const authHash = crypto.createHash('sha256').update(authHeader).digest();
    const expHash = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(authHash, expHash)) {
      res.writeHead(401, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
      return;
    }

    // Proxy-ref (client registration)
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
      } else if (action === 'remove' && pid) {
        activePIDs.delete(pid);
        onActiveChange();
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: { message: 'Invalid action or pid' } }));
      }
      return;
    }

    // Models list
    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({
        object: 'list',
        data: MODELS.map(id => ({ id, object: 'model', created: 1677610602, owned_by: 'opencode' }))
      }));
      return;
    }

    // Chat completions
    if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
      handleChatCompletion(req, res);
      return;
    }

    res.writeHead(404, JSON_HEADERS);
    res.end(JSON.stringify({ error: { message: 'Not Found' } }));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      dlog(`port ${PORT} in use; deferring`);
      process.exit(0);
    }
    process.stderr.write(`Server error: ${err.message}\n`);
    process.exit(1);
  });

  server.listen(PORT, '127.0.0.1', () => {
    dlog(`listening on 127.0.0.1:${PORT}`);
    startupTimer = setTimeout(() => {
      if (activePIDs.size === 0) {
        dlog('no client registered within startup grace; shutting down');
        shutdownServer();
        process.exit(0);
      }
    }, STARTUP_GRACE_MS);
    startupTimer.unref();
  });
}

// --- Request handling ------------------------------------------------------

function handleChatCompletion(req, res) {
  let body = '';
  let size = 0;
  const MAX_SIZE = 10 * 1024 * 1024;

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

    const model = payload.model || MODELS[0];
    const isStream = payload.stream === true;
    dlog(`POST /v1/chat/completions model=${model} stream=${isStream}`);

    if (isAnthropicModel(model)) {
      proxyAnthropic(req, res, payload, model, isStream);
    } else {
      proxyOpenAI(req, res, payload, model, isStream);
    }
  });
}

// --- OpenAI proxy (passthrough) --------------------------------------------

function proxyOpenAI(req, res, payload, model, isStream) {
  const upstreamPayload = JSON.stringify({ ...payload, model });
  dlog(`proxyOpenAI -> ${BASE_URL}/v1/chat/completions`);

  const upstreamReq = https.request({
    hostname: 'opencode.ai',
    port: 443,
    path: '/zen/go/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UPSTREAM_API_KEY}`,
      'Content-Length': Buffer.byteLength(upstreamPayload)
    }
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.on('error', (err) => {
    dlog(`upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: `Upstream error: ${err.message}` } }));
    }
  });

  // Client disconnect -> abort upstream
  res.on('close', () => {
    if (!res.writableEnded) upstreamReq.destroy();
  });

  upstreamReq.write(upstreamPayload);
  upstreamReq.end();
}

// --- Anthropic proxy (with format translation) -----------------------------

function proxyAnthropic(req, res, payload, model, isStream) {
  // Convert OpenAI messages to Anthropic messages format
  const anthropicMessages = [];
  let systemPrompt = '';

  for (const msg of (payload.messages || [])) {
    if (!msg) continue;
    const role = msg.role || 'user';
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      }).join('\n');
    }
    text = text.trim();
    if (!text) continue;

    if (role === 'system') {
      if (systemPrompt) systemPrompt += '\n\n' + text;
      else systemPrompt = text;
    } else {
      const mappedRole = role === 'assistant' ? 'assistant' : 'user';
      if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === mappedRole) {
        anthropicMessages[anthropicMessages.length - 1].content += '\n\n' + text;
      } else {
        anthropicMessages.push({ role: mappedRole, content: text });
      }
    }
  }

  if (anthropicMessages.length > 0 && anthropicMessages[0].role === 'assistant') {
    anthropicMessages.unshift({ role: 'user', content: '(empty)' });
  }

  const anthropicPayload = {
    model,
    messages: anthropicMessages,
    max_tokens: payload.max_tokens || 4096,
    stream: isStream,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {})
  };

  dlog(`proxyAnthropic -> ${BASE_URL}/v1/messages model=${model} msgs=${anthropicMessages.length}`);

  const upstreamPayload = JSON.stringify(anthropicPayload);
  const upstreamReq = https.request({
    hostname: 'opencode.ai',
    port: 443,
    path: '/zen/go/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UPSTREAM_API_KEY}`,
      'Content-Length': Buffer.byteLength(upstreamPayload),
      'Accept': 'application/json'
    }
  }, (upstreamRes) => {
    if (isStream && upstreamRes.statusCode === 200) {
      handleAnthropicStream(res, upstreamRes, model);
    } else {
      handleAnthropicNonStream(res, upstreamRes, model);
    }
  });

  upstreamReq.on('error', (err) => {
    dlog(`upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: `Upstream error: ${err.message}` } }));
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) upstreamReq.destroy();
  });

  upstreamReq.write(upstreamPayload);
  upstreamReq.end();
}

function handleAnthropicNonStream(res, upstreamRes, model) {
  let body = '';
  upstreamRes.on('data', chunk => { body += chunk; });
  upstreamRes.on('end', () => {
    if (upstreamRes.statusCode !== 200) {
      res.writeHead(upstreamRes.statusCode || 502, JSON_HEADERS);
      res.end(body || JSON.stringify({ error: { message: 'Upstream error' } }));
      return;
    }

    let upstreamData;
    try {
      upstreamData = JSON.parse(body);
    } catch {
      res.writeHead(502, JSON_HEADERS);
      res.end(JSON.stringify({ error: { message: 'Invalid upstream response' } }));
      return;
    }

    const content = upstreamData.content || [];
    let text = '';
    for (const item of content) {
      if (item.type === 'text' && typeof item.text === 'string') {
        text += item.text;
      }
    }

    const openAIResponse = {
      id: upstreamData.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: upstreamData.stop_reason || 'stop'
      }],
      usage: upstreamData.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(openAIResponse));
  });
}

function handleAnthropicStream(res, upstreamRes, model) {
  res.writeHead(200, SSE_HEADERS);

  const cid = `chatcmpl-${Date.now()}`;
  const now = () => Math.floor(Date.now() / 1000);

  // Send opening chunk
  res.write(`data: ${JSON.stringify({
    id: cid,
    object: 'chat.completion.chunk',
    created: now(),
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
  })}\n\n`);

  const decoder = new StringDecoder('utf8');
  let buffer = '';

  upstreamRes.on('data', chunk => {
    buffer += decoder.write(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Anthropic SSE format: event: <type>\ndata: <json>\n\n
      if (trimmed.startsWith('event: ')) {
        // event line, skip for now; we care about data lines
        continue;
      }
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        let data;
        try { data = JSON.parse(dataStr); } catch { continue; }

        if (data.type === 'content_block_delta' && data.delta && typeof data.delta.text === 'string') {
          res.write(`data: ${JSON.stringify({
            id: cid,
            object: 'chat.completion.chunk',
            created: now(),
            model,
            choices: [{ index: 0, delta: { content: data.delta.text }, finish_reason: null }]
          })}\n\n`);
        } else if (data.type === 'message_stop') {
          res.write(`data: ${JSON.stringify({
            id: cid,
            object: 'chat.completion.chunk',
            created: now(),
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
          })}\n\n`);
        }
      }
    }
  });

  upstreamRes.on('end', () => {
    // Handle any remaining buffer
    const remaining = decoder.end() + buffer;
    if (remaining.trim()) {
      for (const line of remaining.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          let data;
          try { data = JSON.parse(dataStr); } catch { continue; }
          if (data.type === 'content_block_delta' && data.delta && typeof data.delta.text === 'string') {
            res.write(`data: ${JSON.stringify({
              id: cid,
              object: 'chat.completion.chunk',
              created: now(),
              model,
              choices: [{ index: 0, delta: { content: data.delta.text }, finish_reason: null }]
            })}\n\n`);
          } else if (data.type === 'message_stop') {
            res.write(`data: ${JSON.stringify({
              id: cid,
              object: 'chat.completion.chunk',
              created: now(),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
            })}\n\n`);
          }
        }
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  upstreamRes.on('error', (err) => {
    dlog(`anthropic stream error: ${err.message}`);
    res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  res.on('close', () => {
    if (!res.writableEnded) upstreamRes.destroy();
  });
}
