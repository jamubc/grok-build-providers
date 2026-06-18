# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Per-provider manifest fragments: each provider is now defined by its own `providers/<id>/provider.json` (the directory name is the id). `scripts/aggregate-manifest.js` scans the fragments and regenerates `providers/providers.json`. Adding a provider is a new file in a new directory, with no edits to a shared file.
- Build scripts: `npm run build` (aggregate the manifest, then regenerate bins), plus `build:manifest`, `build:bins`, and `check:manifest` (asserts `providers/providers.json` is in sync with the fragments).

### Changed

- `providers/providers.json` is now a generated aggregate of the fragments, not a hand-edited file. Edit the fragment and run `npm run build`.
- Provider order in the manifest, the TUI menus, and the `package.json` bin map is now alphabetical by id.

## [1.1.0] - 2026-06-18

### Added

- `grok-openrouter` connector (passthrough) for OpenRouter's unified model gateway.
- Live model discovery for passthrough connectors: the per-connector model picker fetches the catalogue from each provider's `{baseUrl}/models` endpoint at runtime (`providers/_shared/models.js`), with a windowed list view for large catalogues. OpenRouter alone exposes hundreds of models that change constantly, so no static list is pinned in the repo.
- Type-to-filter search in the model picker: start typing to narrow the list, backspace to edit, esc to clear then exit.

### Changed

- Dropped the static `models` arrays from passthrough connectors (DeepSeek, Qwen, OpenRouter); their lists are now fetched live, falling back to `defaultModel` when offline. Custom connectors (AGY, Codex) keep a manifest list because their inline proxy serves it to Grok.

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

[Unreleased]: https://github.com/jamubc/grok-build-providers/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/jamubc/grok-build-providers/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/jamubc/grok-build-providers/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jamubc/grok-build-providers/releases/tag/v1.0.0
