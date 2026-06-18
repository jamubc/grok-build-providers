# grok-agy (Antigravity provider)

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/github/license/jamubc/grok-build-providers)
![API](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?logo=openai&logoColor=white)

Give Grok Build access to Antigravity CLI OAuth models.

It installs a `grok-agy` command:

```bash
grok-agy -p "Say ok"
```

`grok-agy` starts Grok Build with `-m agy`. The `grok-agy` wrapper spins up a Node-native, inline, zero-dependency OpenAI-compatible proxy server on port `8318` while Grok is running, and shuts it down on exit.

Default model:

```toml
model = "gemini-3.5-flash"
```

## What It Does

- Spins up an inline local proxy server on `127.0.0.1:8318` when `grok-agy` is launched.
- Routes `/v1/chat/completions` requests from Grok directly to the local `agy` CLI command.
- Adds Grok model configuration for `agy` targeting the inline server.
- Adds command `grok-agy`.

## Prerequisites

- macOS.
- Node.js ≥ 18.
- Grok Build installed at `~/.grok/bin/grok` or available as `grok`.
- Antigravity CLI (`agy`) installed and authenticated.

## Install

```bash
node lib/install.js
```

Or via npm script:

```bash
npm run install-proxy
```

Verify:

```bash
grok-agy -p "Say ok"
```

Check the model:

```bash
grep -A7 '^\[model.agy\]' ~/.grok/config.toml
```

## Models

Exposed Antigravity models:

- `gemini-3.5-flash`
- `gemini-3-pro`
- `gemini-3-pro-thinking`
- `gemini-2.5-pro`
- `gemini-2.5-flash`

`agy` is pinned to `gemini-3.5-flash` by default.

## Security

Generated local proxy key:

```text
~/.cli-proxy-api/grok-agy.env
```

Do not commit this file.
