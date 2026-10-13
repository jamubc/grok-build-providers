# grok-build-providers

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/github/license/jamubc/grok-build-providers)
![npm version](https://img.shields.io/npm/v/grok-build-providers?color=339933&logo=npm&logoColor=white)

Give Grok Build access to third-party models natively, without background services.

<img width="781" height="243" alt="Screenshot 2026-06-03 at 4 25 10 PM" src="https://github.com/user-attachments/assets/b861d3b6-f0b0-4287-a18c-439378f7337b" />


These connectors spin up light, zero-dependency inline HTTP proxies on-the-fly only when Grok is running.

> **Disclaimer:** `grok-build-providers` is an independent, community-built tool. It is **not affiliated with, endorsed by, or sponsored by x.AI, Grok, or any model provider** (OpenAI/Codex, Google/Gemini/Antigravity, DeepSeek, Alibaba/Qwen, Moonshot/Kimi, Z.ai, Groq, OpenCode, or OpenRouter). All product names and trademarks belong to their respective owners and are used only to describe interoperability.

## Prerequisites

- **[Grok Build](https://x.ai/cli)** installed and on your `PATH`. This tool configures Grok's connectors; it does not install Grok Build itself.
- For the inline connectors, the backing CLI must be installed and signed in: **`agy`** (Antigravity) or **`codex`** (Codex). The passthrough connectors (**DeepSeek**, **Qwen**, **Kimi**, **Z.ai**, **Groq**, **OpenCode Go**, **OpenCode Zen**, **OpenRouter**) only need an API key.
- The OpenCode connectors use Grok Build's native `responses` and `messages` backends for GPT and Claude models, so they need a Grok Build recent enough to support `api_backend` and `extra_headers` in `config.toml` (tested with 1.0.46).

## Connectors

All connectors are distributed in a single, unified npm package `grok-build-providers`.

| Command | Provider | Default Model | Config Snippet | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`grok-agy`** | ![Antigravity](https://img.shields.io/badge/Antigravity-8E75B2?logo=googlegemini&logoColor=white&style=flat-square) | `gemini-3.8-flash-high` | [toml](providers/agy/templates/grok-config-snippet.toml) | Gemini, Claude, and GPT-OSS via the Antigravity CLI OAuth (inline proxy) |
| **`grok-codex`** | ![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white&style=flat-square) | `gpt-6-luna` | [toml](providers/codex/templates/grok-config-snippet.toml) | Codex models via the Codex CLI OAuth (inline proxy) |
| **`grok-deepseek`** | ![DeepSeek](https://img.shields.io/badge/DeepSeek-4D6BFE?logo=deepseek&logoColor=white&style=flat-square) | `deepseek-v4-flash` | [fragment](providers/deepseek/provider.json) | DeepSeek V4 via the first-party API |
| **`grok-qwen`** | ![Qwen](https://img.shields.io/badge/Qwen-FF6A00?logo=qwen&logoColor=white&style=flat-square) | `qwen3-coder-plus` | [fragment](providers/qwen/provider.json) | Alibaba Model Studio (DashScope international) |
| **`grok-kimi`** | ![Kimi](https://img.shields.io/badge/Kimi-000000?style=flat-square) | `kimi-k2.7-code` | [fragment](providers/kimi/provider.json) | Kimi K3 and K2.7 via the Moonshot AI open platform |
| **`grok-zai`** | ![Z.ai](https://img.shields.io/badge/Z.ai-2F6BFF?style=flat-square) | `glm-5.3` | [fragment](providers/zai/provider.json) | GLM-5.x via the Z.ai open platform |
| **`grok-groq`** | ![Groq](https://img.shields.io/badge/Groq-F55036?style=flat-square) | `openai/gpt-oss-120b` | [fragment](providers/groq/provider.json) | Open-weight models on Groq LPU inference |
| **`grok-opencode-go`** | ![OpenCode](https://img.shields.io/badge/OpenCode%20Go-F1ECEC?style=flat-square) | `kimi-k2.7-code` | [fragment](providers/opencode-go/provider.json) | OpenCode Go flat-rate subscription; GPT and Claude models switch to their native protocol |
| **`grok-opencode-zen`** | ![OpenCode](https://img.shields.io/badge/OpenCode%20Zen-F1ECEC?style=flat-square) | `glm-5.3` | [fragment](providers/opencode-zen/provider.json) | OpenCode pay-as-you-go console: Claude, GPT, Grok, and open models behind one key |
| **`grok-openrouter`** | ![OpenRouter](https://img.shields.io/badge/OpenRouter-6566F1?logo=openrouter&logoColor=white&style=flat-square) | `openrouter/auto` | [fragment](providers/openrouter/provider.json) | Hundreds of models across providers; list fetched live |

> Each connector is one fragment at `providers/<id>/provider.json`; `providers/providers.json` is the generated aggregate. See [CONTRIBUTING.md](CONTRIBUTING.md) to add one.
>
> Passthrough connectors pull their selectable model list live from the provider's `/models` endpoint each run, so nothing is pinned in the repo. The inline connectors (AGY, Codex) ask their CLI for the live roster when the proxy starts (`agy models`, Codex's models cache) and fall back to the manifest list offline.
>
> **OpenCode Go and Zen** front models that speak three different wire protocols. The connector maps each model to the backend Grok Build must use (`chat_completions` for GLM, Kimi, DeepSeek, MiMo and friends; `responses` for GPT and Grok; `messages` for Claude, MiniMax and Qwen), and the TUI rewrites `api_backend` when you switch models. Go also requires a stable `x-opencode-session` header, which the installer mints once per machine and keeps across reinstalls. Both share `OPENCODE_API_KEY`, so a key entered for one is picked up by the other.

---

## Interactive Configuration Console & TUI

`grok-build-providers` provides a zero-dependency interactive control panel to manage all your model connectors.

### Install (recommended)

Install globally with npm, then launch the console:

```bash
npm install -g grok-build-providers
grok-build-providers
```

A global install is the recommended setup: it gives every connector, including the inline ones (`agy`, `codex`), a stable home. (See [Trying it without installing](#trying-it-without-installing) for the `npx` caveat.)

### Headless / non-interactive

Install connectors directly, without the menu:

```bash
grok-build-providers agy          # Antigravity (inline proxy)
grok-build-providers codex        # Codex (inline proxy)
grok-build-providers deepseek     # DeepSeek
grok-build-providers qwen         # Qwen (Alibaba Model Studio)
grok-build-providers kimi         # Kimi (Moonshot AI)
grok-build-providers zai          # Z.ai (GLM)
grok-build-providers groq         # Groq
grok-build-providers opencode-go  # OpenCode Go
grok-build-providers opencode-zen # OpenCode Zen
grok-build-providers openrouter   # OpenRouter
grok-build-providers all          # install everything
```

### Running without installing

```bash
npx grok-build-providers
```

Use `npx` for a quick try without a global install. What works and what does not:

- **Passthrough connectors (DeepSeek, Qwen, Kimi, Z.ai, Groq, OpenCode Go/Zen, OpenRouter):** fully supported via `npx`. Their launchers are self-contained and only need an API key.
- **Gemini/AGY, Codex (inline):** unreliable via `npx`. Their launchers reference the package directory, so they break once npm clears its temporary `npx` cache. Use a global install for these.

---

## Running a connector

After installing, launch Grok on a connector with its `grok-<name>` command. It spins up the inline proxy on demand and shuts it down when you exit:

```bash
grok-agy                            # interactive Grok session on Antigravity/Gemini
grok-codex -p "explain this repo"   # one-shot prompt via Codex
```

Or set one as the global default in the TUI and press `space` to launch.

> **Custom connectors (`agy`, `codex`) must be started through their `grok-<name>` command** (or the TUI's launch), which starts the local proxy first. Running plain `grok` against them fails with `retrying…` because nothing is listening on the proxy port.

### API keys

Passthrough connectors read their key from `~/.cli-proxy-api/grok-<name>.env` (one `KEY=value` line, created empty by the installer) or from the matching variable in your shell: `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `MOONSHOT_API_KEY`, `ZAI_API_KEY`, `GROQ_API_KEY`, `OPENCODE_API_KEY`, `OPENROUTER_API_KEY`. If the variable is exported when you install, it is copied into the env file for you.

### Troubleshooting

- `grok models` lists every model Grok Build can see, including the connectors this tool added; a connector missing there means its `[model.<name>]` block is absent from `~/.grok/config.toml` (re-run the installer).
- Set `GROK_PROXY_DEBUG=1` before a `grok-<name>` command to write an inline-proxy trace to `~/.cli-proxy-api/logs/inline-proxy-debug.log`.
- A connector that answers plain prompts but fails on tool calls can usually be fixed by adding `stream_tool_calls = false` to its block; some third-party endpoints reject streamed tool-call deltas.

---

## Features
* **Status Monitor**: Checks the installation status of all connectors and reports their active default models.
* **Active Model Switcher**: Swap between connectors as the active default model in your `~/.grok/config.toml` with a single keypress.
* **Option Adjuster**: Switch default models inside each connector (e.g. `gpt-6-luna` vs `gpt-5.6-terra` on Codex, or `gemini-3.8-flash-high` vs `claude-opus-4-6-thinking` on AGY). Passthrough connectors load their full model list live from the provider's `/models` endpoint, with type-to-filter search; models that need a different wire protocol are marked `via responses` or `via messages` and the config follows the switch.
* **Quick Installer / Uninstaller**: Set up or cleanly remove any or all connectors (launcher, credentials file, and `config.toml` block) with execution logs rendered inline.
* **Launch**: Start a Grok session on the active connector straight from the menu (press `space`).

---

## Getting Started

### Prerequisites

Requires **[Grok Build](https://x.ai/cli)** (`grok`) on your PATH. Configuration lives in `~/.grok/config.toml`.

### Development

Clone the repository to contribute or run from source:

```bash
git clone https://github.com/jamubc/grok-build-providers.git
cd grok-build-providers
npm install
```

### Installed commands

A global install (see [Install](#install-recommended)) registers:

| Command | Description |
| :--- | :--- |
| `grok-build-providers` | Interactive TUI configuration manager |
| `grok-agy` | Grok Build with Antigravity (Gemini) proxy |
| `grok-codex` | Grok Build with Codex proxy |
| `grok-deepseek` | Grok Build with DeepSeek |
| `grok-qwen` | Grok Build with Qwen (Alibaba Model Studio) |
| `grok-kimi` | Grok Build with Kimi (Moonshot AI) |
| `grok-zai` | Grok Build with Z.ai GLM |
| `grok-groq` | Grok Build with Groq |
| `grok-opencode-go` | Grok Build with OpenCode Go |
| `grok-opencode-zen` | Grok Build with OpenCode Zen |
| `grok-openrouter` | Grok Build with OpenRouter (live model list) |

---

## Issues & Contributions

Have a bug or feature request?
* Please open an issue on the **[GitHub Issue Tracker](https://github.com/jamubc/grok-build-providers/issues)**.
* Check the **[Releases & Downloads](https://github.com/jamubc/grok-build-providers/releases)** for stable tags and archives.
