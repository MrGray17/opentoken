# OpenToken

Token-saving companion for OpenCode. Intercepts, filters, and compresses tool outputs before they reach the model.

**Typical savings: 70-90% on tool output tokens.**

## Real Production Numbers

Data from a single 22-hour session (977 tool calls):

| Metric | Value |
|--------|-------|
| **Total input tokens** | 1,193,253 |
| **Total output tokens** | 330,952 |
| **Total saved** | **862,301 tokens** |
| **Average savings** | **72% per call** |
| **Avg saved per call** | 884 tokens |

### By Tool

| Tool | Calls | Saved | Avg Savings |
|------|-------|-------|-------------|
| **read** | 318 | 624,244 | 99% |
| **bash** | 640 | 218,265 | 41% |
| **grep** | 12 | 10,044 | 84% |
| **glob** | 7 | 9,748 | 75% |

### Real Money Impact

At typical pricing ($5/MTok input, $25/MTok output):

| | Without OpenToken | With OpenToken | Savings |
|---|---|---|---|
| Input cost | $5.97 | $1.65 | $4.32 |
| Output cost | $29.83 | $8.27 | $21.56 |
| **Total cost** | **$35.80** | **$9.92** | **$25.88** |

**~$26 saved per session.** At scale (100 sessions/day): **$2,600/day** or **~$78,000/month**.

### Savings Breakdown

| Technique | Contribution |
|-----------|-------------|
| Skeleton extraction (read) | ~60% of read savings (624K tokens) |
| Family-specific filters (bash) | ~25% of bash savings (218K tokens) |
| Whitespace + key aliasing | ~5-10% across all tools |
| TOON format | ~5% on JSON outputs |
| LTSC | ~3% on repetitive content |
| Cross-tool dedup | ~2% on duplicates |
| Auto-escalation | Variable, increases under pressure |

The remaining 28% is content already small (short outputs) or that can't be compressed further (code, structured data).

## How It Works

```
OpenCode tool call → [compression pipeline] → model sees clean output
```

OpenToken installs as an OpenCode plugin and hooks into the tool execution lifecycle. Every tool output passes through a multi-stage pipeline that strips noise, removes redundancy, and compresses large outputs — all transparently.

## Active Layers

| # | Layer | What It Does |
|---|-------|-------------|
| L1 | Command rewrite | Adds `--silent`, `--quiet`, `--oneline` to noisy commands |
| L2 | Block minified | Skips reads of `.min.js`, `dist/`, `node_modules/`, lock files |
| L3 | Size caps | Blocks writes >50KB, edits >20KB |
| L4 | Secret redaction | Redacts API keys, tokens, passwords (18 patterns, single regex) |
| L5 | LSP-first | Blocks grep/glob for code symbols, suggests LSP tools |
| L6 | Family filters | Specialized filters for git, npm, cargo, test, and fs output |
| L7 | Tool compression | Read outlines, grep dedup, glob noise removal |
| L8 | Binary detect | Suppresses binary output (64KB NUL scan) |
| L9 | Output block | Suppresses output >100KB |
| L10 | Strip thinking | Removes `<antThinking>`, `<reasoning>` blocks |
| L11 | Whitespace cleanup | Strips nulls, empty values, timestamps |
| L12 | Key aliasing | `description`→`desc`, `configuration`→`config` |
| L13 | URL shortening | Strips query params + hash from long URLs |
| L14 | Base64 stripping | Replaces inline base64 content with placeholder |
| L15 | Cross-call dedup | Identical output within 16 calls → single reference |
| L16 | Progressive disclosure | Large output → offload to temp file + summary pointer |
| L17 | Auto-escalation | Compression intensity increases as context fills |
| L18 | AST skeleton | Replaces full file reads with symbol outlines |
| L19 | Diff folding | Collapses unchanged diff context lines |
| L20 | Log folding | Collapses repeated log lines (Python, K8s, syslog formats) |
| L21 | JSON sampling | Large JSON arrays → schema + representative samples |
| L22 | Reversible compression | Aggressive compression with on-disk original store |
| L23 | Content router | Detects content type, fires only relevant stages |
| L24 | Stack trace compression | Collapses middle stack frames, keeps top + bottom |
| L25 | Symbol index | Background codebase indexing at session start |
| L26 | Session memory | Injects previous session summary on restart |
| L27 | TOON format | JSON arrays → tabular format (40-50% savings) |
| L28 | Whitespace normalization | Collapse newlines, strip trailing whitespace, normalize tabs |
| L29 | LTSC | Lossless Token Sequence Compression — LZ77-style, 18-27% savings |
| L30 | Cross-tool dedup | Identical content from different tools → single reference |

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <80 lines or <20KB → pass through unchanged |
| Conservative | If filtered output ≥ original size → return original |
| Secrets | Redacted BEFORE any filtering (18 patterns compiled to single regex) |
| Binary | Detected and suppressed (64KB NUL byte scan) |
| Graceful degradation | If any pipeline stage fails, it's skipped — the plugin never crashes your session |
| Input validation | Tool names whitelisted, file paths validated against project root |
| Size limits | 10MB hard limit on tool output (configurable) |

## TUI Status Bar

OpenToken includes a status bar that shows in the prompt area:

```
🌸 opentoken saved 2.4K tokens   1h 23m  14:32
```

Shows: token savings (per session), session duration, and clock. Updates every second.

## Diagnostic Tools

Two MCP tools are available for debugging:

### `opentoken_stats`

Shows token savings summary:

```
🌸 opentoken stats

  Calls:        142
  Tokens in:    48.2K
  Tokens out:   3.1K
  Tokens saved: 45.1K (94%)

  By tool:
    read           89 calls  saved  42.3K ( 96%)
    bash           45 calls  saved   2.7K ( 72%)
    grep            8 calls  saved    89 ( 45%)
```

### `opentoken_health`

Shows plugin health — error counts, stage failures, config status:

```
🌸 opentoken health check

  Total errors: 0
  No errors recorded ✅

  Config: metrics=true, symbols=true
  Context: lean
```

## Requirements

- **Bun** runtime (>=1.2.0)
- **OpenCode** with plugin support

## Install

### Via curl (recommended)

One-liner — downloads a pinned release into your OpenCode plugin directory:

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh | bash
```

Install a specific version:

```bash
OPENTOKEN_VERSION=1.1.0 curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh | bash
```

Verify checksum:

```bash
bash install.sh --sha256 <expected-sha256>
```

Or manually:

```bash
mkdir -p ~/.config/opencode/plugins/opentoken
curl -fsSL https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz | tar xz --strip-components=1 -C ~/.config/opencode/plugins/opentoken
```

### Via npm (from GitHub)

```bash
npm install github:MrGray17/opentoken
```

Then add to your OpenCode config:

```json
{
  "plugin": ["opentoken"]
}
```

### Per-project (local copy)

```bash
mkdir -p .opencode/plugins
cp -r node_modules/opentoken/src .opencode/plugins/opentoken
```

## Configuration

Create `~/.config/opentoken/config.json` (all fields optional):

```json
{
  "maxOutputBytes": 10485760,
  "maxProcessingMs": 5000,
  "safeReadRoot": "/path/to/project",
  "enableMetrics": true,
  "enableSymbolIndex": true,
  "conservativeUseTokens": false
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `maxOutputBytes` | 10MB | Hard limit — reject outputs larger than this |
| `maxProcessingMs` | 5000 | Timeout per pipeline stage |
| `safeReadRoot` | project dir | Only allow reads under this directory |
| `enableMetrics` | true | Track token savings to disk |
| `enableSymbolIndex` | true | Build and query symbol index at startup |
| `conservativeUseTokens` | false | Use token count (slower) vs byte count (faster) for safety check |

## Data Storage

All state is stored in `~/.config/opentoken/`:

| File | Purpose | Cleanup |
|------|---------|---------|
| `metrics.jsonl` | Per-call token savings | Rotated at 10MB, keeps 5 files |
| `error.jsonl` | Stage failure logs | Rotated at 5MB, keeps 3 files |
| `stats-summary.json` | Aggregated stats summary | Overwritten on each `opentoken_stats` call |
| `session-memory.json` | Previous session summary | Overwritten each session |
| `offload/` | Progressive disclosure temp files | Auto-cleaned after 1 hour |
| `rewind/` | Reversible compression store | Auto-cleaned after 1 hour |
| `index/symbols.json` | Symbol index cache | Overwritten each session |

## Security

OpenToken is designed with defense-in-depth:

- **Path traversal protection** — File paths are validated to resolve within the project directory
- **Input validation** — Tool names are whitelisted and sanitized
- **Output size limits** — Prevents memory exhaustion from oversized tool outputs
- **Graceful degradation** — Every pipeline stage is wrapped in error handling; a single failure never crashes the session
- **Secret redaction** — Runs first in every pipeline, before any other processing (18 patterns compiled into a single alternation regex for performance)
- **SHA256 checksum verification** — install.sh downloads to a temp tarball, computes SHA256, and supports `--sha256 <hash>` for automatic integrity verification
- **File permission hardening** — Session state, metrics, and error files are created with `0o600` (owner-only read/write); config directories use `0o700`
- **Pinned dependencies** — All package versions are pinned to exact versions — no range-based auto-updates that could introduce supply chain changes

## License

MIT
