# Contributing to grok-build-providers

This project is a single, zero-dependency repository driven by a **provider
registry**. Adding support for a new model is, for most cases, a matter of
editing one JSON file and running a generator. There are no submodules and no
per-provider npm packages.

---

## Repository Structure

```text
grok-build-providers/
├── tui.js                       # Dynamic TUI — reads providers/providers.json
├── package.json                 # `bin` map is generated
├── providers/
│   ├── providers.json           # Master manifest (source of truth)
│   ├── _shared/                 # Shared, zero-dependency library
│   │   ├── env.js               # .env loading
│   │   ├── models.js            # live {baseUrl}/models fetch (passthrough)
│   │   ├── config.js            # ~/.grok/config.toml read/patch helpers
│   │   ├── install.js           # mkdirSafe/writeSecure + installPassthrough()
│   │   └── proxy.js             # generic inline proxy (deferred stub)
│   ├── agy/                     # Custom provider (own bin/ + lib/)
│   └── codex/                   # Custom provider (own bin/ + lib/)
├── bins/                        # GENERATED + committed (one per manifest entry)
├── scripts/
│   ├── generate-bins.js         # manifest → bins/ + package.json bin map
│   └── install-provider.js      # single install dispatch (TUI + headless)
└── assets/                      # logos
```

---

## Provider Types

| Type | When to use | Code needed |
| :--- | :--- | :--- |
| `passthrough` | Upstream exposes an OpenAI-compatible endpoint (DeepSeek, Qwen, OpenRouter, Groq…) | **None** — the manifest entry is sufficient. The generated wrapper runs `grok -m <name>`, and the TUI fetches the model list live from `{baseUrl}/models`. |
| `custom` | Unique auth / protocol / CLI wrapping (AGY, Codex) | A `providers/<name>/` directory with its own `bin/` and `lib/install.js`. May import from `_shared/`. |
| `proxy` | Needs a generic inline HTTP proxy (format translation) | Reserved — `_shared/proxy.js` is a deferred stub; not yet implemented. |

---

## Adding a Provider

### Passthrough (OpenAI-compatible) — the common case

1. Add an entry to `providers/providers.json`:
   ```json
   "groq": {
     "type": "passthrough",
     "name": "Groq",
     "label": "Groq (LPU)",
     "description": "Groq LPU Inference Engine",
     "defaultModel": "llama3-70b-8192",
     "baseUrl": "https://api.groq.com/openai/v1",
     "envKey": "GROQ_API_KEY",
     "logo": "groq_logo.png"
   }
   ```
2. Regenerate: `node scripts/generate-bins.js`
3. Commit `providers/providers.json`, the new `bins/grok-groq.js`, and `package.json`.

The TUI, headless installer, and `bin` map all pick it up automatically — no code
changes required. Passthrough connectors do **not** list models in the manifest:
the TUI pulls the current catalogue live from `{baseUrl}/models` on each run, so
only `defaultModel` (the value written to `config.toml`) is needed.

### Custom (special logic)

1. Create `providers/<name>/` with `lib/install.js` and `bin/grok-<name>.js`
   (use `providers/agy/` as a template — it can `require('../../_shared/...')`).
2. Add a manifest entry with `"type": "custom"` and `"dir": "<name>"`, plus the
   display fields (`name`, `label`, `description`, `defaultModel`, `models`, `logo`).
3. Regenerate: `node scripts/generate-bins.js` (emits a thin shim in `bins/`).
4. Commit.

---

## Manifest Fields

| Field | Applies to | Purpose |
| :--- | :--- | :--- |
| `type` | all | `passthrough` \| `custom` \| `proxy` |
| `name` | all | Display name; for passthrough also the TOML `name` field |
| `label` | all | Short label shown in TUI menus |
| `description` | all | One-line description |
| `defaultModel` | all | Default model written to `config.toml` |
| `models` | custom | Models the inline proxy advertises to Grok. Passthrough lists are fetched live from `{baseUrl}/models`, so this field is not used for them. |
| `logo` | all | Filename under `assets/` |
| `baseUrl` | passthrough | Upstream OpenAI-compatible base URL |
| `envKey` | passthrough | Environment variable holding the API key |
| `dir` | custom | Directory name under `providers/` |

---

## Conventions

- **Zero runtime dependencies.** Node's standard library only.
- **`bins/` is generated.** Never hand-edit files under `bins/`; edit the
  manifest (or a custom provider's source) and re-run `node scripts/generate-bins.js`.
- **Generated files are committed** so `npm publish` needs no prepublish step.
- Open a PR with the manifest change, regenerated artifacts, and a logo in `assets/`.
