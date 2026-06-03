# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-03

First public release.

### Added

- Interactive TUI (`open-grok-build`) to install, configure, verify, launch, and uninstall Grok Build model connectors.
- Connectors, all defined in `providers/providers.json`:
  - `grok-agy` — Gemini models via the Antigravity CLI (inline proxy)
  - `grok-codex` — Codex models via the Codex CLI (inline proxy)
  - `grok-deepseek` — DeepSeek API (passthrough)
  - `grok-qwen` — Alibaba DashScope Qwen Coder (passthrough)
- Zero-dependency inline HTTP proxy for the inline connectors, started on demand and shut down when idle.
- Headless install: `open-grok-build <connector>` or `open-grok-build all`.
- Set the active connector, switch a connector's default model, and launch a Grok session — each from the menu (`space` to launch).
- Opt-in proxy tracing via `GROK_PROXY_DEBUG=1`.

[Unreleased]: https://github.com/jamubc/open-grok-build/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jamubc/open-grok-build/releases/tag/v1.0.0
