# OpenToken — Elite Build Plan

Token-saving companion for OpenCode. Drastically cuts context window usage by intercepting, filtering, and compressing tool outputs before they reach the model.

## Architecture

```
OpenCode tool call → opentoken intercept → filter/compress → model sees clean output
```

Two interception layers:
- **`tool.execute.before`** — modify tool args (cache dedup, smart routing)
- **`tool.execute.after`** — compress tool results (family filters, outlines, noise removal)

## Build Phases

### Phase 1: Core Plugin + Hook Infrastructure
- [ ] Plugin entry point (`src/index.ts`)
  - Export `OpenTokenPlugin` with `tool.execute.before` + `tool.execute.after` hooks
  - Config loading from `~/.config/opentoken/config.json`
  - Metrics store (JSONL append)
- [ ] Token counter (`src/utils/tokens.ts`)
  - Fast char heuristic (`chars × 0.25`) as default
  - Optional exact counting via `@anthropic-ai/tokenizer` (cl100k_base)
- [ ] Secret redaction (`src/utils/secrets.ts`)
  - 33+ patterns: AWS keys, API tokens, GitHub PATs, Stripe keys, etc.
  - Redact BEFORE any filtering

### Phase 2: Bash Output Filters (Family-Based)
- [ ] Family detection (`src/families/detect.ts`)
  - Detect command family from first token basename: git, npm/yarn/bun, cargo, pytest/jest/mocha, gcc/clang/make/cmake, python, ls/find/tree, markdown, config files, generic
- [ ] Git filter (`src/families/git.ts`)
  - `git status` → changed files only (skip untracked noise)
  - `git diff` → file list + hunk headers, strip unchanged lines
  - `git log` → last N entries, collapse merge commits
- [ ] NPM/Yarn/Bun filter (`src/families/npm.ts`)
  - Install output → summary only (added/changed/removed)
  - Test output → failures + stack traces only
  - Lint output → errors + warnings, skip passing files
- [ ] Cargo filter (`src/families/cargo.ts`)
  - Build → errors + warnings only
  - Test → failures only, skip passing tests
  - Clippy → lint warnings only
- [ ] Pytest/Jest filter (`src/families/test.ts`)
  - Pass/fail summary + failure details + stack traces
  - Skip passing test names
- [ ] FS filter (`src/families/fs.ts`)
  - `ls` → directories first, files grouped by extension
  - `find` → deduplicate, remove .git/node_modules noise
  - `tree` → depth limit 3, collapse empty dirs
- [ ] Generic filter (`src/families/generic.ts`)
  - Head + tail preservation (first 20 + last 20 lines)
  - Truncate middle to 50KB / 200 lines max
  - UTF-8 safe truncation

### Phase 3: Native Tool Result Compressors
- [ ] Read filter (`src/filters/read.ts`)
  - Short files (<200 lines) → pass through
  - Source files → outline only (classes, functions, docstrings, imports)
  - Config files → full content (usually small)
  - Markdown → headings + code block summaries
- [ ] Grep filter (`src/filters/grep.ts`)
  - Collapse duplicate matches
  - Trim to match line + 3 context lines
  - Remove binary file matches
  - Group by file (one header per file)
- [ ] Glob filter (`src/filters/glob.ts`)
  - Strip node_modules, dist, .git, .cache, __pycache__, .venv
  - Group by directory
  - Limit to 100 results, summarize rest

### Phase 4: Intelligence Layer
- [ ] Read cache (`src/utils/cache.ts`)
  - Cache file reads with mtime + size hash
  - TTL: 30 seconds
  - Skip disk read if cache hit
- [ ] Abbreviations (`src/utils/abbreviate.ts`)
  - Word replacement in narrative text (not code blocks)
  - function→fn, configuration→config, environment→env, etc.
  - SessionStart instruction injection to make model use same abbreviations
- [ ] Duplicate detection (`src/utils/duplicates.ts`)
  - Detect near-duplicate code blocks in read results
  - Collapse to single instance + "×N occurrences"

### Phase 5: Metrics + Dashboard
- [ ] Metrics store (`src/utils/metrics.ts`)
  - JSONL append: `{ts, tool, family, before_tokens, after_tokens, saved_pct}`
  - Session-level aggregation
  - Per-project tracking (git root)
- [ ] Stats command
  - `opentoken stats` → savings by tool family, sparkline, history
  - JSON export option

### Phase 6: Polish + Safety
- [ ] Conservative fallback — if filtered ≥ original, return original
- [ ] Error preservation — errors, failures, stack traces NEVER modified
- [ ] UTF-8 safe — never truncate mid-codepoint
- [ ] Config options — enable/disable individual filters, adjust thresholds
- [ ] README with install instructions + benchmarks

### Phase 7: History Compression + Session Memory ✅ DONE
- [x] `src/history.ts` — Conversation message compression
  - Sliding window (default 12 messages, configurable)
  - Tool result summarization (read → symbols, bash → test status)
  - Reasoning block compression
  - Consecutive tool result collapsing
  - Compaction detection (skip during native compaction)
  - Kill switch (`enableHistoryCompression: false` default)
- [x] `src/memory.ts` — Cross-session memory store
  - JSONL persistence with keyword-based relevance scoring
  - Project path matching + recency bonus
  - 24-hour staleness check, LRU pruning (max 100 entries)
  - Kill switch (`enableSessionMemory: false` default)
- [x] `experimental.chat.messages.transform` — In-place splice mutation
- [x] `experimental.session.compacting` — Inject summary + write memory
- [x] `experimental.chat.system.transform` — Inject session memory

## Safety Guarantees

| Rule | Behavior |
|------|----------|
| Short outputs | <200 lines or <50KB → pass through unchanged |
| Errors | `error[`, `FAILED`, `E   `, `--- FAIL:`, stack traces → never removed |
| Failures | Structured failure blocks (`=== FAILURES ===`, `failures:`) → kept in full |
| Fallback | If filtered ≥ original → return original |
| Secrets | Redacted BEFORE any filtering (33+ patterns) |
| UTF-8 | Truncate at character boundaries only |
| Head+Tail | Generic truncation keeps first 20 + last 20 lines |

## Target Metrics

| Metric | Target |
|--------|--------|
| Overall reduction | 70-90% |
| Git commands | 90%+ |
| Test output | 80%+ |
| Read results | 60-80% |
| Grep results | 70%+ |
| Glob results | 50%+ |
| History compression | 15-25% (on top of existing) |
| Session memory injection | ~300 tokens/session |

## Tech Stack

- TypeScript (plugin runtime)
- Bun (shell execution via `Bun.$`)
- `@anthropic-ai/tokenizer` (optional exact token counting)
- `tree-sitter` + `web-tree-sitter` (optional: source file outlining)
- Zero external services — everything local

## File Structure

```
opentoken/
├── src/
│   ├── index.ts              ← Plugin entry, hooks
│   ├── config.ts             ← Config loading
│   ├── filters/
│   │   ├── read.ts           ← Read result compression
│   │   ├── grep.ts           ← Grep result trimming
│   │   └── glob.ts           ← Glob noise removal
│   ├── families/
│   │   ├── detect.ts         ← Command family detection
│   │   ├── git.ts            ← Git output filter
│   │   ├── npm.ts            ← NPM/Yarn/Bun filter
│   │   ├── cargo.ts          ← Cargo filter
│   │   ├── test.ts           ← Pytest/Jest/Mocha filter
│   │   ├── fs.ts             ← ls/find/tree filter
│   │   └── generic.ts        ← Fallback filter
│   ├── history.ts            ← Conversation history compression (Phase 7)
│   ├── memory.ts             ← Cross-session memory store (Phase 7)
│   └── utils/
│       ├── tokens.ts         ← Token counting
│       ├── secrets.ts        ← Secret redaction
│       ├── cache.ts          ← Read cache
│       ├── abbreviate.ts     ← Word abbreviations
│       ├── duplicates.ts     ← Duplicate detection
│       └── metrics.ts        ← Metrics tracking
├── tests/
│   ├── git.test.ts
│   ├── npm.test.ts
│   ├── read.test.ts
│   └── metrics.test.ts
├── package.json
├── tsconfig.json
└── README.md
```
