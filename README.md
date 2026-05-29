<div align="center">

<img src="https://raw.githubusercontent.com/MrGray17/opentoken/main/.github/opentoken-banner.svg" alt="OpenToken" width="600" />

# ⚡ OpenToken

*The universal token-compression engine for AI coding agents.*

**5M+ tokens saved** · **74% avg compression** · **431 tests** · **0 regressions**

[![opencode](https://img.shields.io/npm/v/@mrgray17/opentoken?color=0366d6&label=opencode)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![cli](https://img.shields.io/npm/v/@mrgray17/opentoken-cli?color=f97316&label=cli)](https://www.npmjs.com/package/@mrgray17/opentoken-cli)
[![mcp](https://img.shields.io/npm/v/@mrgray17/opentoken-mcp?color=8b5cf6&label=mcp)](https://www.npmjs.com/package/@mrgray17/opentoken-mcp)
[![core](https://img.shields.io/npm/v/@mrgray17/opentoken-core?color=22c55e&label=core)](https://www.npmjs.com/package/@mrgray17/opentoken-core)
[![CI](https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?label=CI)](https://github.com/MrGray17/opentoken/actions)
[![Bun](https://img.shields.io/badge/bun-%E2%89%A51.2.0-fbb744)](https://bun.sh)
[![license](https://img.shields.io/badge/license-MIT-334155)](https://github.com/MrGray17/opentoken/blob/main/LICENSE)

</div>

---

## The Problem

AI coding agents pass raw command output directly to LLMs -- full git diffs, complete test logs, entire directory listings. Most of it is noise.

| Raw output | What the model actually needs |
|---|---|
| 47K git diff with unchanged context lines | Changed files + hunks only |
| npm install tree of 2000 deps | Added/removed/changed packages |
| 15K test run with dots and timing | Failures + test count |
| docker build with progress bars | Image ID + errors |

**OpenToken strips the noise. Keeps the signal.** The model reasons the same way, answers the same way, costs 50-80% less.

---

## Quick Start

### Install

```bash
# OpenCode plugin -- auto-loads, zero config
npm install -g @mrgray17/opentoken

# MCP server -- for Claude Desktop, Cursor, VS Code, Windsurf
npm install -g @mrgray17/opentoken-mcp

# CLI -- compress any output, pipe or wrap
bun x @mrgray17/opentoken-cli wrap "git diff HEAD~1"

# Library -- build your own pipeline
npm install @mrgray17/opentoken-core
```

Requires Bun v1.2+. [Install Bun](https://bun.sh).

### Try it

```bash
# Pipe any command output through the compression engine
git diff HEAD~1 | opentoken -t bash

# Wrap it -- same result, cleaner syntax
opentoken wrap cargo build --release

# Check your savings
opentoken stats
```

---

## IDE Integration (MCP)

One install, then add to your IDE config:

```bash
npm install -g @mrgray17/opentoken-mcp
```

<details open>
<summary><b>Cursor / Windsurf</b></summary>

```json
// ~/.cursor/mcp.json  or  ~/.windsurf/mcp.json
{
  "mcpServers": {
    "opentoken": { "command": "opentoken-mcp" }
  }
}
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "opentoken": { "command": "opentoken-mcp" }
  }
}
```
</details>

<details>
<summary><b>VS Code (Copilot Chat)</b></summary>

```json
// .vscode/mcp.json  or  ~/.vscode/mcp.json
{
  "servers": {
    "opentoken": { "type": "stdio", "command": "opentoken-mcp" }
  }
}
```
</details>

---

## Before & After

```
$ opentoken wrap "git diff HEAD~1"

diff --git a/src/autoescalate.ts b/src/autoescalate.ts
- 2,114 tokens

+ import { createRequire } from "module";
+ import { SessionStore } from "./utils/session-store";

  2,114 tokens -> 407 tokens ---- 81% reduction
```

The model sees: *"2 imports added to autoescalate.ts -- createRequire and SessionStore."*

It responds exactly as if it read the full diff. Same reasoning. Same answers. **81% fewer tokens.**

---

## Architecture

All tool output passes through 35 compression stages. Each stage ends with a **conservative safety filter** -- if the output grew, the original is returned untouched.

```
Raw Output -> Secrets Redaction -> Binary Detection -> ANSI Strip
  -> Thinking Block Strip -> Family Detector
    -> [git|npm|cargo|docker|pip|make|fs|test|generic]
  -> JSON Minify -> Log/Diff Folding -> Table Minification
  -> LTSC (LZ77) -> LZW Token Substitution -> Cross-Call Dedup
  -> Conservative Safety Filter -> Compressed Output
```

**0-risk principle built into every stage.**

---

## Stats

OpenToken tracks compression effectiveness. Run anytime:

```bash
opentoken stats
```

Shows current session + all-time savings, breakdown by tool type, and top compression wins.

---

## Packages

| Package | Description | Install |
|---|---|---|
| [@mrgray17/opentoken](https://www.npmjs.com/package/@mrgray17/opentoken) | OpenCode plugin (auto-load) | `npm i -g @mrgray17/opentoken` |
| [@mrgray17/opentoken-mcp](https://www.npmjs.com/package/@mrgray17/opentoken-mcp) | MCP server for IDEs | `npm i -g @mrgray17/opentoken-mcp` |
| [@mrgray17/opentoken-cli](https://www.npmjs.com/package/@mrgray17/opentoken-cli) | CLI binary | `npm i -g @mrgray17/opentoken-cli` |
| [@mrgray17/opentoken-core](https://www.npmjs.com/package/@mrgray17/opentoken-core) | Core library | `npm i @mrgray17/opentoken-core` |

---

## License

MIT -- see [LICENSE](https://github.com/MrGray17/opentoken/blob/main/LICENSE).

## Contributors

- **MrGray17** -- creator & maintainer
- **Ethan Berlant** (@OhOkThisIsFine) -- JSON-RPC notification fix, IDE instructions
