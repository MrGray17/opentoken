<div align="center">

# ⚡ OpenToken

**Universal Token-Compression Engine**  
Pipe any tool output through 35 stages of lossless compression.  
Same semantics. 50–80% fewer tokens. Zero risk.

[![npm](https://img.shields.io/npm/v/@mrgray17/opentoken?color=blue&label=opencode%20plugin)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![npm](https://img.shields.io/npm/v/opentoken?color=orange&label=cli)](https://www.npmjs.com/package/opentoken)
[![npm](https://img.shields.io/npm/v/@opentoken/core?color=purple&label=core)](https://www.npmjs.com/package/@opentoken/core)
[![CI](https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?label=CI)](https://github.com/MrGray17/opentoken/actions)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744)](https://bun.sh)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**5M+ tokens saved** · 74% compression · 0 regressions

</div>

---

## 🚀 One Engine, Three Interfaces

```
                          ┌──────────────────┐
                          │   @opentoken/core │  ← Pure-logic compression
                          │   51 modules      │     (any JS runtime)
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
     │  opentoken   │   │ opentoken-mcp│   │ @mrgray17/       │
     │  CLI binary  │   │  MCP server  │   │ opentoken        │
     │  pipe/wrap   │   │  AI IDEs     │   │ OpenCode plugin  │
     │  any shell   │   │  Claude Code │   │ auto-loads       │
     └──────────────┘   └──────────────┘   └──────────────────┘
```

| Interface | Install | Use case |
|-----------|---------|----------|
| **CLI** | `npm install -g opentoken` | Pipe any command output |
| **MCP** | `bunx opentoken-mcp` | Claude Code, Cursor, any MCP host |
| **OpenCode** | `opencode plugin @mrgray17/opentoken` | OpenCode-native (auto-loads) |

---

## 🔥 Quick Start

### Pipe any command

```bash
git diff HEAD~1 | opentoken -t bash -c "git diff HEAD~1"
```

### Wrap a command

```bash
opentoken wrap cargo build --release
```

### With your AI coding agent

```json
// ~/.config/opencode/mcp.json  (Claude Code, Cursor, etc.)
{
  "mcpServers": {
    "opentoken": { "command": "opentoken-mcp" }
  }
}
```

### Or as a library

```typescript
import { transformToolOutput } from "@opentoken/core";

const { output, saved } = await transformToolOutput(
  "bash",
  "git diff HEAD~1",
  rawOutput,
  { enableMetrics: true },
);
console.log(`Saved ${saved} tokens`);
```

---

## 🎯 Before & After

A real query. Raw output was **2,114 tokens**. With OpenToken: **407 tokens**.

```
❯ opencode "what changed in this diff?"

  LTSC:    src/autoescalate.ts +2 imports (previously 18 context lines)
  Skeleton: src/autoescalate.ts +~8 lines (bun-types import, zod import)
```

The model sees the same semantic content. It talks normally, responds the same way.

---

## ⚙️ How It Works

35 stages of lossless compression. Every stage ends with a conservative safety check — if output grew, the original is returned untouched.

```
tool output
  ├─ 1–3   Secrets redaction (35+ patterns: AWS, GitHub, OpenAI, JWT, …)
  ├─ 4     Binary detection → skip
  ├─ 5     ANSI escape strip
  ├─ 6     Thinking block strip
  ├─ 7–9   Route: family detector (git, npm, cargo, docker, pip, make, fs)
  ├─ 10–12 Family compressor (e.g. git: diff→summary, npm: tree→flat)
  ├─ 13    Generic fallback (URL shorten, path compress, number normalize)
  ├─ 14–16 TOON — JSON→tabular (wider keys, array smoosh, one-of-n)
  ├─ 17–18 JSON minify + statistical sampling
  ├─ 19–22 Log/diff folding (RLE, context-aware wraps, timestamp normalize)
  ├─ 23    Table minification
  ├─ 24–26 Keyword extraction → skeleton structure
  ├─ 27–30 LTSC — LZ77-style lossless sequence compression
  ├─ 31    LZW token substitution (with O(n) pre-check, 1500× faster on bad input)
  ├─ 32–33 Cross-call dedup + progressive disclosure
  ├─ 34    Symbol index cache
  └─ 35    Conservative safety filter
                ▼ compressed output
```

### ⚡ LZW Performance

The LZW compressor features an O(n) repetitiveness pre-check that skips the
expensive scan on non-compressible input — delivering **1500× speedup** on
random data:

| Input | Before | After |
|---|---|---|
| 20 KB random | 758 ms | **0.5 ms** |
| 48 KB random | ~1.8 s | **0.3 ms** |
| compressible | unchanged | unchanged |

---

## 📊 Real Numbers

| Metric | Value |
|--------|-------|
| Tokens saved | **5,078,587** |
| $ saved (at Claude Pro rates) | **$152.36** |
| Overall compression | **74%** |
| Median (compressible calls only) | **93%** |
| Best single-tool average (read) | **96%** |
| Peak single call | 48,291 tokens (100% savings) |

---

## 📦 Architecture

```
opentoken/
├── packages/
│   ├── core/           @opentoken/core — 51 modules, pure logic
│   │   ├── families/   10 command-family filters (git, npm, cargo, …)
│   │   ├── filters/    3 tool filters (read, grep, glob)
│   │   ├── pipelines/  4 tool pipelines (bash, read, grep, glob)
│   │   └── utils/      9 utilities (cache, secrets, metrics, …)
│   ├── cli/            opentoken — CLI binary (pipe/wrap/stats)
│   ├── mcp/            @opentoken/mcp — MCP server
│   └── opencode/       @mrgray17/opentoken — OpenCode plugin
├── tests/
│   ├── core/           425 tests (21 files)
│   └── opencode/       6 tests (smoke)
└── 431 total · 0 fail · 649 expect() calls
```

**Zero platform lock-in.** The core has no OpenCode imports. The same pipeline
powers CLI pipes, MCP servers, and the original OpenCode plugin.

---

## 🛡️ Security

- **Secrets redaction runs first** — 35+ patterns, before any other processing
- **No telemetry** — never phones home, all data stays local
- **No exec/eval** — pure function chains only
- **Atomic writes** — temp + rename, no partial file writes
- **Graceful failure** — everything wrapped in try/catch, plugin never breaks the host

---

## 🧪 Development

```bash
git clone https://github.com/MrGray17/opentoken.git
cd opentoken
bun install
bun run build    # typecheck + lint + checks:regex + test (431 tests)
```

CI order: `typecheck` → `lint` → `checks:regex` → `test`.

---

## 📋 Comparison

| | OpenToken | DCP | Caveman | RTK |
|---|---|---|---|---|
| Zero-risk safety filter | ✅ | ❌ | N/A | ❌ |
| Secrets redaction | 35+ patterns | ❌ | ❌ | ❌ |
| Output compression | 7 layers | ❌ | ❌ | ❌ |
| Model speaks naturally | ✅ | ✅ | ❌ | ✅ |
| Family-specific filters | 10 families | ❌ | ❌ | ❌ |
| Log/diff folding | ✅ | ❌ | ❌ | ❌ |
| AST skeleton | ✅ | ❌ | ❌ | ❌ |
| LZ77 lossless (LTSC) | ✅ | ❌ | ❌ | ❌ |
| LZW token substitution | ✅ | ❌ | ❌ | ❌ |
| Cross-call dedup | ✅ | ❌ | ❌ | ❌ |
| CLI pipe mode | ✅ | ❌ | ❌ | ❌ |
| MCP protocol | ✅ | ❌ | ❌ | ❌ |
| OpenCode plugin | ✅ | ❌ | ❌ | ❌ |
| Install | `npm install -g` | npm | prompt | patch |

The model speaks normally — no caveman, no degraded reasoning.

---

<div align="center">

MIT · [GitHub](https://github.com/MrGray17/opentoken) · [npm](https://www.npmjs.com/package/@mrgray17/opentoken) · Built for [OpenCode](https://github.com/anomalyco/opencode)

**5,078,587 tokens and counting**

</div>
