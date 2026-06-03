'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { loadEnvFile, readKey } = require('./env');

const HOME = os.homedir();
const CLIPROXY_AUTH_DIR = process.env.CLIPROXY_AUTH_DIR || path.join(HOME, '.cli-proxy-api');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    runDaemon(port, expectedKey, backendBin, models, format, spawnArgs);
  } else {
    runClient(port, expectedKey, grokBin, name);
  }
}

// --- Client logic ---
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
  let registered = false;
  for (let i = 0; i < 15; i++) {
    try {
      await sendProxyRef(port, expectedKey, 'add');
      registered = true;
      break;
    } catch (err) {
      if (i === 0) {
        // Spawn the daemon process detached
        const daemon = spawn(process.execPath, [process.argv[1], '--daemon'], {
          detached: true,
          stdio: 'ignore',
          env: process.env
        });
        daemon.unref();
      }
      await new Promise(resolve => setTimeout(resolve, 150));
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

// --- Daemon logic ---
function runDaemon(port, expectedKey, backendBin, models, format, spawnArgs) {
  const activePIDs = new Set();
  let idleTimeout = null;

  function isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  function checkIdle() {
    if (activePIDs.size === 0) {
      if (!idleTimeout) {
        idleTimeout = setTimeout(() => {
          if (activePIDs.size === 0) {
            shutdownServer();
            process.exit(0);
          }
        }, 5000);
      }
    } else {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }
    }
  }

  const cleanupInterval = setInterval(() => {
    let changed = false;
    for (const pid of activePIDs) {
      if (!isPidAlive(pid)) {
        activePIDs.delete(pid);
        changed = true;
      }
    }
    if (changed) {
      checkIdle();
    }
  }, 3000);
  cleanupInterval.unref();

  function shutdownServer() {
    clearInterval(cleanupInterval);
    server.close();
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const authHeader = req.headers['authorization'] || '';
    if (authHeader !== `Bearer ${expectedKey}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Unauthorized: Invalid API Key' } }));
      return;
    }

    if (req.url.startsWith('/v1/proxy-ref')) {
      const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      const action = urlObj.searchParams.get('action');
      const pid = parseInt(urlObj.searchParams.get('pid'), 10);
      
      if (action === 'add' && pid) {
        activePIDs.add(pid);
        checkIdle();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      } else if (action === 'remove' && pid) {
        activePIDs.delete(pid);
        checkIdle();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid action or pid' } }));
      return;
    }

    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        data: models
      }));
      return;
    }

    if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
      let body = '';
      let size = 0;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit

      const cleanupRequest = () => {
        req.destroy();
      };
      req.on('aborted', cleanupRequest);

      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_SIZE) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Request Entity Too Large' } }));
          req.destroy();
          return;
        }
        body += chunk;
      });

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
        const model = payload.model || (models[0] && models[0].id);

        const args = spawnArgs(model, prompt);
        const child = spawn(backendBin, args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });

        const killChild = () => {
          if (!child.killed) {
            try { child.kill('SIGTERM'); } catch {}
          }
        };
        req.on('aborted', killChild);
        req.on('close', killChild);
        res.on('close', killChild);
        res.on('error', () => {});

        const decoder = new StringDecoder('utf8');

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked'
          });

          if (format === 'plain') {
            child.stdout.on('data', chunk => {
              if (res.writableEnded || res.destroyed) return;
              const text = decoder.write(chunk);
              if (!text) return;
              const sseObj = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
              };
              res.write(`data: ${JSON.stringify(sseObj)}\n\n`);
            });

            child.on('close', code => {
              if (res.writableEnded || res.destroyed) return;
              const remaining = decoder.end();
              if (remaining) {
                const sseObj = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: { content: remaining }, finish_reason: null }]
                };
                res.write(`data: ${JSON.stringify(sseObj)}\n\n`);
              }
              if (code !== 0) {
                res.write(`data: ${JSON.stringify({ error: { message: stderr.trim() || `${binaryName} CLI exited with code ${code}` } })}\n\n`);
              } else {
                const finalSseObj = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
                };
                res.write(`data: ${JSON.stringify(finalSseObj)}\n\n`);
              }
              res.write('data: [DONE]\n\n');
              res.end();
            });
          } else if (format === 'json-lines') {
            let buffer = '';
            child.stdout.on('data', chunk => {
              if (res.writableEnded || res.destroyed) return;
              buffer += decoder.write(chunk);
              const lines = buffer.split('\n');
              buffer = lines.pop();

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === 'error') {
                    res.write(`data: ${JSON.stringify({ error: { message: parsed.message } })}\n\n`);
                  } else if (parsed.type === 'turn.failed' && parsed.error) {
                    res.write(`data: ${JSON.stringify({ error: { message: parsed.error.message } })}\n\n`);
                  } else if (parsed.type === 'content_block_delta' && parsed.delta) {
                    const text = parsed.delta.text || parsed.delta.thinking || '';
                    if (text) {
                      const sseObj = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model,
                        choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
                      };
                      res.write(`data: ${JSON.stringify(sseObj)}\n\n`);
                    }
                  }
                } catch {}
              }
            });

            child.on('close', code => {
              if (res.writableEnded || res.destroyed) return;
              buffer += decoder.end();
              if (buffer.trim()) {
                try {
                  const parsed = JSON.parse(buffer);
                  if (parsed.type === 'content_block_delta' && parsed.delta) {
                    const text = parsed.delta.text || parsed.delta.thinking || '';
                    if (text) {
                      const sseObj = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model,
                        choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
                      };
                      res.write(`data: ${JSON.stringify(sseObj)}\n\n`);
                    }
                  }
                } catch {}
              }

              if (code !== 0) {
                res.write(`data: ${JSON.stringify({ error: { message: stderr.trim() || `${binaryName} CLI exited with code ${code}` } })}\n\n`);
              } else {
                const finalSseObj = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
                };
                res.write(`data: ${JSON.stringify(finalSseObj)}\n\n`);
              }
              res.write('data: [DONE]\n\n');
              res.end();
            });
          }

          child.on('error', err => {
            if (res.writableEnded || res.destroyed) return;
            res.write(`data: ${JSON.stringify({ error: { message: `Failed to spawn ${binaryName} CLI: ${err.message}` } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          });

        } else {
          let fullText = '';
          if (format === 'plain') {
            child.stdout.on('data', chunk => {
              fullText += decoder.write(chunk);
            });
            child.on('close', code => {
              if (res.writableEnded || res.destroyed) return;
              fullText += decoder.end();
              if (code !== 0) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: stderr.trim() || `${binaryName} CLI exited with code ${code}` } }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, message: { role: 'assistant', content: fullText }, finish_reason: 'stop' }],
                  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
                }));
              }
            });
          } else if (format === 'json-lines') {
            let buffer = '';
            child.stdout.on('data', chunk => {
              buffer += decoder.write(chunk);
              const lines = buffer.split('\n');
              buffer = lines.pop();

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === 'content_block_delta' && parsed.delta) {
                    fullText += parsed.delta.text || parsed.delta.thinking || '';
                  }
                } catch {}
              }
            });
            child.on('close', code => {
              if (res.writableEnded || res.destroyed) return;
              buffer += decoder.end();
              if (buffer.trim()) {
                try {
                  const parsed = JSON.parse(buffer);
                  if (parsed.type === 'content_block_delta' && parsed.delta) {
                    fullText += parsed.delta.text || parsed.delta.thinking || '';
                  }
                } catch {}
              }

              if (code !== 0) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: stderr.trim() || `${binaryName} CLI exited with code ${code}` } }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, message: { role: 'assistant', content: fullText }, finish_reason: 'stop' }],
                  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
                }));
              }
            });
          }

          child.on('error', err => {
            if (res.writableEnded || res.destroyed) return;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: `Failed to spawn ${binaryName} CLI: ${err.message}` } }));
          });
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not Found' } }));
  });

  server.on('error', (err) => {
    process.stderr.write(`Server error: ${err.message}\n`);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    // Daemon starts, waiting for client registrations
    checkIdle();
  });
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
