# grok-build-providers

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/github/license/jamubc/grok-build-providers)
![npm version](https://img.shields.io/npm/v/grok-build-providers?color=339933&logo=npm&logoColor=white)

Give Grok Build access to third-party models natively, without background services.

These connectors spin up light, zero-dependency inline HTTP proxies on-the-fly only when Grok is running.

> **Disclaimer:** `grok-build-providers` is an independent, community-built tool. It is **not affiliated with, endorsed by, or sponsored by x.AI, Grok, or any model provider** (OpenAI/Codex, Google/Gemini/Antigravity, DeepSeek, or Alibaba/Qwen). All product names and trademarks belong to their respective owners and are used only to describe interoperability.

## Prerequisites

- The **`grok` CLI** installed and on your `PATH`. This tool *configures* Grok's connectors — it does not install Grok itself.
- For the inline connectors, the backing CLI must be installed and signed in: **`agy`** (Antigravity/Gemini) or **`codex`** (Codex). The passthrough connectors (**DeepSeek**, **Qwen**) only need an API key.

## Connectors

All connectors are distributed in a single, unified npm package `grok-build-providers`.

| Command | Logo | Default Model | Config Snippet | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`grok-agy`** | <img src="assets/gemini_logo.png" height="24" valign="middle"> | `gemini-3.5-flash` | [toml](providers/agy/templates/grok-config-snippet.toml) | Gemini models via Antigravity CLI OAuth |
| **`grok-codex`** | <img src="assets/codex_logo.png" height="24" valign="middle"> | `gpt-5.5` | [toml](providers/codex/templates/grok-config-snippet.toml) | Codex models via the Codex CLI OAuth |
| **`grok-deepseek`** | <img src="assets/deepseek_logo.png" height="24" valign="middle"> | `deepseek-v4-flash` | [manifest](providers/providers.json) | DeepSeek API direct compatible-mode integration |
| **`grok-qwen`** | <img src="assets/qwen_logo.png" height="24" valign="middle"> | `qwen2.5-coder-32b-instruct` | [manifest](providers/providers.json) | Alibaba DashScope Qwen2.5-Coder models |

> The full connector list is the single source of truth in [`providers/providers.json`](providers/providers.json). See [CONTRIBUTING.md](CONTRIBUTING.md) to add one.

---

## Interactive Configuration Console & TUI

`grok-build-providers` provides a zero-dependency interactive control panel to manage all your model connectors.

### Install (recommended)

Install globally with npm, then launch the console:

```bash
npm install -g grok-build-providers
grok-build-providers
```

A global install is the recommended setup — it gives every connector, including the inline ones (`agy`, `codex`), a stable home. (See [Trying it without installing](#trying-it-without-installing) for the `npx` caveat.)

### Headless / non-interactive

Install connectors directly, without the menu:

```bash
grok-build-providers agy        # install the Gemini/Antigravity connector
grok-build-providers codex      # install the Codex connector
grok-build-providers deepseek   # install the DeepSeek connector
grok-build-providers qwen       # install the Qwen Coder connector
grok-build-providers all        # install everything
```

### Trying it without installing

`npx grok-build-providers` is fine for a quick look, and for the **passthrough** connectors (DeepSeek, Qwen) whose launchers are self-contained. It is **not** suitable for day-to-day use of the **inline** connectors (`agy`, `codex`): their launchers point back at the package directory, so once npm purges its temporary `npx` cache they break. For anything beyond a one-off trial, install globally.

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
* **Active Model Switcher**: Swap between connectors (`agy`, `codex`, `deepseek`, `qwen`) as the active default model in your `~/.grok/config.toml` with a single keypress.
* **Option Adjuster**: Switch default models inside each connector (e.g. `gpt-5.5` vs `gpt-5.4` on Codex, or `gemini-3.5-flash` vs `gemini-3-pro` on AGY).
* **Quick Installer / Uninstaller**: Set up or cleanly remove any or all connectors — launcher, credentials file, and `config.toml` block — with execution logs rendered inline.
* **Launch**: Start a Grok session on the active connector straight from the menu (press `space`).

---

## Getting Started

### Local Setup (Clone)
Everything lives in this one repository — no submodules to initialize:

```bash
git clone https://github.com/jamubc/grok-build-providers.git
cd grok-build-providers
```

### Installed commands

A global install (see [Install](#install-recommended)) registers:
- `grok-build-providers` — the TUI / configuration manager
- `grok-agy` — run Grok via the Antigravity proxy
- `grok-codex` — run Grok via the Codex proxy
- `grok-deepseek` — run Grok via DeepSeek
- `grok-qwen` — run Grok via Qwen Coder

---

## Issues & Contributions

Have a bug or feature request?
* Please open an issue on the **[GitHub Issue Tracker](https://github.com/jamubc/grok-build-providers/issues)**.
* Check the **[Releases & Downloads](https://github.com/jamubc/grok-build-providers/releases)** for stable tags and archives.
