<div align="center">

<img src="https://raw.githubusercontent.com/MrGray17/opentoken/main/.github/opentoken-banner.svg" alt="OpenToken" width="600" />

# ⚡ OpenToken

*The universal token-compression engine for AI coding agents.*

<p>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken?color=0366d6&label=opencode" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-cli"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-cli?color=f97316&label=cli" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-mcp"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-mcp?color=8b5cf6&label=mcp" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-core"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-core?color=22c55e&label=core" /></a>
  <a href="https://github.com/MrGray17/opentoken/actions"><img src="https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?branch=main&label=CI" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-%E2%89%A51.2.0-fbb744" /></a>
  <a href="https://github.com/MrGray17/opentoken/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-334155" /></a>
</p>

| 5M+ tokens saved | 74% avg compression | 35 stages | 431 tests | 10 command families | 0 regressions |
|---|---|---|---|---|---|

</div>

---

## What is OpenToken?

OpenToken sits between your AI coding agent and its tools. Every time a command runs — `git diff`, `npm install`, `cargo build` — OpenToken intercepts the output and strips the noise before it reaches the LLM.

The model sees clean, essential information. It reasons the same way. It answers the same way. But it costs **50-80% fewer tokens**.

```
$ git diff HEAD~1
  - 2,114 tokens of raw diff noise

$ opentoken wrap "git diff HEAD~1"
  + 2 imports added: createRequire, SessionStore
  - 407 tokens ---- 81% reduction
```

---

## Feature Comparison

| | [OpenToken](https://github.com/MrGray17/opentoken) | [RTK](https://github.com/rtk-ai/rtk) | [QTK](https://github.com/qalarc/QTK) | Caveman | OpenCode built-in | Raw |
|---|---|---|---|---|---|---|
| **Approach** | Full compression engine | CLI proxy | opencode plugin | Language mode | Basic truncation | none |
| **Token savings** | 50-80% | 60-90% | 60-90% | ~75% (messages) | 20-30% | 0% |
| **Runtime** | Bun / Node | Rust binary | Bun / Node | Any LLM | built-in | N/A |
| **Compression stages** | 35 | ~10 | ~10 | 1 (style) | 1 (truncation) | 0 |
| **Safety (0-risk)** | ✅ every stage | ❌ | ❌ | ❌ | ❌ | N/A |
| **Secrets redaction** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP server** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CLI pipe/wrap** | ✅ | ✅ | ❌ | ❌ | ❌ | N/A |
| **Cross-call dedup** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Progressive** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reversible (rewind)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Stats & monitoring** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Auto-tuning** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **10 command families** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Stars** | — | 56K | — | — | — | — |

> **RTK**: CLI proxy in Rust. ~10 compression patterns for git/npm/docker output. No safety filters, no MCP server, no stats.  
> **QTK**: opencode-specific spiritual sibling of RTK. Same TOML DSL syntax.  
> **Caveman**: Ultra-compressed language mode. Saves tokens on *your messages*, not tool output. Complements OpenToken well.

---

## Quick Start

```bash
# OpenCode plugin -- auto-loads, zero config
npm install -g @mrgray17/opentoken

# MCP server -- any IDE (Cursor, Windsurf, Claude, VS Code)
npm install -g @mrgray17/opentoken-mcp

# CLI -- pipe or wrap anything
bun x @mrgray17/opentoken-cli wrap "git diff HEAD~1"

# Library -- build custom pipelines
npm install @mrgray17/opentoken-core
```

Requires **Bun v1.2+**. [Install Bun](https://bun.sh) (one command).

### Try it

```bash
git diff HEAD~1 | opentoken -t bash         # pipe mode
opentoken wrap cargo build --release         # wrap mode
opentoken stats                               # check savings
```

---

## IDE Integration (MCP)

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

## Architecture

All tool output passes through 35 compression stages. Each stage ends with a **conservative safety filter** -- if output grew, the original is returned untouched.

```
Raw Output
  -> Secrets Redaction
  -> Binary Detection
  -> ANSI Strip
  -> Thinking Block Strip
  -> Family Detector (git, npm, cargo, docker, pip, make, fs, test, log, generic)
  -> JSON Minify
  -> Log / Diff Folding
  -> Table Minification
  -> LTSC (LZ77-style sequence compression)
  -> LZW Token Substitution
  -> Cross-Call Dedup
  -> Progressive Compression (summary-first, full on demand)
  -> Reversible Compression (rewind)
  -> Conservative Safety Filter
  -> Compressed Output
```

---

## Stats

```bash
opentoken stats
```

Current session + all-time savings, breakdown by tool, top compression wins.

---

## Packages

| Package | Description | Install |
|---|---|---|
| [@mrgray17/opentoken](https://www.npmjs.com/package/@mrgray17/opentoken) | OpenCode plugin (auto-load) | `npm i -g @mrgray17/opentoken` |
| [@mrgray17/opentoken-mcp](https://www.npmjs.com/package/@mrgray17/opentoken-mcp) | MCP server for any IDE | `npm i -g @mrgray17/opentoken-mcp` |
| [@mrgray17/opentoken-cli](https://www.npmjs.com/package/@mrgray17/opentoken-cli) | CLI binary | `npm i -g @mrgray17/opentoken-cli` |
| [@mrgray17/opentoken-core](https://www.npmjs.com/package/@mrgray17/opentoken-core) | Core library | `npm i @mrgray17/opentoken-core` |

---

## License

MIT -- see [LICENSE](https://github.com/MrGray17/opentoken/blob/main/LICENSE).

## Contributors

<a href="https://github.com/MrGray17">
  <img src="https://github.com/MrGray17.png" width="40" height="40" alt="MrGray17" style="border-radius: 50%;" />
</a>
<a href="https://github.com/OhOkThisIsFine">
  <img src="https://github.com/OhOkThisIsFine.png" width="40" height="40" alt="OhOkThisIsFine" style="border-radius: 50%;" />
</a>

