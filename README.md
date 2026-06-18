# grok-build-providers

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/github/license/jamubc/grok-build-providers)
![npm version](https://img.shields.io/npm/v/grok-build-providers?color=339933&logo=npm&logoColor=white)

Give Grok Build access to third-party models natively, without background services.

<img width="781" height="243" alt="Screenshot 2026-06-03 at 4 25 10 PM" src="https://github.com/user-attachments/assets/b861d3b6-f0b0-4287-a18c-439378f7337b" />


These connectors spin up light, zero-dependency inline HTTP proxies on-the-fly only when Grok is running.

> **Disclaimer:** `grok-build-providers` is an independent, community-built tool. It is **not affiliated with, endorsed by, or sponsored by x.AI, Grok, or any model provider** (OpenAI/Codex, Google/Gemini/Antigravity, DeepSeek, Alibaba/Qwen, or OpenRouter). All product names and trademarks belong to their respective owners and are used only to describe interoperability.

## Prerequisites

- **[Grok Build](https://x.ai/cli)** installed and on your `PATH`. This tool configures Grok's connectors; it does not install Grok Build itself.
- For the inline connectors, the backing CLI must be installed and signed in: **`agy`** (Antigravity/Gemini) or **`codex`** (Codex). The passthrough connectors (**DeepSeek**, **Qwen**, **OpenRouter**) only need an API key.

## Connectors

All connectors are distributed in a single, unified npm package `grok-build-providers`.

| Command | Provider | Default Model | Config Snippet | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`grok-agy`** | ![Gemini](https://img.shields.io/badge/Gemini-8E75B2?logo=googlegemini&logoColor=white&style=flat-square) | `gemini-3.5-flash` | [toml](providers/agy/templates/grok-config-snippet.toml) | Gemini models via Antigravity CLI OAuth |
| **`grok-codex`** | ![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white&style=flat-square) | `gpt-5.5` | [toml](providers/codex/templates/grok-config-snippet.toml) | Codex models via the Codex CLI OAuth |
| **`grok-deepseek`** | ![DeepSeek](https://img.shields.io/badge/DeepSeek-4D6BFE?logo=deepseek&logoColor=white&style=flat-square) | `deepseek-v4-flash` | [manifest](providers/providers.json) | DeepSeek API direct compatible-mode integration |
| **`grok-qwen`** | ![Qwen](https://img.shields.io/badge/Qwen-FF6A00?logo=qwen&logoColor=white&style=flat-square) | `qwen2.5-coder-32b-instruct` | [manifest](providers/providers.json) | Alibaba DashScope Qwen models |
| **`grok-openrouter`** | ![OpenRouter](https://img.shields.io/badge/OpenRouter-6566F1?logo=openrouter&logoColor=white&style=flat-square) | `openrouter/auto` | [manifest](providers/providers.json) | Hundreds of models across providers; list fetched live |

> The full connector list is the single source of truth in [`providers/providers.json`](providers/providers.json). See [CONTRIBUTING.md](CONTRIBUTING.md) to add one.
>
> Passthrough connectors (DeepSeek, Qwen, OpenRouter) pull their selectable model list live from the provider's `/models` endpoint each run, so nothing is pinned in the repo.

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
grok-build-providers agy        # install the Gemini/Antigravity connector
grok-build-providers codex      # install the Codex connector
grok-build-providers deepseek   # install the DeepSeek connector
grok-build-providers qwen       # install the Qwen Coder connector
grok-build-providers openrouter # install the OpenRouter connector
grok-build-providers all        # install everything
```

### Running without installing

```bash
npx grok-build-providers
```

Use `npx` for a quick try without a global install. What works and what does not:

- **DeepSeek, Qwen, OpenRouter (passthrough):** fully supported via `npx`. Their launchers are self-contained and only need an API key.
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

Troubleshooting: set `GROK_PROXY_DEBUG=1` before a `grok-<name>` command to write a trace to `~/.cli-proxy-api/logs/inline-proxy-debug.log`.

---

## Features
* **Status Monitor**: Checks the installation status of all connectors and reports their active default models.
* **Active Model Switcher**: Swap between connectors (`agy`, `codex`, `deepseek`, `qwen`, `openrouter`) as the active default model in your `~/.grok/config.toml` with a single keypress.
* **Option Adjuster**: Switch default models inside each connector (e.g. `gpt-5.5` vs `gpt-5.4` on Codex, or `gemini-3.5-flash` vs `gemini-3-pro` on AGY). Passthrough connectors load their full model list live from the provider's `/models` endpoint.
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
| `grok-qwen` | Grok Build with Qwen Coder |
| `grok-openrouter` | Grok Build with OpenRouter (live model list) |

---

## Issues & Contributions

Have a bug or feature request?
* Please open an issue on the **[GitHub Issue Tracker](https://github.com/jamubc/grok-build-providers/issues)**.
* Check the **[Releases & Downloads](https://github.com/jamubc/grok-build-providers/releases)** for stable tags and archives.
