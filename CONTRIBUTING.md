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
│   │   ├── models.js            # live {baseUrl}/models fetch + excludeModels filter (passthrough)
│   │   ├── config.js            # ~/.grok/config.toml read/patch helpers, backend rules
│   │   ├── install.js           # mkdirSafe/writeSecure + installPassthrough()/installCustom()
│   │   └── proxy.js             # generic inline OpenAI-compatible proxy for CLI-backed connectors
│   ├── agy/                     # Custom provider: provider.json + own bin/ + lib/
│   ├── codex/                   # Custom provider: provider.json + own bin/ + lib/
│   └── <passthrough>/           # deepseek, groq, kimi, opencode-go, opencode-zen, openrouter, qwen, zai: provider.json only
├── bins/                        # GENERATED + committed (one per provider)
└── scripts/
    ├── aggregate-manifest.js    # fragments → providers/providers.json, validates each fragment (npm run build:manifest)
    ├── generate-bins.js         # manifest → bins/ + package.json bin map (npm run build:bins)
    ├── install-provider.js      # single install dispatch (TUI + headless)
    └── uninstall-provider.js    # single uninstall dispatch
```

---

## Provider Types

| Type | When to use | Code needed |
| :--- | :--- | :--- |
| `passthrough` | Upstream speaks a protocol Grok Build has a backend for: OpenAI chat completions (DeepSeek, Qwen, Groq…), OpenAI Responses, or Anthropic messages. Gateways that mix protocols per model (OpenCode) fit too, via `backendRules`. | **None**. The manifest entry is sufficient. The generated wrapper runs `grok -m <name>`, and the TUI fetches the model list live from `{baseUrl}/models`. |
| `custom` | A CLI must be wrapped because there is no HTTP API to point Grok at (AGY, Codex) | A `providers/<name>/` directory with its own `bin/` and `lib/install.js`. Its bin calls `startProxy()` from `_shared/proxy.js`, which turns each chat completion into one CLI invocation and streams the result back. |
| `proxy` | Reserved for a connector that needs request translation Grok Build cannot do natively | Not implemented; the aggregator accepts the type, the generators skip it. Prefer `passthrough` with `apiBackend`/`backendRules`, since Grok Build now speaks all three protocols itself. |

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
     "envKey": "GROQ_API_KEY"
   }
   ```
2. Build: `npm run build` (aggregates the manifest, then regenerates bins).
3. Commit your `providers/groq/provider.json` plus the regenerated
   `providers/providers.json`, the new `bins/grok-groq.js`, and `package.json`.

The TUI, headless installer, and `bin` map all pick it up automatically, with no
code changes required. Passthrough connectors do **not** list models in the manifest:
the TUI pulls the current catalogue live from `{baseUrl}/models` on each run, so
only `defaultModel` (the value written to `config.toml`) is needed.

### Passthrough to an Anthropic-style or mixed-protocol endpoint

Grok Build speaks three wire protocols (`api_backend = "chat_completions" | "responses" | "messages"`)
and two key headers (`auth_scheme = "bearer" | "x-api-key"`). A connector picks them in its fragment:

```json
{
  "type": "passthrough",
  "name": "OpenCode Zen",
  "defaultModel": "glm-5.3",
  "baseUrl": "https://opencode.ai/zen/v1",
  "envKey": "OPENCODE_API_KEY",
  "excludeModels": "^(gemini-|jev-)",
  "backendRules": [
    { "match": "^(gpt-|grok-)", "backend": "responses" },
    { "match": "^claude-", "backend": "messages" }
  ]
}
```

- `apiBackend` sets the protocol for every model (default `chat_completions`).
- `backendRules` maps model ids (regex, first match wins) to a protocol. The installer writes the
  backend for `defaultModel`, and the TUI rewrites `api_backend` whenever the model changes.
- `authScheme = "x-api-key"` is for providers that want the key in an `x-api-key` header (Anthropic).
- `extraHeaders` are written verbatim as `extra_headers`; the value `$UUID` becomes a random id minted
  once per install and preserved on reinstall (OpenCode Go's `x-opencode-session`).
- `excludeModels` hides live-catalogue entries Grok Build cannot drive (Google-only endpoints, non-chat models).
- `contextWindow` writes `context_window`, which Grok Build uses to time auto-compaction.

### Custom (special logic)

1. Create `providers/<name>/` with `lib/install.js` and `bin/grok-<name>.js`
   (use `providers/agy/` as a template; it can `require('../../_shared/...')`).
2. Add `providers/<name>/provider.json` with `"type": "custom"` and `"dir": "<name>"`,
   plus the display fields (`name`, `label`, `description`, `defaultModel`, `models`, `port`, `envKey`, `binaryName`).
   Pass a `discoverModels` function to `startProxy()` if the CLI can report its own roster
   (see `providers/agy/bin/grok-agy.js`, which parses `agy models`); the manifest `models` list is the offline fallback.
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
| `models` | custom | Fallback list the inline proxy advertises to Grok when live discovery is unavailable. Passthrough lists are fetched live from `{baseUrl}/models`, so this field is not used for them. |
| `baseUrl` | passthrough | Upstream base URL (https) |
| `envKey` | all | Environment variable holding the API key (passthrough) or the minted local proxy key (custom) |
| `apiBackend` | passthrough | `chat_completions` (default), `responses`, or `messages` |
| `backendRules` | passthrough | `[{ "match": <regex>, "backend": <protocol> }]`, first match wins, else `apiBackend` |
| `authScheme` | passthrough | `bearer` (default) or `x-api-key` |
| `extraHeaders` | passthrough | Headers written verbatim to `extra_headers`; `$UUID` is replaced by a per-install id |
| `excludeModels` | passthrough | Regex; matching ids are hidden from the live model picker |
| `contextWindow` | all | Written as `context_window` |
| `dir` | custom | Directory name under `providers/` |
| `port` | custom | Loopback port for the inline proxy |
| `binaryName` | custom | Backend CLI the proxy invokes |

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
- `npm run build:manifest` validates every fragment (type, required fields per type,
  regexes compile, backends and auth schemes are known values) and fails the build otherwise.
- Open a PR with the new/changed fragment and the regenerated artifacts.
