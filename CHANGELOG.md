# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-13

### Added

- `grok-kimi` connector (passthrough) for Moonshot AI's Kimi K3 and K2.7 models (`MOONSHOT_API_KEY`). Closes #1.
- `grok-zai` connector (passthrough) for Z.ai GLM-5.x models (`ZAI_API_KEY`).
- `grok-groq` connector (passthrough) for open-weight models on Groq (`GROQ_API_KEY`).
- `grok-opencode-go` connector (passthrough) for the OpenCode Go subscription, superseding the inline-proxy approach from #8. Grok Build talks to OpenCode directly, so tool calling and streaming are native instead of translated.
- `grok-opencode-zen` connector (passthrough) for OpenCode's pay-as-you-go console. Shares `OPENCODE_API_KEY` with Go; a key entered for one is picked up by the other.
- Per-model wire protocol: fragments can declare `apiBackend`, `backendRules` (regex to `chat_completions` / `responses` / `messages`), `authScheme` (`bearer` / `x-api-key`), `extraHeaders` (with a `$UUID` placeholder minted once per install), `excludeModels`, and `contextWindow`. The installer writes the matching `api_backend`, `auth_scheme`, `extra_headers`, and `context_window` lines, and the TUI rewrites `api_backend` when a model switch crosses protocols. The model picker marks such models `via responses` / `via messages`.
- Live model discovery for the inline connectors: the AGY proxy asks `agy models` at daemon start and the Codex proxy reads `~/.codex/models_cache.json` (hidden entries dropped, Codex's own priority order kept). The manifest list is now only the offline fallback.
- Fragment validation in `scripts/aggregate-manifest.js`: type, required fields per type, known backends and auth schemes, and regexes that compile. A malformed fragment fails `npm run build` instead of the TUI.
- Shared-key lookup at install: a passthrough key is taken from the connector's env file, then the shell, then any sibling `grok-*.env` that holds the same variable.

### Changed

- Model rosters refreshed to October 2026: AGY defaults to `gemini-3.8-flash-high` (list: Gemini 3.8 Flash high/medium/low, Claude Sonnet 4.6, Claude Opus 4.6 thinking, GPT-OSS 120B); Codex defaults to `gpt-6-luna` (list: GPT-6 Luna, GPT-5.6 Terra, GPT-5.6 Luna, GPT-5.5 legacy); Qwen defaults to `qwen3-coder-plus`.
- The AGY proxy now passes the selected model to `agy --model`. Previously the model chosen in the TUI was recorded in `config.toml` but Antigravity always ran its own default.
- Reinstalling a connector regenerates its whole `[model.<name>]` block (model reset to the fragment default, as before) so schema additions such as `extra_headers` reach existing installs. Everything outside the block is untouched, and per-install header values are preserved.
- `logo` dropped from the fragments; nothing read it since the shields.io badges replaced the image assets in 1.0.0.
- README and CONTRIBUTING rewritten for the ten connectors, the protocol fields, and a troubleshooting section (`grok models`, `GROK_PROXY_DEBUG`, `stream_tool_calls`).

## [1.1.0] - 2026-06-18

### Added

- `grok-openrouter` connector (passthrough) for OpenRouter's unified model gateway.
- Live model discovery for passthrough connectors: the per-connector model picker fetches the catalogue from each provider's `{baseUrl}/models` endpoint at runtime (`providers/_shared/models.js`), with a windowed list view for large catalogues. OpenRouter alone exposes hundreds of models that change constantly, so no static list is pinned in the repo.
- Type-to-filter search in the model picker: start typing to narrow the list, backspace to edit, esc to clear then exit.
- Per-provider manifest fragments: each provider is now defined by its own `providers/<id>/provider.json` (the directory name is the id). `scripts/aggregate-manifest.js` scans the fragments and regenerates `providers/providers.json`. Adding a provider is a new file in a new directory, with no edits to a shared file.
- Build scripts: `npm run build` (aggregate the manifest, then regenerate bins), plus `build:manifest`, `build:bins`, and `check:manifest` (asserts `providers/providers.json` is in sync with the fragments).

### Changed

- Dropped the static `models` arrays from passthrough connectors (DeepSeek, Qwen, OpenRouter); their lists are now fetched live, falling back to `defaultModel` when offline. Custom connectors (AGY, Codex) keep a manifest list because their inline proxy serves it to Grok.
- `providers/providers.json` is now a generated aggregate of the fragments, not a hand-edited file. Edit the fragment and run `npm run build`.
- Provider order in the manifest, the TUI menus, and the `package.json` bin map is now alphabetical by id.

## [1.0.1] - 2026-06-18

### Changed

- Scrubbed references to the retired standalone provider packages from the vendored AGY and Codex connectors.

## [1.0.0] - 2026-06-03

### Added

- Interactive TUI (`grok-build-providers`) to install, configure, verify, launch, and uninstall Grok Build model connectors.
- Four connectors defined in `providers/providers.json`:
  - `grok-agy`: Gemini models via the Antigravity CLI (inline proxy)
  - `grok-codex`: Codex models via the Codex CLI (inline proxy)
  - `grok-deepseek`: DeepSeek API (passthrough)
  - `grok-qwen`: Alibaba DashScope Qwen Coder (passthrough)
- Zero-dependency inline HTTP proxy for custom connectors, started on demand and shut down when idle.
- Headless install via `grok-build-providers <connector>` or `grok-build-providers all`.
- Active connector switcher, per-connector model selector, and in-TUI session launcher (`space` to launch).
- Opt-in proxy tracing via `GROK_PROXY_DEBUG=1`.

[Unreleased]: https://github.com/jamubc/grok-build-providers/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/jamubc/grok-build-providers/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/jamubc/grok-build-providers/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/jamubc/grok-build-providers/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jamubc/grok-build-providers/releases/tag/v1.0.0
