// Session memory (#38)
// Inject previous session summary on start
// Session-keyed to prevent cross-session state corruption

import path from "path"
import os from "os"
import fs from "fs"
import { SessionStore } from "./utils/session-store"

const MEMORY_DIR = path.join(os.homedir(), ".config", "opentoken")
const SESSION_FILE = path.join(MEMORY_DIR, "session-memory.json")

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
  compressionLevel: string
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
      project: summary.project ?? existing?.project ?? "unknown",
      filesTouched: summary.filesTouched ?? existing?.filesTouched ?? [],
      errors: summary.errors ?? existing?.errors ?? [],
      testResults: summary.testResults ?? existing?.testResults ?? [],
      gitEvents: summary.gitEvents ?? existing?.gitEvents ?? [],
      decisions: summary.decisions ?? existing?.decisions ?? [],
      toolCalls: summary.toolCalls ?? existing?.toolCalls ?? 0,
      tokensSaved: summary.tokensSaved ?? existing?.tokensSaved ?? 0,
      compressionLevel: summary.compressionLevel ?? existing?.compressionLevel ?? "lean"}

    const tempFile = `${SESSION_FILE}.tmp`
    await Bun.write(tempFile, JSON.stringify(newSummary, null, 2))
    fs.renameSync(tempFile, SESSION_FILE)
    fs.chmodSync(SESSION_FILE, 0o600)
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

// Track session state for summary building — session-keyed
interface SessionTracker {
  filesTouched: Set<string>
  errors: string[]
  gitEvents: string[]
  toolCalls: number
  tokensSaved: number
}

function createSessionTracker(): SessionTracker {
  return {
    filesTouched: new Set(),
    errors: [],
    gitEvents: [],
    toolCalls: 0,
    tokensSaved: 0}
}

const store = new SessionStore<SessionTracker>()

function getTracker(sessionID: string): SessionTracker {
  return store.get(sessionID, createSessionTracker)
}

export function trackFile(sessionID: string, filePath: string): void {
  getTracker(sessionID).filesTouched.add(filePath)
}

export function trackError(sessionID: string, error: string): void {
  getTracker(sessionID).errors.push(error.slice(0, 200))
}

export function trackGitEvent(sessionID: string, event: string): void {
  getTracker(sessionID).gitEvents.push(event.slice(0, 100))
}

export function trackToolCall(sessionID: string): void {
  getTracker(sessionID).toolCalls++
}

export function trackTokensSaved(sessionID: string, saved: number): void {
  getTracker(sessionID).tokensSaved += saved
}

export function getSessionTracker(sessionID: string): SessionTracker {
  const t = getTracker(sessionID)
  return {
    filesTouched: new Set(t.filesTouched),
    errors: [...t.errors],
    gitEvents: [...t.gitEvents],
    toolCalls: t.toolCalls,
    tokensSaved: t.tokensSaved}
}

export function resetSessionTracker(sessionID: string): void {
  store.reset(sessionID, createSessionTracker)
}

// Write current session state to disk (called after each tool call)
// The TUI reads this file as a primary/fallback data source
export async function writeSessionState(sessionID: string, project?: string, compressionLevel?: string): Promise<void> {
  const t = getTracker(sessionID)
  const summary: SessionSummary = {
    timestamp: Date.now(),
    project: project ?? "unknown",
    filesTouched: [...t.filesTouched],
    errors: [...t.errors],
    testResults: [],
    gitEvents: [...t.gitEvents],
    decisions: [],
    toolCalls: t.toolCalls,
    tokensSaved: t.tokensSaved,
    compressionLevel: compressionLevel ?? "lean"}

  try {
    const tempFile = `${SESSION_FILE}.tmp`
    await Bun.write(tempFile, JSON.stringify(summary, null, 2))
    fs.renameSync(tempFile, SESSION_FILE)
    fs.chmodSync(SESSION_FILE, 0o600)
  } catch {
    // Silent fail
  }
}

// Build and save session summary at session end
export async function finalizeSession(sessionID: string, project: string): Promise<void> {
  const t = getTracker(sessionID)
  await saveSessionSummary({
    project,
    filesTouched: [...t.filesTouched],
    errors: t.errors,
    testResults: [],
    gitEvents: t.gitEvents,
    decisions: [],
    toolCalls: t.toolCalls,
    tokensSaved: t.tokensSaved})
  resetSessionTracker(sessionID)
}
