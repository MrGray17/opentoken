# OpenToken

**Token-compression engine for AI coding agents.**
Intercepts tool output and strips noise before it reaches the LLM.
Works with OpenCode, Cursor, Windsurf, Claude Desktop, VS Code Copilot, and any MCP-compatible IDE.

```
$ git diff HEAD~1                    2,114 tokens of raw diff noise
$ opentoken wrap "git diff HEAD~1"     407 tokens -- 81% reduction
```

<p align="center">
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken?color=0366d6&label=opencode" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-cli"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-cli?color=f97316&label=cli" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-mcp"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-mcp?color=8b5cf6&label=mcp" /></a>
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken-core"><img src="https://img.shields.io/npm/v/@mrgray17/opentoken-core?color=22c55e&label=core" /></a>
  <a href="https://github.com/MrGray17/opentoken/actions"><img src="https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?branch=main&label=CI" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-%E2%89%A51.2.0-fbb744" /></a>
  <a href="https://github.com/MrGray17/opentoken/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-334155" /></a>
</p>
<p align="center">
  <b>431 tests</b> &middot; <b>35 stages</b> &middot; <b>10 command families</b> &middot; <b>zero regressions</b>
</p>
---
## Why This Exists
AI coding assistants invoke shell commands -- `git diff`, `npm install`, `grep -r`, `ls -la` -- whose raw output is dominated by noise. ANSI escapes, npm audit spam, CI logs with repeating timestamps, compiler warnings echoed 200 times. Every byte burns input tokens for no semantic benefit.

OpenToken is a transparent filter between tool runtime and LLM context window. Every output passes through 35 compression stages, each ending with a **conservative safety filter**: if a stage makes the output larger, the original is returned untouched.
The model sees the same information, reasons the same way, and produces the same answers -- at **50-80% fewer tokens**.

---

## How It Works

```mermaid
flowchart LR
    A["Tool Output"] --> B["Secrets Redaction"]
    B --> C["Binary Detection"]
    C --> D["ANSI Strip"]
    D --> E["Family Detection"]
    E --> F["Pipeline Router"]
    F --> G["git pipeline"]
    F --> H["npm pipeline"]
    F --> I["generic pipeline"]
    F --> J["... 7 more"]
    G --> K["Conservative Filter"]
    H --> K
    I --> K
    J --> K
    K --> L["Compressed Output to LLM"]
```

Pipeline routing selects a specialized chain of 10-20 stages based on command context -- `git status` gets a different pipeline than `cargo build`.

---

## Features

### Noise Reduction
- **Pre-call rewrites** -- suppresses noise *before* execution: adds `--color=never`, `-q`, `-s` flags
- **ANSI stripping** -- removes terminal color codes and control sequences
- **Thinking block removal** -- strips XML reasoning, monologue, and scratchpad blocks
- **JSON cleanup** -- removes null, empty, false, and redundant values
- **Table whitespace minimization** -- strips padding from CLI table output
- **Path shortening** -- replaces project-root prefixes with relative paths
- **Directory grouping** -- collapses repeated directory paths in file listings

### Structural Compression
- **Diff folding** -- condenses context hunks: `... 14 context lines omitted`
- **Log folding** -- collapses consecutive identical lines: `8 x error message`
- **Fold repeats** -- deduplicates non-consecutive identical lines (5+ occurrences)
- **Line noise normalization** -- replaces timestamps, PIDs, elapsed times with static placeholders

### Advanced Compression
- **LTSC** -- Lossless Token Sequence Compression (LZ77-sliding window), 18-27%
- **LZW token substitution** -- high-frequency substrings replaced with single-token markers, 20-40% on repetitive output
- **Progressive disclosure** -- summary first, full output on demand via offloaded temp files
- **Reversible compression** -- semantic abbreviation with rewind for full recovery
- **TOON conversion** -- transforms JSON arrays into tabular format

### Safety
- **0-risk principle** -- every stage ends with a conservative filter; output only shrinks or stays
- **Secrets redaction** -- runs before all other processing
- **Binary detection** -- NUL byte guard prevents corruption of binary streams
- **Size caps** -- skips compression on inputs exceeding 50KB

### Operations
- **Auto-tuning** -- per-family effectiveness metrics control whether heavy stages run
- **Cross-call dedup** -- prevents repeated output across tool calls in the same session
- **10 command families** -- specialized pipelines: git, npm, cargo, docker, pip, make, test, fs, grep, generic
- **Stats dashboard** -- session and all-time tracking, per-tool breakdown


---

## Comparison

| | OpenToken | RTK | QTK | Caveman | built-in |
|---|---|---|---|---|---|
| **Approach** | Full compression engine | CLI proxy | OpenCode plugin | Language mode | Basic truncation |
| **Token savings** | 50-80% | 60-90% | 60-90% | ~75% (messages) | 20-30% |
| **Runtime** | Bun (TS, no build) | Rust binary | Bun/Node | Any LLM | built-in |
| **Stages** | 35 | ~10 | ~10 | 1 | 1 |
| **Secrets redaction** | yes | -- | -- | -- | -- |
| **Progressive** | yes | -- | -- | -- | -- |
| **Reversible** | yes | -- | -- | -- | -- |
| **Auto-tuning** | yes | -- | -- | -- | -- |
| **Stats** | yes | -- | -- | -- | -- |
| **CLI pipe/wrap** | yes | yes | -- | -- | -- |
| **Cross-call dedup** | yes | -- | -- | -- | -- |
| **0-risk safety filter** | every stage | -- | -- | -- | -- |


---

## Quick Start

Requires **Bun v1.2+**. [Install Bun](https://bun.sh).

```bash
npm i -g @mrgray17/opentoken     # OpenCode plugin (auto-loads, zero config)
npm i -g @mrgray17/opentoken-mcp # Any IDE via MCP
bun x @mrgray17/opentoken-cli    # CLI pipe/wrap
npm i @mrgray17/opentoken-core   # Library
```

### Try It

```bash
git diff | opentoken -t bash
opentoken wrap cargo-build
opentoken stats
```

---
## Configuration

Works with zero configuration. Optional overrides at `~/.config/opentoken/config.json`:

```json
{
  "enableMetrics": true,
  "safeReadRoot": "/home/user/projects/myapp",
  "maxOutputBytes": 1048576,
  "enableSymbolIndex": false
}
```

See [AGENTS.md](./AGENTS.md) for all config fields and defaults.

---

## IDE Integration (MCP)

**Cursor / Windsurf** -- add to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "opentoken": { "command": "opentoken-mcp" } } }
```

**Claude Desktop** -- add to `~/.claude/claude_desktop_config.json`:

```json
{ "mcpServers": { "opentoken": { "command": "opentoken-mcp" } } }
```

**VS Code Copilot** -- add to `.vscode/mcp.json`:

```json
{ "servers": { "opentoken": { "type": "stdio", "command": "opentoken-mcp" } } }
```

---

## Project Structure

```
opentoken/
  packages/
    core/src/              # Universal compression engine (51 files)
      transform.ts           # Entry: transformToolOutput()
      precall.ts             # Command rewriting, minified file blocking
      postcall.ts            # Normalize, fold, minify, strip
      wrappers.ts            # safeStage, conservativeFilter, routeContent
      autoescalate.ts        # Progressive compression as context fills
      rewind.ts              # Reversible compression + abbreviation
      ltsc.ts                # LZ77-style lossless sequence compression
      lzw.ts                 # LZW-style token substitution
      folding.ts             # Diff + log folding
      progressive.ts         # Summary-first, full on demand
      skeleton.ts            # AST skeleton extraction
      families/              # 10 command-family output filters
      filters/               # 3 tool-specific output filters
      pipelines/             # 4 tool pipelines + shared utilities
      utils/                 # Cache, errors, logger, metrics, secrets, tokens
    cli/src/                 # CLI binary (~260 lines)
    mcp/src/                 # MCP JSON-RPC server
    opencode/src/            # OpenCode plugin adapter (~140 lines)
  tests/
    core/                    # 21 files, 425 tests
    opencode/                # 1 file, 6 tests
```

---

## Design Decisions

**0-risk principle.** Every compression stage is followed by a conservative filter that compares estimated token counts. If a stage produced MORE tokens than its input consumed, the original output is returned untouched. This guarantees compression can never regress quality.

**Bun, not Node.** OpenToken targets Bun v1.2+ exclusively. Bun runs TypeScript natively -- no `tsc`, no `tsup`, no `esbuild`, no source maps. One command: `bun run src/cli.ts`. This eliminates an entire build toolchain.

**Pipeline architecture.** Each command family (git, npm, cargo, etc.) has a dedicated pipeline of 10-20 stages. A generic pipeline catches everything else. The pipeline router detects the command context from the command string and selects the right chain.

**Token estimation, not character counting.** The conservative filter estimates BPE token counts rather than measuring raw character length. This correctly accounts for LTSC/LZW markers which are 2 characters but 2 BPE tokens, preventing false negatives.

**Auto-tuning.** Per-family compression effectiveness is tracked via metrics files. Heavy stages (LTSC, LZW) query this before running -- if a family consistently yields no savings, those stages skip entirely.

---

## Development

```bash
bun install            # Install dependencies
bun test               # All 431 tests (Bun test runner)
bun run typecheck      # tsc --noEmit
bun run lint           # Biome check
bun run lint:fix       # Auto-fix with Biome
```

CI workflow: `typecheck` -> `lint` -> `checks:regex` -> `test`.

### Architecture

Tests import from workspace packages: `@mrgray17/opentoken-core` for core tests, `@mrgray17/opentoken` for plugin tests. No build step -- Bun resolves workspace packages natively.

See [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed developer documentation.

---

## Contributors

<a href="https://github.com/MrGray17"><img src="https://github.com/MrGray17.png" width="40" height="40" alt="MrGray17" style="border-radius: 50%;" /></a>
<a href="https://github.com/OhOkThisIsFine"><img src="https://github.com/OhOkThisIsFine.png" width="40" height="40" alt="OhOkThisIsFine" style="border-radius: 50%;" /></a>

---

## License

MIT -- see [LICENSE](./LICENSE).
