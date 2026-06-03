#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');
const ENV_FILE = path.join(CLIPROXY_AUTH_DIR, 'grok-agy.env');
const PORT = 8318;

// ---------------------------------------------------------------------------
// 1. Load env
// ---------------------------------------------------------------------------
if (fs.existsSync(ENV_FILE)) {
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const expectedKey = process.env.GROK_AGY_PROXY_API_KEY;
if (!expectedKey) {
  process.stderr.write('Error: missing GROK_AGY_PROXY_API_KEY in environment or env file.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Resolve binaries
// ---------------------------------------------------------------------------
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
  return cmd; // fallback to PATH resolution
}

const grokLocal = path.join(HOME, '.grok', 'bin', 'grok');
const grokBin = fs.existsSync(grokLocal) ? grokLocal : 'grok';
const agyBin = findBinary('agy');

// ---------------------------------------------------------------------------
// 3. Helper: convert messages to single prompt
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 4. HTTP Server (Inline OpenAI Proxy) and Reference Counting
// ---------------------------------------------------------------------------
const activePIDs = new Set([process.pid]);

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const cleanupInterval = setInterval(() => {
  let changed = false;
  for (const pid of activePIDs) {
    if (pid !== process.pid && !isPidAlive(pid)) {
      activePIDs.delete(pid);
      changed = true;
    }
  }
  if (changed && activePIDs.size === 0) {
    shutdownServer();
  }
}, 5000);
cleanupInterval.unref();

function shutdownServer() {
  clearInterval(cleanupInterval);
  server.close();
}

function sendProxyRef(port, action) {
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
      res.resume(); // drain the response so the socket is freed
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

const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Authorization check
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${expectedKey}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Unauthorized: Invalid API Key' } }));
    return;
  }

  // Route: POST/GET /v1/proxy-ref
  if (req.url.startsWith('/v1/proxy-ref')) {
    const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const action = urlObj.searchParams.get('action');
    const pid = parseInt(urlObj.searchParams.get('pid'), 10);
    
    if (action === 'add' && pid) {
      activePIDs.add(pid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    } else if (action === 'remove' && pid) {
      activePIDs.delete(pid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      if (activePIDs.size === 0) {
        setTimeout(() => {
          shutdownServer();
        }, 50);
      }
      return;
    }
    
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Invalid action or pid' } }));
    return;
  }

  // Route: GET /v1/models
  if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gemini-3.5-flash', object: 'model', created: 1677610602, owned_by: 'google' },
        { id: 'gemini-3-pro', object: 'model', created: 1677610602, owned_by: 'google' },
        { id: 'gemini-3-pro-thinking', object: 'model', created: 1677610602, owned_by: 'google' },
        { id: 'gemini-2.5-pro', object: 'model', created: 1677610602, owned_by: 'google' },
        { id: 'gemini-2.5-flash', object: 'model', created: 1677610602, owned_by: 'google' }
      ]
    }));
    return;
  }

  // Route: POST /v1/chat/completions
  if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
        return;
      }

      const prompt = messagesToPrompt(payload.messages || []);
      const isStream = payload.stream === true;
      const model = payload.model || 'gemini-3.5-flash';

      // Spawn agy CLI to process the prompt
      const child = spawn(agyBin, ['-p', prompt, '--print-timeout', '10m'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });

      // If the client disconnects, kill the child so it is not orphaned, and
      // swallow socket errors so a write-after-close does not crash the
      // (long-lived) proxy and take down every other registered grok instance.
      res.on('error', () => {});
      res.on('close', () => {
        if (!child.killed) {
          try { child.kill('SIGTERM'); } catch {}
        }
      });

      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Transfer-Encoding': 'chunked'
        });

        child.stdout.on('data', chunk => {
          if (res.writableEnded || res.destroyed) return;
          const text = chunk.toString();
          const sseObj = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: { content: text },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(sseObj)}\n\n`);
        });

        child.on('close', code => {
          if (res.writableEnded || res.destroyed) return;
          if (code !== 0) {
            res.write(`data: ${JSON.stringify({ error: { message: stderr.trim() || `agy CLI exited with code ${code}` } })}\n\n`);
          } else {
            const finalSseObj = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }]
            };
            res.write(`data: ${JSON.stringify(finalSseObj)}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
        });

        child.on('error', err => {
          res.write(`data: ${JSON.stringify({ error: { message: `Failed to spawn agy CLI: ${err.message}` } })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        });

      } else {
        let fullText = '';
        child.stdout.on('data', chunk => { fullText += chunk.toString(); });

        child.on('close', code => {
          if (res.writableEnded || res.destroyed) return;
          if (code !== 0) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: stderr.trim() || `agy CLI exited with code ${code}` } }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                message: { role: 'assistant', content: fullText },
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            }));
          }
        });

        child.on('error', err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: `Failed to spawn agy CLI: ${err.message}` } }));
        });
      }
    });
    return;
  }

  // Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Not Found' } }));
});

// ---------------------------------------------------------------------------
// 5. Start Server and Spawn Grok
// ---------------------------------------------------------------------------
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    try {
      // Register with the existing proxy server
      await sendProxyRef(PORT, 'add');
      
      // Spawn grok and forward arguments
      const args = ['-m', 'agy', ...process.argv.slice(2)];
      const grokProcess = spawn(grokBin, args, {
        stdio: 'inherit',
        env: process.env
      });

      const forwardSignal = (signal) => {
        try { grokProcess.kill(signal); } catch {}
      };
      process.on('SIGINT', () => forwardSignal('SIGINT'));
      process.on('SIGTERM', () => forwardSignal('SIGTERM'));

      grokProcess.on('exit', async (code) => {
        try {
          await sendProxyRef(PORT, 'remove');
        } catch {}
        process.exit(code ?? 0);
      });

      grokProcess.on('error', (err) => {
        process.stderr.write(`Failed to start grok: ${err.message}\n`);
        process.exit(1);
      });

    } catch (regErr) {
      process.stderr.write(`Error: Port ${PORT} is already occupied, and we could not register with the active proxy: ${regErr.message}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write(`Server error: ${err.message}\n`);
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  // Spawn grok and forward arguments
  const args = ['-m', 'agy', ...process.argv.slice(2)];
  const grokProcess = spawn(grokBin, args, {
    stdio: 'inherit',
    env: process.env
  });

  const forwardSignal = (signal) => {
    try { grokProcess.kill(signal); } catch {}
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  grokProcess.on('exit', (code) => {
    activePIDs.delete(process.pid);
    if (activePIDs.size === 0) {
      shutdownServer();
      process.exit(code ?? 0);
    }
  });

  grokProcess.on('error', (err) => {
    process.stderr.write(`Failed to start grok: ${err.message}\n`);
    shutdownServer();
    process.exit(1);
  });
});
