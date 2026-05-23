// Command family detection — determines which filter to apply based on command

const FAMILY_MAP: Record<string, string> = {
  "git": "git",
  "npm": "npm",
  "yarn": "npm",
  "bun": "npm",
  "pnpm": "npm",
  "cargo": "cargo",
  "rustc": "cargo",
  "rustup": "cargo",
  "pytest": "test",
  "jest": "test",
  "mocha": "test",
  "vitest": "test",
  "go": "test",
  "gcc": "generic",
  "g++": "generic",
  "clang": "generic",
  "clang++": "generic",
  "make": "make",
  "cmake": "make",
  "python": "test",
  "python3": "test",
  "uv": "test",
  "poetry": "test",
  "pip": "pip",
  "pipx": "pip",
  "docker": "docker",
  "ls": "fs",
  "find": "fs",
  "tree": "fs",
  "rg": "fs",
  "grep": "fs",
  "cat": "fs",
  "head": "fs",
  "tail": "fs",
  "diff": "fs",
  "wc": "fs",
  "sort": "fs",
  "uniq": "fs",
  "du": "fs",
  "df": "fs",
}

export function detectFamily(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return "generic"

  // Extract first token (command name), handle paths and wrappers
  const first = trimmed.split(/\s+/)[0]
  const basename = first.split("/").pop()?.toLowerCase() || ""

  // Handle version managers: ~/.cargo/bin/cargo, .venv/bin/pytest
  // Handle wrappers: npx jest, poetry run pytest
  const cmd = basename || first.toLowerCase()

  // Check for known families
  if (FAMILY_MAP[cmd]) return FAMILY_MAP[cmd]

  // Handle npx/yarn/bun/pnpm run <command>
  if (["npx", "yarn", "bun", "pnpm"].includes(cmd)) {
    const rest = trimmed.split(/\s+/).slice(1).join(" ")
    // If it's "run <something>", detect the something
    if (rest.startsWith("run ") || rest.startsWith("exec ")) {
      const inner = rest.split(/\s+/)[1] || ""
      if (FAMILY_MAP[inner]) return FAMILY_MAP[inner]
    }
    // jest, mocha, etc. called directly via npx
    if (FAMILY_MAP[rest.split(/\s+/)[0]]) return FAMILY_MAP[rest.split(/\s+/)[0]]
  }

  // Handle poetry run, uv run
  if (["poetry", "uv"].includes(cmd)) {
    const runIdx = trimmed.indexOf("run ")
    if (runIdx !== -1) {
      const inner = trimmed.slice(runIdx + 4).split(/\s+/)[0]
      if (FAMILY_MAP[inner]) return FAMILY_MAP[inner]
    }
  }

  // File extension detection
  if (trimmed.endsWith(".md") || trimmed.endsWith(".markdown")) return "markdown"
  if ([".toml", ".json", ".yaml", ".yml", ".xml", ".ini", ".cfg", ".conf"].some((ext) => trimmed.endsWith(ext))) return "config"

  return "generic"
}
