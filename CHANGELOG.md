# Changelog

All notable changes to OpenToken will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-05-20

### Added
- TUI status bar with token savings, compression level, session duration, and clock (`session_prompt_right` slot)
- `opentoken_stats` MCP tool — shows total savings, per-tool breakdown, top savings
- `opentoken_health` MCP tool — error counts, stage failures, config status
- Metrics aggregation (`utils/stats.ts`) — computes summaries from `metrics.jsonl`
- Error logging (`utils/errors.ts`) — tracks stage failures to `error.jsonl` with stack traces
- Stack trace compression — detects stack frames, collapses middle frames, keeps top + bottom
- URL shortening — strips query params + hash from URLs >100 chars
- Base64 inline content stripping — replaces `data:...;base64,...` with placeholder
- Lock file blocking — `package-lock.json`, `yarn.lock`, `Cargo.lock`, `pnpm-lock.yaml`, `Gemfile.lock`, `go.sum`, `composer.lock`, `bun.lock`, `bun.lockb`, `poetry.lock`, `Pipfile.lock`
- 7 new command rewrite rules: `kubectl -o wide`, `terraform -no-color`, `go -v=false`, `make -s`, `brew -q`, `apt -qq`, `mvn/gradle -q`
- `rg --json` and `rg --vimgrep` format support in grep filter
- Route bash `grep`/`rg`/`ag`/`ack` commands to specialized grep filter
- Expanded log folding — detects Python logging, Kubernetes/glibc, and syslog formats
- Auto-escalation de-escalation — reduces compression level when context pressure eases
- LEAN filler list expanded from 17 to 32 phrases
- ULTRA compression now protects code lines from phrase replacement
- Metrics log rotation — 10MB max, keeps 5 rotated files
- MIT LICENSE file

### Changed
- Context tracking now uses `afterTokens` instead of `beforeTokens` (prevents context inflation)
- Read cache LRU cap at 500 entries with eviction
- Offload store capped at 200 entries, rewind store capped at 50 entries
- Rewind compression uses head+tail extraction (first 10 + last 5 lines) instead of line truncation
- Session memory uses `??` instead of `||` (fixes 0 being treated as falsy)
- Router removed 7 phantom stages with no handlers
- Secret redaction compiled from 33 sequential `.replace()` calls into single alternation regex (33x fewer allocations)
- Binary detection expanded from 8KB to 64KB NUL byte scan
- Binary UTF-8 handling preserves 0xA0-0xFF range (fixes corruption)

### Threshold Changes
| Constant | Old | New |
|----------|-----|-----|
| `MAX_OUTPUT_BYTES` (postcall) | 500KB | 100KB |
| `MAX_INLINE_LINES` (progressive) | 200 | 80 |
| `MAX_INLINE_BYTES` (progressive) | 20KB | 8KB |
| `WRITE_MAX_BYTES` (precall) | 100KB | 50KB |
| `EDIT_MAX_BYTES` (precall) | 50KB | 20KB |
| `MAX_COMPRESSED_SIZE` (rewind) | 50KB | 15KB |
| `MAX_LINES_PASS` (read filter) | 200 | 80 |
| `SHORT_OUTPUT_THRESHOLD` (index) | 200 lines | 80 lines |
| `MAX_OUTPUT_LENGTH` (index) | 51200 bytes | 20000 bytes |
| `MAX_LINES` (generic) | 200 | 80 |
| `MAX_BYTES` (generic) | 50KB | 20KB |

### Fixed
- `readRecentMetrics` — `totalCalls` now uses last 50 entries (was counting all entries)
- `aliasJsonKeys` regex — now matches keys after `,` as well as `{`
- Read cache — float mtime comparison uses tolerance (`Math.abs < 1`)
- Install script — fixed sed double-prefix bug on re-install
- Stack trace compression moved before size check (works on all outputs)
- URL shortening regex — fixed to use callback-based length check

### Tests
- 105 tests pass (up from 72), 161 expect() calls (up from 108)
- Added tests for: de-escalation, URL shortening, base64 stripping, stack trace compression, lock file blocking, rg JSON/vimgrep, secrets regex, new rewrite rules, stats aggregation, error logging

## [0.1.0] — Initial Release

- 14-stage compression pipeline
- Command rewriting, minified file blocking, size caps
- Family filters (git, npm, cargo, test, fs)
- Tool compression (read, grep, glob)
- Binary detection, thinking block stripping
- Key aliasing, whitespace cleanup
- Cross-call deduplication, progressive disclosure
- Auto-escalation, AST skeleton extraction
- Diff/log folding, JSON sampling
- Reversible compression, content router
- Symbol index, session memory
- LSP-first enforcement
