<div align="center">

# ⚡ OpenToken

**Token-saving companion for OpenCode** — **74% overall compression** (93% median on compressible outputs) without changing model behavior.

🧊 **5M+ tokens saved** (74% avg compression, 5-day session)

<pre lang="bash">opencode plugin @mrgray17/opentoken@latest --global</pre>

[![npm](https://img.shields.io/npm/v/@mrgray17/opentoken?color=blue)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![stars](https://img.shields.io/github/stars/MrGray17/opentoken?color=yellow)](https://github.com/MrGray17/opentoken)
[![CI](https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?label=CI)](https://github.com/MrGray17/opentoken/actions)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744)](https://bun.sh)
[![downloads](https://img.shields.io/npm/dt/@mrgray17/opentoken)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![npm size](https://img.shields.io/npm/unpacked-size/@mrgray17/opentoken)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![TypeScript](https://img.shields.io/github/languages/top/MrGray17/opentoken)](https://github.com/MrGray17/opentoken)
[![awesome-opencode](https://img.shields.io/badge/awesome--opencode-listed-blueviolet)](https://github.com/anomalyco/awesome-opencode)

⭐ Star on GitHub — it helps · 🐛 [Report issues](https://github.com/MrGray17/opentoken/issues)

</div>

## See It In Action

A real git diff — **2,114 tokens** raw:

```diff
diff --git a/src/autoescalate.ts b/src/autoescalate.ts
index abc123..def456 100644
--- a/src/autoescalate.ts
+++ b/src/autoescalate.ts
@@ -10,6 +10,12 @@ import {
 import { SessionStore } from "./-
 session-store";
 const MAX_RETRIES = 3;
+
+  +/// <reference types="bun-types" />
+  +import { z } from "zod";
```

Same query with OpenToken — **407 tokens** (↓81%):

```
❯ opencode "what changed in this diff?"

  📦 LTSC: src/autoescalate.ts +2 imports
  📦 Skeleton: src/autoescalate.ts +~8 lines
```

The model speaks normally — no caveman, no degraded reasoning.

## Install

| Method | Command | Best for |
|--------|---------|----------|
| **opencode** | `opencode plugin @mrgray17/opentoken@latest --global` | Everyone |
| **npm** | `npm install -g @mrgray17/opentoken` + add to `opencode.json` | npm users |
| **curl** | `curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/install.sh \| bash` | No-npm setup |
| **git** | `git clone ... ~/.config/opencode/plugins/opentoken && cd $_ && bun install` | Dev/contributors |

<details>
<summary>Verify checksum</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/SHA256SUMS | sha256sum -c - --ignore-missing
```

</details>

Zero config — auto-loads on next OpenCode start.

## How It Compares

| Feature | OpenToken | Prompt patch | Built-in |
|---------|-----------|-------------|----------|
| **Deflation ratio** | 4–8× | 1.5× | 1.2× |
| **Lossless LTSC** | ✅ | ❌ | ❌ |
| **LZW substitution** | ✅ | ❌ | ❌ |
| **Family-specific filters** | ✅ 7 families | ❌ | ❌ |
| **Log/diff folding** | ✅ | ❌ | ❌ |
| **Secrets redaction** | ✅ 30+ patterns | ❌ | ❌ |
| **Cross-call dedup** | ✅ | ❌ | ❌ |
| **Install** | `opencode plugin` | npm | prompt patch |

## The Pipeline

> [!NOTE]
> **0-risk principle**: every stage compares filtered vs original — if output grew, original wins. OpenToken never makes things worse.

<details>
<summary><b>Input (35 layers)</b> — tool output → compressed</summary>

```
tool output
  ├─ 1–3   Secrets redaction (AWS, GitHub, OpenAI, JWT, private keys, …)
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
  ├─ 31    LZW token substitution
  ├─ 32–33 Cross-call dedup + progressive disclosure
  ├─ 34    Symbol index cache
  └─ 35    Conservative safety filter
           ▼ compressed output
```

</details>

<details>
<summary><b>Output (7 layers)</b> — model responses → compact</summary>

```
model response
  ├─ 1  System conciseness directive
  ├─ 2  Max output token budget cap
  ├─ 3  Boilerplate elimination (18 patterns)
  ├─ 4  URL shorten
  ├─ 5  Whitespace normalize
  ├─ 6  ANSI strip
  └─ 7  Conservative safety filter
       ▼ compressed response
```

</details>

## Real Numbers

| Metric | Value |
|--------|-------|
| Tokens saved | **5,078,587** |
| $ saved | **$152.36** |
| Overall compression | 74% |
| Median (compressible calls) | 93% |
| Best tool (read) | 96% |
| Peak single call | 48,291 tokens (100%) |

Detailed stats: `opentoken_stats` MCP tool.

## Security

- **Secrets redaction first** — 30+ patterns, before any processing
- **No telemetry** — never phones home, all data stays local
- **No exec/eval** — pure function chains only
- **Atomic writes** — tmp+rename, no partial files
- **Graceful failure** — everything in try/catch, plugin never breaks the host

## Architecture

<details>
<summary><b>src/</b> — 20 modules, zero build step (Bun runs TS natively)</summary>

```
src/
  ├── index.ts          Pipeline orchestration, hook registration
  ├── precall.ts        Command rewriting, file blocking, size caps
  ├── postcall.ts       Strip, normalize, fold, minify
  ├── outputcomp.ts     7-layer output compression
  ├── ltsc.ts           LZ77-style lossless sequence compression
  ├── lzw.ts            LZW token substitution
  ├── folding.ts        Log/diff folding (RLE, context wraps)
  ├── dedup.ts          Cross-call deduplication
  ├── autoescalate.ts   Progressive compression as context fills
  ├── skeleton.ts       AST skeleton extraction
  ├── toon.ts           JSON → tabular conversion
  ├── router.ts         Content-aware compression routing
  ├── families/         7 command-family filters
  ├── filters/          3 tool-specific filters
  └── utils/            Cache, errors, metrics, secrets, stats
```

</details>

<details>
<summary><b>Configuration</b> — optional, create <code>~/.config/opencode/token/config.json</code></summary>

```json
{
  "enableHistoryCompression": false,
  "enableOutputSaving": true,
  "maxOutputTokens": 4096,
  "debug": false
}
```

Full schema: `.opencode/opentoken-config-schema.json`

</details>

---

<div align="center">

MIT · Built for [OpenCode](https://github.com/anomalyco/opencode) · [GitHub](https://github.com/MrGray17/opentoken) · [npm](https://www.npmjs.com/package/@mrgray17/opentoken)

</div>
