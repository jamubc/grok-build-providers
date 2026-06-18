# grok-codex (Codex provider)

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![Runtime](https://img.shields.io/badge/runtime-Node.js-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/github/license/jamubc/grok-build-providers)
![API](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?logo=openai&logoColor=white)

Give Grok Build access to Codex CLI OAuth models.

It installs a `grok-codex` command:

```bash
grok-codex -p "Say ok"
```

`grok-codex` starts Grok Build with `-m codex`. The `grok-codex` wrapper spins up a Node-native, inline, zero-dependency OpenAI-compatible proxy server on port `8319` while Grok is running, and shuts it down on exit.

Default model:

```toml
model = "gpt-5.5"
```

## What It Does

- Spins up an inline local proxy server on `127.0.0.1:8319` when `grok-codex` is launched.
- Routes `/v1/chat/completions` requests from Grok directly to the local `codex` CLI command.
- Adds Grok model configuration for `codex` targeting the inline server.
- Adds command `grok-codex`.

## Prerequisites

- macOS.
- Node.js ≥ 18.
- Grok Build installed at `~/.grok/bin/grok` or available as `grok`.
- Codex CLI (`codex`) installed and authenticated.

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
grok-codex -p "Say ok"
```

Check the model:

```bash
grep -A7 '^\[model.codex\]' ~/.grok/config.toml
```

## Models

Exposed Codex models:

- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.3-codex`
- `gpt-5.2`

`codex` is pinned to `gpt-5.5` by default.

## Security

Generated local proxy key:

```text
~/.cli-proxy-api/grok-codex.env
```

Do not commit this file.
