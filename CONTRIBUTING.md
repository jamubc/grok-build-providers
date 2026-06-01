# Contributing to open-grok-build

We want to keep this monorepo simple, zero-dependency, and extremely easy to extend. Follow this guide to add support for new language models (e.g. Qwen, Kimi, etc.).

---

## Repository Structure

Each connector lives in its own repository and is linked to `open-grok-build` as a Git submodule:

```text
open-grok-build/
├── tui.js               # Interactive configuration console
├── README.md
├── CONTRIBUTING.md
├── agy/                 # Submodule (Antigravity)
├── codex/               # Submodule (Codex)
└── deepseek/            # Submodule (DeepSeek)
```

---

## Connector Architecture

There are two patterns for adding a new model connector:

### 1. Direct Passthrough (For OpenAI-Compatible APIs)
If the upstream model provider natively exposes an OpenAI-compatible endpoint (like Qwen or DeepSeek), no proxy server is needed.
* **Installer (`lib/install.js`)**: Writes the model block to `~/.grok/config.toml` pointing `base_url` directly to the provider's official URL.
* **Wrapper (`bin/grok-<name>.js`)**: Merely sources the environment key and passes execution directly to the `grok` binary.

### 2. Node-Native Inline Proxy (For Custom/OAuth APIs)
If the model requires custom token translation, custom headers, or CLI wrapper execution (like Gemini/AGY or Codex), write an inline proxy.
* **Installer (`lib/install.js`)**: Configures `base_url` to target a dedicated local port (e.g. `8320` for Kimi).
* **Wrapper (`bin/grok-<name>.js`)**: 
  1. Starts a lightweight Node.js native `http` server on the assigned port.
  2. Handles incoming `/v1/chat/completions` and `/v1/models` requests, translating them as needed.
  3. Spawns the `grok` binary.
  4. On `grok` exit, closes the server and exits.

---

## How to Add a New Connector

1. **Create the Repository**: Initialize a new repository on GitHub (e.g. `kimi-for-grok-build`).
2. **Follow the Standard Files**:
   * `package.json`: Version set to `1.0.0`, version script `install-proxy` pointing to `node lib/install.js`.
   * `install.sh`: Thin executable wrapper running `exec node "$(dirname "$0")/lib/install.js" "$@"`.
   * `lib/install.js`: Setup script to patch `~/.grok/config.toml` and write the binary wrapper.
   * `bin/grok-<name>.js`: The binary wrapper (direct or inline proxy).
   * `README.md` and `docs/troubleshooting.md`.
3. **Submit to Monorepo**:
   * Clone the `open-grok-build` parent repository.
   * Add your new connector as a submodule:
     ```bash
     git submodule add https://github.com/jamubc/your-connector-for-grok-build your-connector
     ```
   * Add the package and status badges to the parent `README.md` table.
   * Open a PR!
