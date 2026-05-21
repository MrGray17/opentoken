// Session memory store — cross-session knowledge persistence
// JSONL format with keyword-based relevance scoring
// On session.created: inject top-3 relevant previous session summaries

import path from "path"
import os from "os"
import fs from "fs"

interface MemoryEntry {
  ts: number
  sessionID: string
  projectPath: string
  summary: string
  files: string[]
  keywords: string[]
  tokens: number
}

const MEMORY_DIR = path.join(os.homedir(), ".config", "opentoken")
const MEMORY_FILE = path.join(MEMORY_DIR, "memory.jsonl")
const MAX_ENTRIES = 100
const STALENESS_HOURS = 24

function ensureDir(): void {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true })
    }
  } catch { /* ignore */ }
}

// Read all memory entries
function readEntries(): MemoryEntry[] {
  try {
    ensureDir()
    if (!fs.existsSync(MEMORY_FILE)) return []
    const content = fs.readFileSync(MEMORY_FILE, "utf-8")
    return content
      .split("\n")
      .filter(l => l.trim().length > 0)
      .map(l => JSON.parse(l) as MemoryEntry)
  } catch {
    return []
  }
}

// Write all entries (for pruning)
function writeEntries(entries: MemoryEntry[]): void {
  try {
    ensureDir()
    const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n"
    fs.writeFileSync(MEMORY_FILE, content)
  } catch { /* ignore */ }
}

// Append a single entry
function appendEntry(entry: MemoryEntry): void {
  try {
    ensureDir()
    const line = JSON.stringify(entry) + "\n"
    fs.appendFileSync(MEMORY_FILE, line)
  } catch { /* ignore */ }
}

// Extract keywords from summary text
function extractKeywords(summary: string): string[] {
  const words = summary
    .toLowerCase()
    .replace(/[^\w\s-/.]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3)

  // Remove common stop words
  const stopWords = new Set([
    "this", "that", "with", "from", "have", "been", "were", "they",
    "their", "there", "would", "could", "should", "which", "about",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "here",
    "what", "when", "where", "why", "how", "all", "each", "every",
    "both", "few", "more", "most", "other", "some", "such", "only",
    "own", "same", "than", "too", "very", "just", "also", "now",
    "the", "and", "for", "are", "but", "not", "you", "all", "can",
    "her", "was", "one", "our", "out", "day", "get", "has", "him",
    "his", "its", "may", "new", "old", "see", "two", "who", "did",
    "use", "way", "many", "back", "well", "down", "still", "even",
    "make", "made", "like", "long", "look", "come", "made", "does",
  ])

  const filtered = words.filter(w => !stopWords.has(w))

  // Deduplicate
  return [...new Set(filtered)].slice(0, 20)
}

// Extract file paths from summary
function extractFiles(summary: string): string[] {
  const filePattern = /(?:^|\s|["'`])([\/\w.-]+\.\w{1,6})(?:["'`\s,;:]|$)/g
  const files: string[] = []
  let match

  while ((match = filePattern.exec(summary)) !== null) {
    const f = match[1]
    if (f.includes("/") || f.includes(".")) {
      files.push(f)
    }
  }

  return [...new Set(files)].slice(0, 10)
}

// Score relevance of a memory entry against current context
function scoreRelevance(
  entry: MemoryEntry,
  projectPath: string,
  keywords: string[]
): number {
  let score = 0

  // Project path match (highest weight)
  if (entry.projectPath === projectPath) {
    score += 50
  } else if (entry.projectPath && projectPath) {
    // Partial path match (same parent directory)
    const entryParts = entry.projectPath.split(path.sep)
    const currentParts = projectPath.split(path.sep)
    const common = entryParts.filter(p => currentParts.includes(p))
    score += common.length * 5
  }

  // Keyword overlap
  const entryKeywords = new Set(entry.keywords.map(k => k.toLowerCase()))
  const currentKeywords = keywords.map(k => k.toLowerCase())
  let matches = 0
  for (const kw of currentKeywords) {
    if (entryKeywords.has(kw)) matches++
  }
  score += matches * 10

  // File overlap
  if (keywords.length > 0) {
    const entryFiles = new Set(entry.files.map(f => f.toLowerCase()))
    for (const kw of currentKeywords) {
      if (kw.includes(".") && entryFiles.has(kw)) {
        score += 15
      }
    }
  }

  // Recency bonus (entries within staleness window get bonus)
  const hoursSince = (Date.now() - entry.ts) / (1000 * 60 * 60)
  if (hoursSince < STALENESS_HOURS) {
    score += 20
  } else if (hoursSince < STALENESS_HOURS * 3) {
    score += 10
  } else if (hoursSince < STALENESS_HOURS * 7) {
    score += 5
  }

  return score
}

// Write a session summary to memory
export function writeSessionSummary(
  sessionID: string,
  projectPath: string,
  summary: string
): void {
  const entry: MemoryEntry = {
    ts: Date.now(),
    sessionID,
    projectPath,
    summary,
    files: extractFiles(summary),
    keywords: extractKeywords(summary),
    tokens: Math.ceil(summary.length * 0.25),
  }

  appendEntry(entry)
  pruneMemory()
}

// Get relevant session summaries for current context
export function getRelevantSummaries(
  projectPath: string,
  keywords: string[],
  limit: number = 3
): MemoryEntry[] {
  const entries = readEntries()

  const scored = entries
    .map(e => ({ entry: e, score: scoreRelevance(e, projectPath, keywords) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(s => s.entry)
}

// Extract keywords from user prompt and tool usage
export function extractContextKeywords(
  prompt: string,
  files: string[] = []
): string[] {
  const promptKeywords = extractKeywords(prompt)
  const fileKeywords = files.flatMap(f => {
    const parts = f.split(/[\/\\.-]/)
    return parts.filter(p => p.length > 3)
  })

  return [...new Set([...promptKeywords, ...fileKeywords])].slice(0, 30)
}

// Build a formatted memory prompt for system injection
export function buildMemoryPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ""

  const lines: string[] = [
    "",
    "## Previous Session Memory",
    "Relevant context from recent sessions on this project:",
    "",
  ]

  for (const entry of entries) {
    const hoursAgo = Math.round((Date.now() - entry.ts) / (1000 * 60 * 60))
    const timeLabel = hoursAgo < 1 ? "just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`

    lines.push(`### Session from ${timeLabel} (${entry.sessionID.slice(0, 8)})`)
    lines.push(entry.summary)
    if (entry.files.length > 0) {
      lines.push(`Files: ${entry.files.slice(0, 5).join(", ")}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

// Prune memory to max entries (keep most recent)
export function pruneMemory(maxEntries: number = MAX_ENTRIES): void {
  const entries = readEntries()
  if (entries.length <= maxEntries) return

  // Sort by timestamp descending, keep top N
  const sorted = entries.sort((a, b) => b.ts - a.ts).slice(0, maxEntries)
  writeEntries(sorted)
}

// Get memory statistics
export function getMemoryStats(): { total: number; byProject: Record<string, number>; oldest: string } {
  const entries = readEntries()
  const byProject: Record<string, number> = {}

  for (const e of entries) {
    const key = e.projectPath || "unknown"
    byProject[key] = (byProject[key] || 0) + 1
  }

  return {
    total: entries.length,
    byProject,
    oldest: entries.length > 0 ? new Date(entries[entries.length - 1].ts).toISOString() : "none",
  }
}

// Clear all memory (kill switch)
export function clearMemory(): void {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      fs.unlinkSync(MEMORY_FILE)
    }
  } catch { /* ignore */ }
}
