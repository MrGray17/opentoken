// Error logging — track stage failures for debugging and monitoring
// Separate from metrics — errors go to error.jsonl for analysis

import path from "path"
import os from "os"
import fs from "fs"

const ERROR_DIR = path.join(os.homedir(), ".config", "opentoken")
const ERROR_FILE = path.join(ERROR_DIR, "error.jsonl")
const MAX_ERROR_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_ROTATED_FILES = 3

interface ErrorEntry {
  ts: string
  stage: string
  tool: string
  error: string
  stack?: string
  recoverable: boolean
}

function ensureDir(): void {
  try {
    if (!fs.existsSync(ERROR_DIR)) {
      fs.mkdirSync(ERROR_DIR, { recursive: true })
    }
  } catch {
    // Homedir inaccessible — errors will silently fail
  }
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(ERROR_FILE)) return
    const stat = fs.statSync(ERROR_FILE)
    if (stat.size < MAX_ERROR_SIZE) return

    const oldest = `${ERROR_FILE}.${MAX_ROTATED_FILES}`
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest)

    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const src = `${ERROR_FILE}.${i}`
      const dest = `${ERROR_FILE}.${i + 1}`
      if (fs.existsSync(src)) fs.renameSync(src, dest)
    }

    fs.renameSync(ERROR_FILE, `${ERROR_FILE}.1`)
  } catch {
    // Rotation failed — continue appending
  }
}

export function logError(entry: ErrorEntry): void {
  try {
    ensureDir()
    rotateIfNeeded()
    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(ERROR_FILE, line)
  } catch {
    // Silent fail — error logging shouldn't break the pipeline
  }
}

// Get error summary for diagnostics
export function getErrorSummary(): { total: number; byStage: Record<string, number>; recent: ErrorEntry[] } {
  try {
    if (!fs.existsSync(ERROR_FILE)) return { total: 0, byStage: {}, recent: [] }
    const text = fs.readFileSync(ERROR_FILE, "utf8")
    const lines = text.trim().split("\n").filter((l) => l.trim())
    const entries: ErrorEntry[] = []
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as ErrorEntry)
      } catch {
        // skip malformed
      }
    }

    const byStage: Record<string, number> = {}
    for (const e of entries) {
      byStage[e.stage] = (byStage[e.stage] || 0) + 1
    }

    return {
      total: entries.length,
      byStage,
      recent: entries.slice(-10),
    }
  } catch {
    return { total: 0, byStage: {}, recent: [] }
  }
}
