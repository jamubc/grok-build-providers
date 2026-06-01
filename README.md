# open-grok-build

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/github/license/jamubc/open-grok-build)
[![GitHub issues](https://img.shields.io/github/issues/jamubc/open-grok-build)](https://github.com/jamubc/open-grok-build/issues)
[![GitHub downloads](https://img.shields.io/github/downloads/jamubc/open-grok-build/total)](https://github.com/jamubc/open-grok-build/releases)

A unified collection of lightweight, zero-dependency connectors giving **Grok Build** native access to third-party language models. These connectors bypass background daemons like `CLIProxyAPI` and instead run Node-native inline proxy servers on-the-fly.

## Connectors & Packages

| Command | npm Package | Repository | Default Model |
| :--- | :--- | :--- | :--- |
| ⚡ **`grok-agy`** | [![npm](https://img.shields.io/npm/v/agy-for-grok-build?logo=npm&logoColor=white&color=339933)](https://www.npmjs.com/package/agy-for-grok-build) | [agy-for-grok-build](https://github.com/jamubc/agy-for-grok-build) | `gemini-3.5-flash` |
| 🧠 **`grok-codex`** | [![npm](https://img.shields.io/npm/v/codex-for-grok-build?logo=npm&logoColor=white&color=339933)](https://www.npmjs.com/package/codex-for-grok-build) | [codex-for-grok-build](https://github.com/jamubc/codex-for-grok-build) | `gpt-5.5` |
| 🚀 **`grok-deepseek`** | [![npm](https://img.shields.io/npm/v/deepseek-for-grok-build?logo=npm&logoColor=white&color=339933)](https://www.npmjs.com/package/deepseek-for-grok-build) | [deepseek-for-grok-build](https://github.com/jamubc/deepseek-for-grok-build) | `deepseek-v4-flash` |

---

## Interactive Configuration Console (TUI)

By cloning the parent repository `open-grok-build`, you get access to a root-level interactive TUI control panel. This zero-dependency CLI application lets you manage all your Grok Build connectors and settings dynamically.

```bash
./tui.js
```

### Features
* **📊 Live Status Monitor**: Checks the installation status of all connectors and reports their active default models.
* **🔄 Active Model Switcher**: Swap between connectors (`agy`, `codex`, `deepseek`) as the active default model in your `~/.grok/config.toml` with a single press.
* **⚙️ Option Adjuster**: Switch default models inside each connector (e.g. `gpt-5.5` vs `gpt-5.4` on Codex, or `gemini-3.5-flash` vs `gemini-3-pro` on AGY).
* **🚀 Quick Installer**: Install, re-install, or setup all connectors locally with execution logs rendered inline.

---

## Getting Started

### Clone the Repository
To clone this monorepo along with all its submodules:

```bash
git clone --recursive https://github.com/jamubc/open-grok-build.git
cd open-grok-build
```

If you already cloned the repository without the submodules:

```bash
git submodule update --init --recursive
```

### Installation

#### Option 1: The Interactive Console (Recommended)
Launch the console to configure and install everything interactively:

```bash
./tui.js
```

#### Option 2: Local Installer (via Shell)
You can install any of the connectors locally by executing the root `install.sh` in its folder:

```bash
cd codex
./install.sh
```

#### Option 3: Global via npm
Install any of the packages globally from the npm registry:

```bash
npm install -g agy-for-grok-build
npm install -g codex-for-grok-build
npm install -g deepseek-for-grok-build
```

---

## Issues & Contributions

Have a bug or feature request?
* Please open an issue on the **[Issue Tracker](https://github.com/jamubc/open-grok-build/issues)**.
* Check the **[Releases & Downloads](https://github.com/jamubc/open-grok-build/releases)** for stable tags and archives.
