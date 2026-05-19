// Progressive disclosure system (#26)
// Summary first, full content on demand
// Stores oversized results in temp files, leaves pointer in context

import path from "path"
import os from "os"

const OFFLOAD_DIR = path.join(os.homedir(), ".config", "opentoken", "offload")
const MAX_INLINE_LINES = 200
const MAX_INLINE_BYTES = 20 * 1024 // 20KB

interface OffloadEntry {
  id: string
  tool: string
  summary: string
  filePath: string
  fullSize: number
  fullLines: number
  timestamp: number
}

const offloadStore = new Map<string, OffloadEntry>()
let offloadCounter = 0

async function ensureDir(): Promise<void> {
  try {
    await Bun.file(OFFLOAD_DIR).exists() || await Bun.$`mkdir -p ${OFFLOAD_DIR}`.quiet()
  } catch {
    // Ignore
  }
}

// Generate a unique offload ID
function generateId(): string {
  offloadCounter++
  return `ot-${offloadCounter}-${Date.now().toString(36)}`
}

// Create a concise summary of content
function createSummary(content: string, tool: string): string {
  const lines = content.split("\n")
  const totalLines = lines.length
  const totalBytes = content.length

  // Extract key info based on tool type
  let keyInfo = ""

  if (tool === "bash") {
    // Extract exit code, errors, file changes
    const errors = lines.filter((l) => /error|fail|panic|fatal/i.test(l)).slice(0, 5)
    const files = lines.filter((l) => /^\s*[AMDRCU?!\s]{2}\s+/.test(l)).slice(0, 10)
    if (errors.length > 0) keyInfo = `Errors: ${errors.length}`
    if (files.length > 0) keyInfo += `${keyInfo ? ", " : ""}Changed: ${files.length} files`
  } else if (tool === "read") {
    // Extract file type, line count, symbols
    const symbols = lines.filter((l) => /^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var|def|struct|enum|trait|impl)\s+/m.test(l)).length
    keyInfo = `${totalLines} lines, ${symbols} symbols`
  } else if (tool === "grep") {
    const matchCount = lines.filter((l) => l.includes(":")).length
    const files = new Set(lines.map((l) => l.split(":")[0]).filter(Boolean))
    keyInfo = `${matchCount} matches in ${files.size} files`
  } else if (tool === "glob") {
    keyInfo = `${totalLines} files found`
  }

  return `[${totalLines} lines, ${Math.round(totalBytes / 1024)}KB${keyInfo ? `, ${keyInfo}` : ""}]`
}

// Offload content to temp file, return summary + pointer
export async function progressiveDisclosure(content: string, tool: string): Promise<{
  result: string
  offloaded: boolean
  entryId?: string
}> {
  const lines = content.split("\n")

  // Short content → inline
  if (lines.length <= MAX_INLINE_LINES && content.length <= MAX_INLINE_BYTES) {
    return { result: content, offloaded: false }
  }

  // Create summary
  const summary = createSummary(content, tool)

  // Offload full content to file
  await ensureDir()
  const id = generateId()
  const filePath = path.join(OFFLOAD_DIR, `${id}.txt`)

  try {
    await Bun.write(filePath, content)
  } catch {
    // If offload fails, fall back to head+tail
    const head = lines.slice(0, 50).join("\n")
    const tail = lines.slice(-20).join("\n")
    return {
      result: `${summary}\n\n${head}\n\n... ${lines.length - 70} lines omitted ...\n\n${tail}`,
      offloaded: false,
    }
  }

  const entry: OffloadEntry = {
    id,
    tool,
    summary,
    filePath,
    fullSize: content.length,
    fullLines: lines.length,
    timestamp: Date.now(),
  }
  offloadStore.set(id, entry)

  // Return summary + pointer
  return {
    result: `${summary}\nFull output offloaded. Use "opentoken fetch ${id}" to retrieve.`,
    offloaded: true,
    entryId: id,
  }
}

// Fetch offloaded content by ID
export async function fetchOffloaded(id: string): Promise<string | null> {
  const entry = offloadStore.get(id)
  if (!entry) return null

  try {
    return await Bun.file(entry.filePath).text()
  } catch {
    return null
  }
}

// Clean up old offloaded files (older than 1 hour)
export async function cleanupOffloaded(maxAgeMs = 3600000): Promise<number> {
  let cleaned = 0
  const now = Date.now()

  for (const [id, entry] of offloadStore.entries()) {
    if (now - entry.timestamp > maxAgeMs) {
      try {
        await Bun.file(entry.filePath).exists() && await Bun.$`rm -f ${entry.filePath}`.quiet()
      } catch {
        // Ignore
      }
      offloadStore.delete(id)
      cleaned++
    }
  }

  return cleaned
}

// Get offload stats
export function getOffloadStats(): { total: number; totalBytes: number } {
  let totalBytes = 0
  for (const entry of offloadStore.values()) {
    totalBytes += entry.fullSize
  }
  return { total: offloadStore.size, totalBytes }
}
