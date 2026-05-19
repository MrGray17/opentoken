# OpenToken

Token-saving companion for OpenCode. Intercepts, filters, and compresses tool outputs before they reach the model — drastically reducing context window usage.

**Target: 70-90% token reduction on tool outputs.**

## How It Works

```
OpenCode tool call → opentoken intercept → filter/compress → model sees clean output
```

OpenToken hooks into OpenCode's `tool.execute.after` event and applies specialized filters:

| Tool | Filter | Savings |
|------|--------|---------|
| `bash` (git) | Changed files only, diff hunks, log summary | 90%+ |
| `bash` (npm) | Install summary, test failures only | 80%+ |
| `bash` (cargo) | Errors/warnings only, test failures | 75%+ |
| `bash` (test) | Failure details + summary, skip passing | 80%+ |
| `bash` (fs) | Noise dir removal, grouped output | 50%+ |
| `read` (source) | Symbol outline (classes/fns only) | 60-80% |
| `read` (short) | Pass through unchanged | 0% |
| `grep` | Dedup, trim to match + context | 70%+ |
| `glob` | Strip node_modules/.git/dist noise | 50%+ |

## Safety Guarantees

- **Short outputs** (<200 lines / <50KB) → pass through unchanged
- **Errors/failures** → never modified, always preserved in full
- **Secrets** → redacted BEFORE any filtering (33+ patterns)
- **Fallback** → if filtered ≥ original, return original
- **UTF-8 safe** → never truncate mid-character

## Install

### Global (recommended)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/opentoken.git
cd opentoken

# Install dependencies
bun install

# Copy to global opencode plugins directory
cp -r src ~/.config/opencode/plugins/opentoken
```

Or add to your `opencode.json`:

```json
{
  "plugin": ["opentoken"]
}
```

### Per-project

```bash
# Copy to project's .opencode directory
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
  "noise_dirs": ["node_modules", ".git", "dist", "build", ".cache"]
}
```

## Metrics

Track your token savings:

```bash
# View stats (when stats command is implemented)
opentoken stats
opentoken stats --period today
opentoken stats --period week
opentoken stats --json
```

## Build Plan

See [BUILD_PLAN.md](BUILD_PLAN.md) for the full architecture and development roadmap.

## License

MIT
