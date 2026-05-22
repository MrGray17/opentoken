# OpenToken — Build Roadmap

## TUI Fixes ✅ DONE
- [x] TUI status bar: add timestamp staleness check — compares `session-memory.json` timestamp against `session-start.json` to prevent displaying stale token counts from previous sessions on session boundary
- [x] TUI status bar: add `enableTui` config toggle — reads `~/.config/opentoken/config.json` for `"enableTui": false` to hide the status bar
- [x] add `enableTui` to `OpenTokenConfig` interface and `DEFAULT_CONFIG` in `src/index.ts` (default: true)
- [x] To disable: add `"enableTui": false` to `~/.config/opentoken/config.json`

## Phase 1: High-Impact Easy Wins ✅ DONE
- [x] #3 Block verbose commands (npm install → npm install --quiet, curl → curl -s)
- [x] #5 Subagent budget enforcement (read byte limits, call counts)
- [x] #6 Block minified/generated files (.min.js, dist/, node_modules/, bundled)
- [x] #7 Size caps on write/edit (100KB write, 50KB edit) → tightened to 50KB/20KB
- [x] #14 Large output offload (>500 lines → temp file + pointer)
- [x] #15 XML/Markdown block stripping (<antThinking>, <thinking>)
- [x] #16 Binary detection (NUL byte scan, suppress) → expanded to 64KB
- [x] #17 Output suppression (>500KB → block entirely) → tightened to 100KB
- [x] #20 Key aliasing (replace long JSON keys with short aliases)
- [x] #21 Whitespace/null cleanup (strip redundant fields, timestamps)
- [x] #25 Cross-call deduplication (same output within N calls → collapse)
- [x] #26 Progressive disclosure (summary first, full on demand via MCP)
- [x] #36 Auto-escalation (ratchet compression as context fills)
- [x] #38 Session memory (inject previous session summary on start)
- [x] #43 Cache-lock (session rules hashed, skip if unchanged)

## Phase 2: Elite Techniques ✅ DONE
- [x] #4 AST Skeleton Reads (tree-sitter/regex, 88% per read) — `skeleton.ts`
- [x] #12 Diff Folding (collapse unchanged context lines) — `folding.ts`
- [x] #13 Log Folding (collapse repeated log lines) — `folding.ts`
- [x] #15 JSON Statistical Sampling (schema discovery + sampling) — `jsonsample.ts`
- [x] #16 Reversible Compression (hash store + retrieve tool) — `rewind.ts`
- [x] #20 Content-Aware Router (detect type, fire relevant stages) — `router.ts`
- [x] #2 Think-in-Code Sandbox (write scripts instead of reading files) — `sandbox.ts`
- [x] #1 Structural Symbol Index (find_symbol, get_function_source) — `symbolindex.ts`
- [x] #5 LSP-First Enforcement (block grep for symbols) — `lspfirst.ts`

## Security Hardening ✅ DONE
- [x] Pin range deps: `@opentui/solid` and `solid-js` changed from `^0.2.14`/`^1.9.13` to exact versions in `.opencode/package.json` and `install.sh`
- [x] File permission hardening: `chmod(0o600)` on session, metrics, and error files; `chmod(0o700)` on config directories
- [x] SHA256 checksum verification: `install.sh` downloads to temp tarball, computes SHA256, logs for manual verification; `--sha256 <hash>` flag for automatic verification
- [x] All 125 tests pass (191 expect calls)

## Phase 9: Status Bar Fix + Always-Max Compression (Planned)
- [ ] **Status bar format** — new format: `🌸 opentoken {emoji} saved {tokens} tokens   {duration}  {time}`
  - [ ] Remove `{calls} calls` from display
  - [ ] Example: `🌸 opentoken ⚡ saved 2.4K tokens   1h 23m  14:32`
- [ ] **Session-specific counts** — TUI reads `session-start.json` + filters `metrics.jsonl` by session timestamp
  - [ ] Already partially working in installed TUI (`.opencode/plugins/opentoken/tui.tsx`)
  - [ ] Source TUI (`src/tui.tsx`) needs same session isolation
- [ ] **Compute compression level from real metrics** — `readSessionMetrics()` returns `{ tokensSaved, avgSavedPct }`
  - [ ] Map `avgSavedPct` to emoji: ≥85% 🔥 ceiling, ≥70% ⚡ ultra, ≥50% 🍃 lean, <50% 💤 off
  - [ ] Currently hardcoded to `"off"` in installed TUI — never updated from actual data
- [ ] **Always-max compression (no content loss)** — set `computeLevel()` to always return `"ultra"`
  - [ ] `ultra` preserves 100% of content — rewrites text, never truncates
  - [ ] `ceiling` truncates (first 10 + last 5 lines) — loses middle content, NOT acceptable
  - [ ] `ultra` includes: lean (filler removal + synonym shortening) + phrase→symbol replacements + list compression
  - [ ] Code lines protected from phrase replacement
  - [ ] `deescalate()` → no-op, never step down from ultra
- [ ] **Files to modify:**
  - [ ] `src/autoescalate.ts` — `computeLevel()` → always `"ultra"`, `deescalate()` → no-op
  - [ ] `.opencode/plugins/opentoken/autoescalate.ts` — same changes (installed plugin)
  - [ ] `.opencode/plugins/opentoken/tui.tsx` — status bar format, session metrics, compression level from data
  - [ ] `src/tui.tsx` — mirror installed TUI changes
  - [ ] `src/statusline.ts` — always use ⚡ emoji
- [ ] **Tradeoff analysis:**
  - `ultra` rewrites natural language aggressively (filler words → removed, "utilize" → "use", "leads to" → "→")
  - Code is fully protected (import/const/function lines untouched)
  - No information lost — output is denser but fully readable
  - Estimated savings: 15-30% on natural language text, 0% on code

## Phase 3: Production Fixes & Polish ✅ DONE
- [x] install.sh — add `bun install` / `npm install` for dependencies
- [x] install.sh — fix sed double-prefix bug on re-install
- [x] install.sh — add TUI deps to inline package.json
- [x] package.json — version 1.1.0, proper exports, `.tsx` in files, TUI deps in dependencies
- [x] .npmignore — exclude `.opencode/`
- [x] LICENSE — add MIT license
- [x] Context tracking fix — `updateContext(afterTokens)` not `beforeTokens` (prevents context inflation)
- [x] Read cache LRU cap — `MAX_CACHE_SIZE = 500` with eviction
- [x] Read cache — fix float mtime comparison (`Math.abs < 1`)
- [x] Offload store — `MAX_OFFLOAD_ENTRIES = 200` cap
- [x] Rewind store — `MAX_REWIND_ENTRIES = 50` cap
- [x] Rewind compression — head+tail extraction (first 10 + last 5), threshold 50KB → 15KB
- [x] Session.ts — replace `||` with `??` (0 was treated as falsy)
- [x] Auto-escalation — add `deescalate()` function with hysteresis thresholds
- [x] Router — remove 7 phantom stages (import-collapse, md-outline, xml-collapse, yaml-collapse, csv-sample, error-preserve, truncation)
- [x] Pre-call — block lock files (package-lock.json, yarn.lock, Cargo.lock, pnpm-lock.yaml, Gemfile.lock, go.sum, composer.lock, bun.lock, bun.lockb, poetry.lock, Pipfile.lock)
- [x] Pre-call — add 7 new rewrite rules (kubectl -o wide, terraform -no-color, go -v=false, make -s, brew -q, apt -qq, mvn/gradle -q)
- [x] Post-call — URL shortening (strip query params + hash for URLs >100 chars)
- [x] Post-call — base64 inline content stripping
- [x] Generic filter — stack trace compression (keep top + ...N frames... + bottom)
- [x] Generic filter — thresholds tightened (80 lines, 20KB)
- [x] Grep filter — rg --json and rg --vimgrep format support
- [x] Grep filter — route bash grep/rg/ag/ack commands to filterGrep
- [x] Secrets — compile 18 patterns into single alternation regex (33x fewer allocations)
- [x] Folding — expanded log format detection (Python logging, Kubernetes/glibc, syslog)
- [x] Metrics — log rotation at 10MB, keep 5 rotated files
- [x] Auto-escalation — LEAN filler list expanded 17 → 32 phrases
- [x] Auto-escalation — ULTRA protects code lines from phrase replacement
- [x] Thresholds tightened across 7 files (11 constants)
- [x] TUI status bar — `src/tui.tsx` with token savings + clock
- [x] TUI status bar — `readRecentMetrics` bug fix (totalCalls now uses last 50, not all)
- [x] Tests — 100/100 pass, 148 expect() calls (added 28 new tests)

## Phase 4: Post-Release Tuning (Needs Real-World Usage)
- [ ] **Threshold tuning** — monitor compression quality in real sessions; adjust 80 lines / 8KB / 20KB thresholds based on user feedback
- [ ] **De-escalation hysteresis tuning** — verify 45%/65%/80% thresholds don't cause oscillation in long sessions
- [ ] **Performance profiling** — measure cumulative latency of 14 stages per tool call in large repos
- [ ] **Stack trace regex** — verify no false positives on legitimate code with "at" keywords
- [ ] **URL shortening** — verify no edge cases with encoded URLs, IP addresses, or file:// URLs
- [ ] **Lock file blocking** — verify users can still access lock files when explicitly needed
- [ ] **Binary detection** — verify 64KB threshold catches all binary types without false positives

## Phase 5: Telemetry & Observability ✅ DONE
- [x] `opentoken stats` MCP tool — shows total savings, by tool, top savings
- [x] `opentoken health` MCP tool — error counts, stage failures, config status
- [x] Metrics aggregation — compute summaries from metrics.jsonl (stats.ts)
- [x] Error logging infrastructure — track stage failures to error.jsonl (errors.ts)
- [x] safeStage/safeStageAsync now log errors to error.jsonl with stack traces
- [x] saveStatsSummary() writes stats-summary.json for TUI to read

## Phase 6: TUI Verification & Improvements ✅ DONE
- [x] Switched from `app_bottom` to `session_prompt_right` slot (proven by opencodeBar)
- [x] Event-driven updates — listen to session.status, session.created, session.deleted events
- [x] Status bar shows compression level emoji (🔥 ceiling, ⚡ ultra, 🍃 lean, 💤 off)
- [x] Status bar shows session duration
- [x] Status bar reads from stats-summary.json (written by saveStatsSummary)
- [x] Status bar uses event-driven updates + 5s polling fallback

## Phase 7: Advanced — History Compression ✅ DONE
- [x] #49 History compression (compress conversation history) — `history.ts`
  - [x] Sliding window (default 12 messages, configurable)
  - [x] Tool result summarization (read → symbols, bash → test/build status)
  - [x] Reasoning block compression
  - [x] Consecutive tool result collapsing
  - [x] Compaction detection (skip during native compaction)
  - [x] Kill switch (`enableHistoryCompression: false` default)
- [x] `experimental.chat.messages.transform` hook — in-place splice mutation
- [x] `experimental.session.compacting` hook — inject summary + write memory
- [x] `experimental.chat.system.transform` hook — inject session memory
- [x] #27 Persistent memory (keyword-based relevance scoring) — `memory.ts`
  - [x] JSONL session memory store
  - [x] Keyword extraction + relevance scoring
  - [x] Project path matching + recency bonus
  - [x] 24-hour staleness check
  - [x] LRU pruning (max 100 entries)
  - [x] Kill switch (`enableSessionMemory: false` default)

## Phase 8: Advanced (Future)
- [ ] #24 Semantic caching (vector similarity for read-only tool results)
- [ ] #29 Impact analysis (change impact, backward slicing)
- [ ] #30 BM25 + semantic search hybrid (tantivy + candle embeddings)
- [ ] #31 TextRank compression (graph-based sentence scoring)
- [ ] #41 Schema virtualization (compress tool schemas to DietMCP notation)
- [ ] #42 System prompt compression (compress backend instructions)
- [ ] #44 MCP meta-tools (expose 3 meta-tools instead of 37 individual)
- [ ] #46 Reversible compression (14-stage fusion pipeline)
- [ ] #47 Intelligent content routing (route by file type with ML classifier)
- [ ] #48 Tool pruning (remove unused tools from context)
- [ ] #50 Declarative YAML filters (config-driven rules engine)

## Architecture Notes
- All techniques designed for OpenCode plugin API (tool.execute.before/after)
- Zero external services — everything local
- Conservative fallback: never worse than original
- Error/failure preservation: never modified
- UTF-8 safe: never truncate mid-character

## Known Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Thresholds too aggressive | Users miss context | `conservativeFilter` ensures output never larger; easy to adjust |
| 14 stages add latency | Slow tool responses | `safeStage` wraps each; profile after real usage |
| `app_bottom` slot untested | Status bar doesn't show | Fallback to `session_prompt_right` |
| De-escalation oscillation | Compression level flickers | Hysteresis thresholds with 5% buffer |
| Secrets regex false positives | Legitimate text redacted | Patterns are specific; review edge cases |
| Lock file blocking | Can't read lock files when needed | Only blocks reads, not writes; users can override |

## Technique Sources
| Technique | Source Tool | Max Savings |
|-----------|-------------|-------------|
| Structural Symbol Navigation | token-savior (815★) | -99.9% |
| Think in Code Sandbox | context-mode | 200x |
| AST Skeleton Reads | pith + claw-compactor | -88% |
| Diff/Log Folding | claw-compactor | Part of 15-82% |
| JSON Sampling | claw-compactor | -82% |
| Reversible Compression | claw-compactor | Enables 82% |
| Content-Aware Router | claw-compactor | <50ms pipeline |
| LSP-First Enforcement | lsp-enforcement-kit | -80% |
| Command Rewrite | rtk | 60-99% |
| Cross-Call Dedup | squeez | 100% on hits |
| Auto-Escalation | pith | Adaptive |
| Session Memory | squeez | ~300 tok/session |
