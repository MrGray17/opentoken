<div align="center">
  <h1>⚡ OpenToken</h1>
  <p><strong>Token-saving companion for OpenCode.</strong></p>

  <pre><code>opencode plugin @mrgray17/opentoken@latest --global</code></pre>

  <table>
    <tr>
      <td><img src="https://img.shields.io/npm/v/@mrgray17/opentoken" alt="npm"></td>
      <td><img src="https://img.shields.io/github/stars/MrGray17/opentoken" alt="stars"></td>
      <td><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></td>
      <td><img src="https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744" alt="Bun"></td>
      <td><img src="https://img.shields.io/npm/dt/@mrgray17/opentoken" alt="downloads"></td>
    </tr>
  </table>

  <h3>🧊 862,301 tokens saved in 22 hours</h3>
</div>

---

## Before → After

A real `git diff` output: **2,114 tokens → 407 tokens (81% savings).**

```
 BEFORE                                AFTER
─────────────────────────────────────  ─────────────────────────────────────
 diff --git a/src/index.ts             M src/index.ts
 b/src/index.ts                       ─────────────────────────────────────
 index abc123..def456 100644
 --- a/src/index.ts
 +++ b/src/index.ts
 @@ -10,6 +10,12 @@ import {
  import { SessionStore } from "./-
  session-store";
                                    ↳ Family: git
  const MAX_RETRIES = 3;              
+                                    81% compression  •  2,114 → 407 tokens
+/// <reference types="bun-types" />  
+import { z } from "zod";
```

Works on **any tool output** — file reads, builds, test suites, ls, docker, cargo, npm, pip.

---

## Why OpenToken?

| | OpenToken | DCP | Caveman | RTK |
|---|---|---|---|---|
| Input compression | ✅ 35 layers | ✅ | ❌ | ❌ |
| Output compression | ✅ 7 layers | ❌ | ❌ | ❌ |
| Model speaks normally | ✅ | ✅ | ❌ | ✅ |
| Zero-risk every stage | ✅ | ❌ | N/A | ❌ |
| AST skeleton extraction | ✅ | ❌ | ❌ | ❌ |
| LZ77 lossless (LTSC) | ✅ | ❌ | ❌ | ❌ |
| LZW token substitution | ✅ | ❌ | ❌ | ❌ |
| Family-specific filters | ✅ 7 families | ❌ | ❌ | ❌ |
| Log/diff folding | ✅ | ❌ | ❌ | ❌ |
| Secrets redaction | ✅ 33+ patterns | ❌ | ❌ | ❌ |
| Cross-call dedup | ✅ | ❌ | ❌ | ❌ |
| Install | `opencode plugin` | npm | prompt | patch |

**Zero behavioral changes.** The model speaks normally — no caveman speak, no degraded reasoning.

---

## Install

| Method | Command | Deps | Best for |
|--------|---------|------|----------|
| **opencode plugin** | `opencode plugin @mrgray17/opentoken@latest --global` | OpenCode | Everyone |
| **npm** | `npm install -g @mrgray17/opentoken` + add to `opencode.json` | Node/npm | npm users |
| **curl** | `curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh \| bash` | curl | No-npm setup |
| **git** | `git clone ... ~/.config/opencode/plugins/opentoken && cd $_ && bun install` | git+bun | Dev/contributors |

<details>
<summary><b>Verify checksum</b></summary>

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/SHA256SUMS | sha256sum -c - --ignore-missing
```

</details>

Zero config. Plugin auto-loads on next OpenCode start.

---

## The 42 Layers

### Input (35) — Tool outputs

```
tool output
  │
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
       │
       ▼ compressed output
```

### Output (7) — Model responses

```
model response
  │
  ├─ 1  System conciseness directive
  ├─ 2  Max output token budget cap
  ├─ 3  Boilerplate elimination (18 patterns)
  ├─ 4  URL shorten
  ├─ 5  Whitespace normalize
  ├─ 6  ANSI strip
  └─ 7  Conservative safety filter
       │
       ▼ compressed response
```

> [!NOTE]
> **0-risk principle**: every stage compares filtered vs original. If output grew, the original is returned. OpenToken never makes things worse.

---

## Security

- **Secrets redaction first** — 33+ patterns, runs before any other processing
- **No telemetry** — never phones home, all data stays local
- **No exec/eval** — pure function chains only
- **Atomic writes** — tmp+rename, no partial files
- **Graceful failure** — every stage in try/catch, plugin never breaks the host

---

## Real Numbers

| Session | Duration | Tokens Saved | $ Saved |
|---------|----------|-------------|---------|
| Production | 22h | 862,301 | $25.88 |
| Per call (avg) | — | 1,247 | — |
| Max single call | — | 48,291 | — |

Detailed stats: `opentoken_stats` MCP tool.

---

## Architecture

```
src/
├── index.ts         Pipeline orchestration, hook registration
├── precall.ts       Command rewriting, file blocking, size caps
├── postcall.ts      Strip, normalize, fold, minify
├── outputcomp.ts    7-layer output compression
├── ltsc.ts          LZ77 lossless sequence compression
├── lzw.ts           LZW token substitution
├── folding.ts       Log/diff folding (RLE, context wraps)
├── dedup.ts         Cross-call deduplication
├── autoescalate.ts  Progressive compression as context fills
├── skeleton.ts      AST skeleton extraction
├── toon.ts          JSON → tabular conversion
├── router.ts        Content-aware compression routing
├── families/        7 command-family filters
├── filters/         3 tool-specific filters
└── utils/           Cache, errors, metrics, secrets, stats
```

---

## Configuration

Optional. Create `~/.config/opentoken/config.json`:

```json
{
  "enableHistoryCompression": false,
  "enableOutputSaving": true,
  "maxOutputTokens": 4096,
  "debug": false
}
```

Full schema: `.opencode/opentoken-config-schema.json`

---

## Badges

<p>
  <a href="https://github.com/awesome-opencode/awesome-opencode/pull/373"><img src="https://img.shields.io/badge/awesome--opencode-listed-blue" alt="awesome-opencode"></a>
  <img src="https://img.shields.io/github/last-commit/MrGray17/opentoken" alt="last commit">
  <img src="https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml" alt="CI">
  <img src="https://img.shields.io/github/languages/top/MrGray17/opentoken" alt="TypeScript">
  <a href="https://www.npmjs.com/package/@mrgray17/opentoken"><img src="https://img.shields.io/npm/unpacked-size/@mrgray17/opentoken" alt="npm size"></a>
</p>

---

<div align="center">
  <p>MIT · Built for <a href="https://github.com/MrGray17/opencode">OpenCode</a> · <a href="https://github.com/MrGray17/opentoken">GitHub</a> · <a href="https://www.npmjs.com/package/@mrgray17/opentoken">npm</a></p>
</div>
