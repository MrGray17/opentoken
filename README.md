# OpenToken

Token-saving companion for OpenCode. **15-layer compression pipeline** that intercepts, filters, and compresses tool outputs before they reach the model.

**Target: 70-95% token reduction on tool outputs.**

## Architecture

```
OpenCode tool call → [15 layers] → model sees clean output
```

### The 15 Layers

| # | Layer | Technique | Savings |
|---|-------|-----------|---------|
| L1 | Command rewrite | `npm install` → `npm install --silent`, `curl` → `curl -s`, 14+ patterns | 10-30% |
| L2 | Block minified | Skip `.min.js`, `dist/`, `node_modules/`, bundled files | 5-15% |
| L3 | Size caps | Block writes >100KB, edits >50KB | prevents waste |
| L4 | Subagent budget | Read byte limits, call count caps per subagent | 20-40% |
| L5 | Family filters | Bash output by family (git/npm/cargo/test/fs) | 60-90% |
| L6 | Tool compression | Read outlines, grep dedup, glob noise removal | 50-80% |
| L7 | Binary detect | NUL byte scan, suppress binary output | 100% on binary |
| L8 | Output block | Suppress >500KB entirely | prevents overflow |
| L9 | Strip thinking | Remove `<antThinking>`, `<reasoning>` blocks | 5-20% |
| L10 | Whitespace cleanup | Strip nulls, empties, timestamps, IDs, hashes | 10-30% |
| L11 | Key aliasing | `description`→`desc`, `configuration`→`config` | 5-15% |
| L12 | Cross-call dedup | Same output within 16 calls → collapse to ref | 100% on dupes |
| L13 | Progressive disclosure | >200 lines → offload to temp file + pointer | 80-95% |
| L14 | Auto-escalation | 50%→lean, 70%→ultra, 85%→ceiling ratchet | adaptive |
| L15 | Session memory | Prev session summary + cache-lock skip | ~300 tok/session |

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <200 lines or <50KB → pass through unchanged |
| Errors/failures | Never modified, always preserved in full |
| Secrets | Redacted BEFORE any filtering (33+ patterns) |
| Fallback | If filtered ≥ original → return original |
| UTF-8 safe | Never truncate mid-character |
| Binary | Detected and suppressed, not passed to model |

## Install

### Global (recommended)

```bash
git clone https://github.com/MrGray17/opentoken.git
cd opentoken
bun install

# Copy to global opencode plugins directory
cp -r src ~/.config/opencode/plugins/opentoken
```

### Per-project

```bash
cp -r src /your/project/.opencode/plugins/opentoken
```

## Configuration

Create `~/.config/opentoken/config.json`:

```json
{
  "abbreviations_enabled": true,
  "cache_enabled": true,
  "cache_ttl_seconds": 30,
  "max_lines_short_output": 200,
  "max_bytes_short_output": 51200,
  "subagent_max_read_kb": 10,
  "subagent_max_calls": 25,
  "write_max_kb": 100,
  "edit_max_kb": 50,
  "output_max_kb": 500,
  "dedup_window": 16,
  "offload_max_lines": 200,
  "noise_dirs": ["node_modules", ".git", "dist", "build", ".cache"]
}
```

## Metrics

Token savings tracked in `~/.config/opentoken/metrics.jsonl`:

```json
{"ts":"2026-05-19T...","tool":"bash","family":"git","before_tokens":12000,"after_tokens":800,"saved_pct":93}
```

## Roadmap

See [TO-DO.md](TO-DO.md) for Phase 2 (medium) and Phase 3 (advanced) techniques.

## License

MIT
