# Contributing

## Setup

- **Runtime:** Bun 1.3+
- **Install:** `bun install`
- **Link locally:** `bun run link` (or copy to `~/.config/opencode/plugins/`)

## Development

```bash
bun test              # Run all tests (watch mode: bun test --watch)
bun run typecheck     # TypeScript type checking
bun run lint          # Biome linting
bun run format        # Auto-format source files
bun run checks:regex  # Regex safety validation
```

## Project structure

```
src/
  index.ts            # Plugin entry point, pipeline orchestration
  precall.ts          # Pre-call stage: route tools to families
  postcall.ts         # Post-call: normalize, fold, minify
  rewind.ts           # Reversible compression store + semantic abbreviation
  ltsc.ts             # LTSC — Lossless Token Sequence Compression
  tui.tsx             # TUI status bar widget (Solid.js)
  statusline.ts       # Status line generator for conversation output
  toon.ts             # TOON — compact array notation
  history.ts          # History compression hooks
  memory.ts           # Cross-session memory persistence
  autoescalate.ts     # Auto-escalation: progressive compression
  skeleton.ts         # Skeleton extraction (file paths, permissions)
  symbolindex.ts      # Symbol index for code structure queries
  session.ts          # Session-scoped stats tracking
  metrics.ts          # Token savings metrics collection
  config.ts           # Configuration loading
  families/           # Tool family-specific filters
    bash.ts           # Bash output compression
    fs.ts             # File system output (ls, find, tree)
    grep.ts           # Grep output compression
    read.ts           # Read tool output compression (cat dedup)
    cargo.ts          # Cargo build output filter
    pip.ts            # pip install output filter
    docker.ts         # Docker output filter
    make.ts           # Make output filter
  filters/            # Generic output filters
    generic.ts
    compile.ts
  utils/
    session-store.ts  # Session-keyed storage
.opencode/
  plugins/opentoken/  # Installed plugin mirror (keep in sync)
```

Pipeline stages (applied in order after each tool call):

1. Pre-call: route tool to family, apply family-specific compressor
2. Post-call: normalize whitespace → fold repeated lines → minify JSON → LTSC → LZW → semantic abbreviation → conservative filter

## Testing

- All tests are in `tests/opentoken.test.ts` (Bun test runner)
- Add test cases for new compressors covering edge cases (empty input, single line, no savings, maximum compression)
- Run `bun test` before committing

## Pull request guidelines

- Keep the 0-risk principle: new compressors must never change the logical content
- Test coverage for new features
- Update `CHANGELOG.md` with a summary of changes
- Run `bun run typecheck && bun run lint && bun test` before submitting
- If adding a new config option, update the JSON schema (`.opencode/opentoken-config-schema.json`)

## Release process

1. Update `CHANGELOG.md` with the new version and changes
2. Update version in `package.json`
3. Create a tag: `git tag vX.Y.Z`
4. Push: `git push && git push --tags`
5. GitHub Actions CI runs automatically on push

## License

MIT
