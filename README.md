# OpenToken

Token-saving companion for OpenCode. Intercepts, filters, and compresses tool outputs before they reach the model.

**Typical savings: 50-90% on tool output tokens.**

## How It Works

```
OpenCode tool call → [compression pipeline] → model sees clean output
```

OpenToken installs as an OpenCode plugin and hooks into the tool execution lifecycle. Every tool output passes through a multi-stage pipeline that strips noise, removes redundancy, and compresses large outputs — all transparently.

## Active Layers

| # | Layer | What It Does |
|---|-------|-------------|
| L1 | Command rewrite | Adds `--silent`, `--quiet`, `--oneline` to noisy commands |
| L2 | Block minified | Skips reads of `.min.js`, `dist/`, `node_modules/` |
| L3 | Size caps | Blocks writes >100KB, edits >50KB |
| L5 | LSP-first | Blocks grep/glob for code symbols, suggests LSP tools |
| L6 | Family filters | Specialized filters for git, npm, cargo, test, and fs output |
| L7 | Tool compression | Read outlines, grep dedup, glob noise removal |
| L8 | Binary detect | Suppresses binary output |
| L9 | Output block | Suppresses output >500KB |
| L10 | Strip thinking | Removes `<antThinking>`, `<reasoning>` blocks |
| L11 | Whitespace cleanup | Strips nulls, empty values, timestamps |
| L12 | Key aliasing | `description`→`desc`, `configuration`→`config` |
| L13 | Cross-call dedup | Identical output within 16 calls → single reference |
| L14 | Progressive disclosure | Large output → offload to temp file + summary pointer |
| L15 | Auto-escalation | Compression intensity increases as context fills |
| L16 | AST skeleton | Replaces full file reads with symbol outlines |
| L17 | Diff folding | Collapses unchanged diff context lines |
| L18 | Log folding | Collapses repeated consecutive log lines |
| L19 | JSON sampling | Large JSON arrays → schema + representative samples |
| L20 | Reversible compression | Aggressive compression with on-disk original store |
| L21 | Content router | Detects content type, fires only relevant stages |
| L23 | Symbol index | Background codebase indexing at session start |
| L24 | Session memory | Injects previous session summary on restart |

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <200 lines or <50KB → pass through unchanged |
| Conservative | If filtered output ≥ original size → return original |
| Secrets | Redacted BEFORE any filtering (33+ patterns) |
| Binary | Detected and suppressed |
| Graceful degradation | If any pipeline stage fails, it's skipped — the plugin never crashes your session |
| Input validation | Tool names whitelisted, file paths validated against project root |
| Size limits | 10MB hard limit on tool output (configurable) |

## Requirements

- **Bun** runtime (>=1.2.0)
- **OpenCode** with plugin support

## Install

### Via curl (recommended)

One-liner — downloads directly into your OpenCode plugin directory:

```bash
curl -fsSL https://raw.githubusercontent.com/MrGray17/opentoken/refs/heads/main/install.sh | bash
```

Or manually:

```bash
mkdir -p ~/.config/opencode/plugins/opentoken
curl -fsSL https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz | tar xz --strip-components=1 -C ~/.config/opencode/plugins/opentoken
```

### Via npm

```bash
npm install opentoken
```

Then add to your OpenCode config:

```json
{
  "plugin": ["opentoken"]
}
```

### Via GitHub (latest)

```bash
npm install github:MrGray17/opentoken
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
| `metrics.jsonl` | Per-call token savings | Append-only (grows over time) |
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
- **Secret redaction** — Runs first in every pipeline, before any other processing (33+ patterns including API keys, tokens, passwords, private keys)

## License

MIT
