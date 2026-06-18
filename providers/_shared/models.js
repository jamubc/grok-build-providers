'use strict';

// Live model discovery for passthrough connectors.
//
// Passthrough providers (DeepSeek, Qwen, OpenRouter, ...) point at a real
// OpenAI-compatible API, every one of which exposes `GET {baseUrl}/models`.
// OpenRouter alone lists hundreds of models that change by the hour, so pinning
// a static list in providers.json would be stale the moment it is written.
// Instead the TUI calls this at runtime and shows whatever the provider returns
// right now. Zero-dependency: built on the Node `https` module with a short
// timeout. Callers degrade to the manifest `defaultModel` on any failure.
//
// Custom (inline-proxy) connectors do NOT use this: their `/v1/models` is
// synthesised locally from the manifest by _shared/proxy.js, because an OAuth
// CLI bridge has no upstream catalogue endpoint to query.

const https = require('https');

// GET {baseUrl}/models and return the list of model id strings.
// `apiKey` is sent as a Bearer token when provided (OpenRouter needs none;
// DeepSeek and DashScope do). Resolves to a de-duplicated string[]; rejects on
// network error, non-2xx status, timeout, or unparseable body.
function fetchModels(entry, { apiKey, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const base = (entry && entry.baseUrl) || '';
    if (!/^https:\/\//i.test(base)) {
      reject(new Error('live models require an https baseUrl'));
      return;
    }
    const url = base.replace(/\/+$/, '') + '/models';

    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const req = https.get(url, { headers }, (res) => {
      const { statusCode } = res;
      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`models endpoint returned HTTP ${statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        // Guard against a pathological response; 8 MB is far beyond any real
        // /models payload.
        if (body.length > 8 * 1024 * 1024) {
          req.destroy(new Error('models response too large'));
        }
      });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(body);
        } catch (err) {
          reject(new Error(`could not parse models response: ${err.message}`));
          return;
        }
        // OpenAI shape is { data: [{ id }] }; tolerate a bare array too.
        const list = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
        const ids = [];
        const seen = new Set();
        for (const item of list) {
          const id = typeof item === 'string' ? item : item && item.id;
          if (typeof id === 'string' && id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (!ids.length) {
          reject(new Error('models endpoint returned no models'));
          return;
        }
        resolve(ids);
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`models endpoint timed out after ${timeoutMs}ms`));
    });
  });
}

module.exports = { fetchModels };
