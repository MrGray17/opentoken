// Session memory + cache-lock (#38, #43)
// #38: Inject previous session summary on start
// #43: Cache-lock — session rules hashed, skip if unchanged

import path from "path"
import os from "os"

const MEMORY_DIR = path.join(os.homedir(), ".config", "opentoken")
const SESSION_FILE = path.join(MEMORY_DIR, "session-memory.json")
const CACHE_LOCK_FILE = path.join(MEMORY_DIR, "cache-lock.json")

interface SessionSummary {
  timestamp: number
  project: string
  filesTouched: string[]
  errors: string[]
  testResults: string[]
  gitEvents: string[]
  decisions: string[]
  toolCalls: number
  tokensSaved: number
}

interface CacheLock {
  rulesHash: string
  configHash: string
  lastChecked: number
  skipCount: number
}

// Hash function for cache-lock
function hashString(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// #38: Session memory — save current session summary
export async function saveSessionSummary(summary: Partial<SessionSummary>): Promise<void> {
  try {
    let existing: SessionSummary | null = null
    const file = Bun.file(SESSION_FILE)
    if (await file.exists()) {
      existing = JSON.parse(await file.text())
    }

    const newSummary: SessionSummary = {
      timestamp: Date.now(),
      project: summary.project || existing?.project || "unknown",
      filesTouched: summary.filesTouched || existing?.filesTouched || [],
      errors: summary.errors || existing?.errors || [],
      testResults: summary.testResults || existing?.testResults || [],
      gitEvents: summary.gitEvents || existing?.gitEvents || [],
      decisions: summary.decisions || existing?.decisions || [],
      toolCalls: summary.toolCalls || existing?.toolCalls || 0,
      tokensSaved: summary.tokensSaved || existing?.tokensSaved || 0,
    }

    await Bun.write(SESSION_FILE, JSON.stringify(newSummary, null, 2))
  } catch {
    // Silent fail
  }
}

// #38: Session memory — load previous session summary
export async function loadSessionSummary(project?: string): Promise<string | null> {
  try {
    const file = Bun.file(SESSION_FILE)
    if (!(await file.exists())) return null

    const summary: SessionSummary = JSON.parse(await file.text())

    // Only load if same project
    if (project && summary.project !== project) return null

    // Check if summary is stale (older than 24 hours)
    const hoursSince = (Date.now() - summary.timestamp) / (1000 * 60 * 60)
    if (hoursSince > 24) return null

    // Build compact injection string
    const parts: string[] = []

    if (summary.filesTouched.length > 0) {
      parts.push(`Previous session touched: ${summary.filesTouched.slice(0, 10).join(", ")}`)
    }
    if (summary.errors.length > 0) {
      parts.push(`Errors encountered: ${summary.errors.slice(0, 5).join("; ")}`)
    }
    if (summary.testResults.length > 0) {
      parts.push(`Test results: ${summary.testResults.join("; ")}`)
    }
    if (summary.gitEvents.length > 0) {
      parts.push(`Git events: ${summary.gitEvents.slice(0, 5).join("; ")}`)
    }
    if (summary.decisions.length > 0) {
      parts.push(`Decisions: ${summary.decisions.slice(0, 5).join("; ")}`)
    }

    parts.push(`Previous session: ${summary.toolCalls} tool calls, saved ${Math.round(summary.tokensSaved / 1024)}KB tokens`)

    return parts.join(". ") + "."
  } catch {
    return null
  }
}

// #43: Cache-lock — check if rules/config unchanged
export async function checkCacheLock(rules: string, config: string): Promise<{
  shouldSkip: boolean
  skipCount: number
}> {
  try {
    const rulesHash = hashString(rules)
    const configHash = hashString(config)

    const file = Bun.file(CACHE_LOCK_FILE)
    if (!(await file.exists())) {
      // First run — create lock
      await Bun.write(CACHE_LOCK_FILE, JSON.stringify({
        rulesHash,
        configHash,
        lastChecked: Date.now(),
        skipCount: 0,
      }))
      return { shouldSkip: false, skipCount: 0 }
    }

    const lock: CacheLock = JSON.parse(await file.text())

    if (lock.rulesHash === rulesHash && lock.configHash === configHash) {
      // Rules unchanged — increment skip count
      lock.skipCount++
      lock.lastChecked = Date.now()
      await Bun.write(CACHE_LOCK_FILE, JSON.stringify(lock))
      return { shouldSkip: true, skipCount: lock.skipCount }
    }

    // Rules changed — reset lock
    await Bun.write(CACHE_LOCK_FILE, JSON.stringify({
      rulesHash,
      configHash,
      lastChecked: Date.now(),
      skipCount: 0,
    }))
    return { shouldSkip: false, skipCount: 0 }
  } catch {
    return { shouldSkip: false, skipCount: 0 }
  }
}

// #43: Cache-lock — reset (when rules change)
export async function resetCacheLock(): Promise<void> {
  try {
    await Bun.write(CACHE_LOCK_FILE, JSON.stringify({
      rulesHash: "",
      configHash: "",
      lastChecked: Date.now(),
      skipCount: 0,
    }))
  } catch {
    // Silent fail
  }
}

// Track session state for summary building
interface SessionTracker {
  filesTouched: Set<string>
  errors: string[]
  testResults: string[]
  gitEvents: string[]
  decisions: string[]
  toolCalls: number
  tokensSaved: number
}

const tracker: SessionTracker = {
  filesTouched: new Set(),
  errors: [],
  testResults: [],
  gitEvents: [],
  decisions: [],
  toolCalls: 0,
  tokensSaved: 0,
}

export function trackFile(filePath: string): void {
  tracker.filesTouched.add(filePath)
}

export function trackError(error: string): void {
  tracker.errors.push(error.slice(0, 200))
}

export function trackTestResult(result: string): void {
  tracker.testResults.push(result.slice(0, 100))
}

export function trackGitEvent(event: string): void {
  tracker.gitEvents.push(event.slice(0, 100))
}

export function trackDecision(decision: string): void {
  tracker.decisions.push(decision.slice(0, 100))
}

export function trackToolCall(): void {
  tracker.toolCalls++
}

export function trackTokensSaved(saved: number): void {
  tracker.tokensSaved += saved
}

export function getSessionTracker(): SessionTracker {
  return {
    filesTouched: new Set(tracker.filesTouched),
    errors: [...tracker.errors],
    testResults: [...tracker.testResults],
    gitEvents: [...tracker.gitEvents],
    decisions: [...tracker.decisions],
    toolCalls: tracker.toolCalls,
    tokensSaved: tracker.tokensSaved,
  }
}

export function resetSessionTracker(): void {
  tracker.filesTouched.clear()
  tracker.errors.length = 0
  tracker.testResults.length = 0
  tracker.gitEvents.length = 0
  tracker.decisions.length = 0
  tracker.toolCalls = 0
  tracker.tokensSaved = 0
}

// Build and save session summary at session end
export async function finalizeSession(project: string): Promise<void> {
  await saveSessionSummary({
    project,
    filesTouched: [...tracker.filesTouched],
    errors: tracker.errors,
    testResults: tracker.testResults,
    gitEvents: tracker.gitEvents,
    decisions: tracker.decisions,
    toolCalls: tracker.toolCalls,
    tokensSaved: tracker.tokensSaved,
  })
  resetSessionTracker()
}
