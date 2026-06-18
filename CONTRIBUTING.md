# Contributing to grok-build-providers

This project is a single, zero-dependency repository driven by a **provider
registry**. Each provider owns one JSON fragment in its own directory; a build
step aggregates them into the combined manifest. Adding support for a new model
is, for most cases, a matter of dropping one new JSON file into a new directory
and running the build, with no edits to a shared file, so no merge conflicts. There
are no submodules and no per-provider npm packages.

---

## Repository Structure

```text
grok-build-providers/
├── tui.js                       # Dynamic TUI: reads providers/providers.json
├── package.json                 # `bin` map is generated
├── providers/
│   ├── providers.json           # GENERATED aggregate of the fragments (do not hand-edit)
│   ├── <id>/provider.json       # SOURCE OF TRUTH: one fragment per provider (id = dir name)
│   ├── _shared/                 # Shared, zero-dependency library (not a provider)
│   │   ├── env.js               # .env loading
│   │   ├── models.js            # live {baseUrl}/models fetch (passthrough)
│   │   ├── config.js            # ~/.grok/config.toml read/patch helpers
│   │   ├── install.js           # mkdirSafe/writeSecure + installPassthrough()
│   │   └── proxy.js             # generic inline proxy (deferred stub)
│   ├── agy/                     # Custom provider: provider.json + own bin/ + lib/
│   ├── codex/                   # Custom provider: provider.json + own bin/ + lib/
│   ├── deepseek/                # Passthrough provider: provider.json only
│   ├── openrouter/              # Passthrough provider: provider.json only
│   └── qwen/                    # Passthrough provider: provider.json only
├── bins/                        # GENERATED + committed (one per provider)
├── scripts/
│   ├── aggregate-manifest.js    # fragments → providers/providers.json  (npm run build:manifest)
│   ├── generate-bins.js         # manifest → bins/ + package.json bin map (npm run build:bins)
│   └── install-provider.js      # single install dispatch (TUI + headless)
└── assets/                      # logos
```

---

## Provider Types

| Type | When to use | Code needed |
| :--- | :--- | :--- |
| `passthrough` | Upstream exposes an OpenAI-compatible endpoint (DeepSeek, Qwen, OpenRouter, Groq…) | **None**. The manifest entry is sufficient. The generated wrapper runs `grok -m <name>`, and the TUI fetches the model list live from `{baseUrl}/models`. |
| `custom` | Unique auth / protocol / CLI wrapping (AGY, Codex) | A `providers/<name>/` directory with its own `bin/` and `lib/install.js`. May import from `_shared/`. |
| `proxy` | Needs a generic inline HTTP proxy (format translation) | Reserved. `_shared/proxy.js` is a deferred stub; not yet implemented. |

---

## Adding a Provider

### Passthrough (OpenAI-compatible): the common case

1. Create `providers/groq/provider.json` (the directory name is the provider id):
   ```json
   {
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
2. Build: `npm run build` (aggregates the manifest, then regenerates bins).
3. Commit your `providers/groq/provider.json` plus the regenerated
   `providers/providers.json`, the new `bins/grok-groq.js`, and `package.json`.

The TUI, headless installer, and `bin` map all pick it up automatically, with no
code changes required. Passthrough connectors do **not** list models in the manifest:
the TUI pulls the current catalogue live from `{baseUrl}/models` on each run, so
only `defaultModel` (the value written to `config.toml`) is needed.

### Custom (special logic)

1. Create `providers/<name>/` with `lib/install.js` and `bin/grok-<name>.js`
   (use `providers/agy/` as a template; it can `require('../../_shared/...')`).
2. Add `providers/<name>/provider.json` with `"type": "custom"` and `"dir": "<name>"`,
   plus the display fields (`name`, `label`, `description`, `defaultModel`, `models`, `logo`).
3. Build: `npm run build` (emits a thin shim in `bins/`).
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
- **`providers/providers.json` is generated.** It is the aggregate of every
  `providers/<id>/provider.json`. Never hand-edit it; edit the fragment and run
  `npm run build:manifest`. (JSON can't carry a "do not edit" comment, and a
  marker key would be read as a bogus provider, so this rule lives here.)
- **`bins/` is generated.** Never hand-edit files under `bins/`; edit the
  fragment (or a custom provider's source) and re-run `npm run build`.
- **Generated files are committed** so `npm publish` needs no prepublish step.
  CI / pre-commit can run `npm run check:manifest` to assert `providers.json` is
  in sync with the fragments.
- Open a PR with the new/changed fragment, the regenerated artifacts, and a logo
  in `assets/`.
