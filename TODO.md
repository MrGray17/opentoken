# OpenToken TODO

## 1. Done — Pipeline Extraction

Extracted from `src/index.ts` into standalone modules:
- [x] `src/config.ts` — config loading and validation
- [x] `src/guards.ts` — input guards and rewriting
- [x] `src/wrappers.ts` — pipeline stage wrappers
- [x] `src/pipelines.ts` — pipeline orchestration

Tests split into:
- [x] `tests/pipeline.test.ts`
- [x] `tests/filters.test.ts`
- [x] `tests/compression.test.ts`

All typecheck, lint, and 207+ tests pass.

## 2. CLI (Future)

- [ ] `src/cli.ts` — stdin → pipeline → stdout
- [ ] `"bin"` in `package.json`
- [ ] `cat log.txt | npx opentoken` works

## 3. Session memory enhancements

- [ ] Memory compaction (merge similar facts)
- [ ] Per-project memory TTL
