# OpenToken — Build Roadmap

## Phase 1: High-Impact Easy Wins ✅ DONE
- [x] #3 Block verbose commands (npm install → npm install --quiet, curl → curl -s)
- [x] #5 Subagent budget enforcement (read byte limits, call counts)
- [x] #6 Block minified/generated files (.min.js, dist/, node_modules/, bundled)
- [x] #7 Size caps on write/edit (100KB write, 50KB edit)
- [x] #14 Large output offload (>500 lines → temp file + pointer)
- [x] #15 XML/Markdown block stripping (<antThinking>, <thinking>)
- [x] #16 Binary detection (NUL byte scan, suppress)
- [x] #17 Output suppression (>500KB → block entirely)
- [x] #20 Key aliasing (replace long JSON keys with short aliases)
- [x] #21 Whitespace/null cleanup (strip redundant fields, timestamps)
- [x] #25 Cross-call deduplication (same output within N calls → collapse)
- [x] #26 Progressive disclosure (summary first, full on demand via MCP)
- [x] #36 Auto-escalation (ratchet compression as context fills)
- [x] #38 Session memory (inject previous session summary on start)
- [x] #43 Cache-lock (session rules hashed, skip if unchanged)

## Phase 2: Medium (Moderate Effort)
- [ ] #10 AST-based code analysis via tree-sitter (web-tree-sitter WASM)
- [ ] #11 Schema extraction for configs (extract JSON Schema, drop values)
- [ ] #22 CSV smart sampling (sample rows, header + tail + stats)
- [ ] #32 LSP-first enforcement (block grep for symbols when LSP available)
- [ ] #34 Batch execution (combine multiple commands into one call)
- [ ] #35 Sandbox execution (process files, only result enters context)
- [ ] #45 HANDOFF/CHECKPOINT (structured context save/restore across sessions)
- [ ] #50 Declarative YAML filters (config-driven rules engine)

## Phase 3: Advanced (Complex)
- [ ] #24 Semantic caching (vector similarity for read-only tool results)
- [ ] #27 Persistent memory (SQLite + FTS5 + vector embeddings)
- [ ] #28 Symbol-based navigation (find_symbol, get_function_source, call graph)
- [ ] #29 Impact analysis (change impact, backward slicing)
- [ ] #30 BM25 + semantic search hybrid (tantivy + candle embeddings)
- [ ] #31 TextRank compression (graph-based sentence scoring)
- [ ] #41 Schema virtualization (compress tool schemas to DietMCP notation)
- [ ] #42 System prompt compression (compress backend instructions)
- [ ] #44 MCP meta-tools (expose 3 meta-tools instead of 37 individual)
- [ ] #46 Reversible compression (14-stage fusion pipeline)
- [ ] #47 Intelligent content routing (route by file type with ML classifier)
- [ ] #48 Tool pruning (remove unused tools from context)
- [ ] #49 History compression (compress conversation history)

## Architecture Notes
- All techniques designed for OpenCode plugin API (tool.execute.before/after)
- Zero external services — everything local
- Conservative fallback: never worse than original
- Error/failure preservation: never modified
- UTF-8 safe: never truncate mid-character
