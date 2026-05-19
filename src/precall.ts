// Pre-call filters — intercept tool args BEFORE execution
// #3 Block verbose commands → rewrite to quiet
// #5 Subagent budget enforcement
// #6 Block minified/generated files
// #7 Size caps on write/edit

const MINIFIED_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.bundle\.(js|css)$/,
  /\.chunk\.\w+\.js$/,
  /\.generated\./,
  /\/dist\//,
  /\/build\//,
  /\/out\//,
  /\/target\//,
  /\/node_modules\//,
  /\/\.next\//,
  /\/\.nuxt\//,
  /\/\.svelte-kit\//,
  /\/\.cache\//,
  /\/__pycache__\//,
  /\/\.turbo\//,
  /\/\.parcel-cache\//,
  /\/coverage\//,
  /\/\.venv\//,
  /\/venv\//,
  /\/vendor\//,
]

// #3: Command rewrite rules — map verbose → quiet
const COMMAND_REWRITES: { match: RegExp; rewrite: (cmd: string) => string }[] = [
  // npm/yarn/bun/pnpm install → add --silent
  {
    match: /^(npm|yarn|bun|pnpm)\s+(install|i|add)(\s|$)/,
    rewrite: (cmd) => {
      if (cmd.includes("--silent") || cmd.includes("-s") || cmd.includes("--quiet") || cmd.includes("-q")) return cmd
      return cmd.replace(/^(npm|yarn|bun|pnpm)\s+(install|i|add)/, "$1 $2 --silent")
    },
  },
  // npm run → add --silent
  {
    match: /^(npm|yarn|bun|pnpm)\s+run\s/,
    rewrite: (cmd) => {
      if (cmd.includes("--silent") || cmd.includes("-s") || cmd.includes("--quiet") || cmd.includes("-q")) return cmd
      return `${cmd} --silent`
    },
  },
  // curl → add -s
  {
    match: /^curl\s/,
    rewrite: (cmd) => {
      if (cmd.includes(" -s") || cmd.includes(" -S") || cmd.includes("--silent")) return cmd
      return cmd.replace(/^curl\s/, "curl -s ")
    },
  },
  // wget → add -q
  {
    match: /^wget\s/,
    rewrite: (cmd) => {
      if (cmd.includes(" -q") || cmd.includes("--quiet")) return cmd
      return cmd.replace(/^wget\s/, "wget -q ")
    },
  },
  // docker build → add --progress=quiet
  {
    match: /^docker\s+build\s/,
    rewrite: (cmd) => {
      if (cmd.includes("--progress")) return cmd
      return cmd.replace(/^docker\s+build/, "docker build --progress=quiet")
    },
  },
  // docker compose → add --quiet
  {
    match: /^docker\s+compose\s/,
    rewrite: (cmd) => {
      if (cmd.includes("--quiet") || cmd.includes("-q")) return cmd
      return `${cmd} --quiet`
    },
  },
  // git log without --oneline → add --oneline
  {
    match: /^git\s+log(?!\s+--oneline)(?!\s+-\w*o)/,
    rewrite: (cmd) => cmd.replace(/^git\s+log/, "git log --oneline"),
  },
  // cargo build → add --quiet
  {
    match: /^cargo\s+(build|check|test|clippy)(?!\s+--)/,
    rewrite: (cmd) => cmd.replace(/^(cargo\s+\w+)/, "$1 --quiet"),
  },
  // cargo build --release without --quiet
  {
    match: /^cargo\s+(build|check|test|clippy)\s+--release(?!\s+--)/,
    rewrite: (cmd) => cmd.replace(/^(cargo\s+\w+\s+--release)/, "$1 --quiet"),
  },
  // pip install → add --quiet
  {
    match: /^pip(3)?\s+install\s/,
    rewrite: (cmd) => {
      if (cmd.includes("--quiet") || cmd.includes("-q")) return cmd
      return cmd.replace(/^(pip3?\s+install)/, "$1 --quiet")
    },
  },
  // pytest → add -q
  {
    match: /^pytest(?!\s+-[qr])/,
    rewrite: (cmd) => `${cmd} -q`,
  },
  // ls → add --color=never (saves ANSI escape tokens)
  {
    match: /^ls\s/,
    rewrite: (cmd) => {
      if (cmd.includes("--color")) return cmd
      return cmd.replace(/^ls\s/, "ls --color=never ")
    },
  },
  // tree → add -I to exclude noise
  {
    match: /^tree\s/,
    rewrite: (cmd) => {
      if (cmd.includes("-I")) return cmd
      return `${cmd} -I "node_modules|.git|dist|build|.cache|__pycache__|.venv|coverage|.next|.turbo"`
    },
  },
  // find → exclude noise dirs
  {
    match: /^find\s/,
    rewrite: (cmd) => {
      if (cmd.includes("-path") || cmd.includes("-prune")) return cmd
      return `${cmd} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.cache/*" -not -path "*/__pycache__/*"`
    },
  },
]

// #6: Check if file path is minified/generated
export function isMinifiedOrGenerated(filePath: string): boolean {
  return MINIFIED_PATTERNS.some((p) => p.test(filePath))
}

// #3: Rewrite command to quiet version
export function rewriteCommand(command: string): string {
  let result = command.trim()
  for (const rule of COMMAND_REWRITES) {
    if (rule.match.test(result)) {
      result = rule.rewrite(result)
    }
  }
  return result
}

// #7: Size caps for write/edit
export const WRITE_MAX_BYTES = 100 * 1024 // 100KB
export const EDIT_MAX_BYTES = 50 * 1024 // 50KB

export function checkWriteSize(content: string): { allowed: boolean; reason?: string } {
  if (content.length > WRITE_MAX_BYTES) {
    return { allowed: false, reason: `Write blocked: ${Math.round(content.length / 1024)}KB exceeds ${WRITE_MAX_BYTES / 1024}KB limit` }
  }
  return { allowed: true }
}

export function checkEditSize(content: string): { allowed: boolean; reason?: string } {
  if (content.length > EDIT_MAX_BYTES) {
    return { allowed: false, reason: `Edit blocked: ${Math.round(content.length / 1024)}KB exceeds ${EDIT_MAX_BYTES / 1024}KB limit` }
  }
  return { allowed: true }
}

// #5: Subagent budget tracking
interface SubagentBudget {
  maxReadBytes: number
  maxCallCount: number
  currentCalls: number
  totalReadBytes: number
}

const subagentBudgets = new Map<string, SubagentBudget>()

export function initSubagentBudget(agentId: string, maxReadBytes = 10 * 1024, maxCallCount = 25): void {
  subagentBudgets.set(agentId, {
    maxReadBytes,
    maxCallCount,
    currentCalls: 0,
    totalReadBytes: 0,
  })
}

export function checkSubagentBudget(agentId: string, tool: string, contentSize = 0): { allowed: boolean; reason?: string } {
  const budget = subagentBudgets.get(agentId)
  if (!budget) return { allowed: true } // No budget = unlimited (main agent)

  budget.currentCalls++
  if (budget.currentCalls > budget.maxCallCount) {
    return { allowed: false, reason: `Subagent call limit exceeded: ${budget.currentCalls}/${budget.maxCallCount}` }
  }

  if (tool === "read") {
    budget.totalReadBytes += contentSize
    if (budget.totalReadBytes > budget.maxReadBytes) {
      return { allowed: false, reason: `Subagent read budget exceeded: ${Math.round(budget.totalReadBytes / 1024)}KB/${Math.round(budget.maxReadBytes / 1024)}KB` }
    }
  }

  return { allowed: true }
}

// Pre-call hook: intercept tool args before execution
export function preCallFilter(tool: string, args: Record<string, unknown>): {
  blocked?: boolean
  reason?: string
  modifiedArgs?: Record<string, unknown>
} {
  // #3: Bash command rewriting
  if (tool === "bash" && typeof args.command === "string") {
    const rewritten = rewriteCommand(args.command)
    if (rewritten !== args.command) {
      return { modifiedArgs: { ...args, command: rewritten } }
    }
  }

  // #6: Block reads of minified/generated files
  if (tool === "read" && typeof args.filePath === "string") {
    if (isMinifiedOrGenerated(args.filePath)) {
      return {
        blocked: true,
        reason: `Blocked: ${args.filePath} is minified/generated (use outline instead)`,
      }
    }
  }

  // #7: Size caps on write/edit
  if (tool === "write" && typeof args.content === "string") {
    const check = checkWriteSize(args.content)
    if (!check.allowed) return { blocked: true, reason: check.reason }
  }

  if (tool === "edit" && typeof args.content === "string") {
    const check = checkEditSize(args.content)
    if (!check.allowed) return { blocked: true, reason: check.reason }
  }

  return {}
}
