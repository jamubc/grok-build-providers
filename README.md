# open-grok-build

![Status](https://img.shields.io/badge/status-active-green)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![License](https://img.shields.io/github/license/jamubc/open-grok-build)

A collection of wrappers to give Grok Build access to third-party language models natively and securely, without relying on background daemons or extra dependencies.

## Included Wrappers (Submodules)

This monorepo manages the following model connectors as Git submodules:

* **[agy (Antigravity)](agy)**: Gives Grok Build access to Antigravity CLI OAuth models.
* **[codex](codex)**: Gives Grok Build access to Codex CLI OAuth models.
* **[deepseek](deepseek)**: Gives Grok Build access to DeepSeek models directly via their REST API.

## How to Clone

To clone this repository along with all its submodules:

```bash
git clone --recursive https://github.com/jamubc/open-grok-build.git
cd open-grok-build
```

If you have already cloned the repository without submodules, initialize them using:

```bash
git submodule update --init --recursive
```

## Quick Start / Installation

You can install any of the connectors individually by running the installer in its directory. For example, to install the Codex connector:

```bash
cd codex
./install.sh
```

Or install all of them at once:

```bash
for tool in agy codex deepseek; do
  (cd "$tool" && ./install.sh)
done
```
