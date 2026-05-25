<div align="center">

# ⚡ OpenToken

Token-saving companion for OpenCode.  
**5,078,587 tokens saved** in production (74% overall compression).

<pre lang="bash">opencode plugin @mrgray17/opentoken@latest --global</pre>

[![npm](https://img.shields.io/npm/v/@mrgray17/opentoken?color=blue)](https://www.npmjs.com/package/@mrgray17/opentoken)
[![stars](https://img.shields.io/github/stars/MrGray17/opentoken?color=yellow)](https://github.com/MrGray17/opentoken)
[![CI](https://img.shields.io/github/actions/workflow/status/MrGray17/opentoken/ci.yml?label=CI)](https://github.com/MrGray17/opentoken/actions)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.2.0-fbb744)](https://bun.sh)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![awesome-opencode](https://img.shields.io/badge/awesome--opencode-listed-blueviolet)](https://github.com/anomalyco/awesome-opencode)

[Star on GitHub](https://github.com/MrGray17/opentoken) · [Report issues](https://github.com/MrGray17/opentoken/issues)

</div>

## Before & After

A real query. Raw output was 2,114 tokens. With OpenToken: 407 tokens.

```
❯ opencode "what changed in this diff?"

  LTSC:    src/autoescalate.ts +2 imports (previously 18 context lines)
  Skeleton: src/autoescalate.ts +~8 lines (bun-types import, zod import)
```

The model sees the same semantic content. It talks normally, responds the same way.

## Install

| Method | Command | Best for |
|--------|---------|----------|
| **opencode** | `opencode plugin @mrgray17/opentoken@latest --global` | Everyone |
| **npm** | `npm install -g @mrgray17/opentoken` + add to `opencode.json` | npm users |
| **curl** | `curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/install.sh \| bash` | No-npm setup |
| **git** | `git clone ... ~/.config/opencode/plugins/opentoken && cd $_ && bun install` | Contributors |

<details>
<summary>Verify checksum</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/main/SHA256SUMS | sha256sum -c - --ignore-missing
```

</details>

Zero config. Auto-loads on next OpenCode start.

## How It Works

OpenToken intercepts tool output before it reaches the model and runs it through 35 stages of compression. Each stage is reversible or lossless — if output grows, the original is returned.

> The 0-risk principle: every stage compares filtered vs original. OpenToken never makes things worse.

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

Model responses go through 7 similar stages on the way out:

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

## Real Numbers

| Metric | Value |
|--------|-------|
| Tokens saved | 5,078,587 |
| $ saved (at Claude Pro rates) | $152.36 |
| Overall compression | 74% |
| Median (compressible calls only) | 93% |
| Best single-tool average (read) | 96% |
| Peak single call | 48,291 tokens (100% savings) |

Per-call stats available via the `opentoken_stats` MCP tool.

## Comparison

| | OpenToken | DCP | Caveman | RTK |
|---|---|---|---|---|
| Input compression | 35 layers | Yes | No | No |
| Output compression | 7 layers | No | No | No |
| Model speaks normally | Yes | Yes | No | Yes |
| Zero-risk every stage | Yes | No | N/A | No |
| AST skeleton extraction | Yes | No | No | No |
| LZ77 lossless (LTSC) | Yes | No | No | No |
| LZW token substitution | Yes | No | No | No |
| Family-specific filters | 7 families | No | No | No |
| Log/diff folding | Yes | No | No | No |
| Secrets redaction | 30+ patterns | No | No | No |
| Cross-call dedup | Yes | No | No | No |
| Install | `opencode plugin` | npm | prompt | patch |

The model speaks normally — no caveman, no degraded reasoning.

## Security

- **Secrets redaction runs first** — 30+ patterns, before any other processing
- **No telemetry** — never phones home, all data stays local
- **No exec/eval** — pure function chains only
- **Atomic writes** — temp + rename, no partial file writes
- **Graceful failure** — everything wrapped in try/catch, plugin never breaks the host

## Architecture

<details>
<summary><b>src/</b> — 20 modules, Bun runs TypeScript natively (no build step)</summary>

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
  ├── toon.ts           JSON to tabular conversion
  ├── router.ts         Content-aware compression routing
  ├── families/         7 command-family filters
  ├── filters/          3 tool-specific filters
  └── utils/            Cache, errors, metrics, secrets, stats
```

</details>

<details>
<summary><b>Configuration</b> — optional</summary>

Create `~/.config/opencode/token/config.json`:

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

MIT · [GitHub](https://github.com/MrGray17/opentoken) · [npm](https://www.npmjs.com/package/@mrgray17/opentoken) · Built for [OpenCode](https://github.com/anomalyco/opencode)

</div>
