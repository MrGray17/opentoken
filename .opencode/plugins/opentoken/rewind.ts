// Reversible Compression — inspired by claw-compactor's RewindStore
// Aggressively compress content but store originals in hash-addressed store
// LLM can retrieve any compressed section by its marker ID

import path from "path"
import os from "os"
import crypto from "crypto"

const REWIND_DIR = path.join(os.homedir(), ".config", "opentoken", "rewind")
const MAX_COMPRESSED_SIZE = 15 * 1024 // 15KB — compress anything larger
const MAX_REWIND_ENTRIES = 50 // Cap entries to prevent unbounded memory growth

interface RewindEntry {
  id: string
  original: string
  compressed: string
  marker: string
  timestamp: number
  size: number
  compressedSize: number
}

const rewindStore = new Map<string, RewindEntry>()
let rewindCounter = 0

// Generate a unique rewind ID
function generateId(): string {
  rewindCounter++
  const hash = crypto.createHash("md5").update(`${Date.now()}-${rewindCounter}`).digest("hex").slice(0, 8)
  return `rw-${hash}`
}

// Compress content and store original
export async function compressAndStore(content: string): Promise<{
  compressed: string
  marker: string
  entryId: string
  compressionRatio: number
}> {
  await ensureDir()

  const id = generateId()
  const marker = `[COMPRESSED:${id}]`

  // Store the original
  const entry: RewindEntry = {
    id,
    original: content,
    compressed: compressContent(content),
    marker,
    timestamp: Date.now(),
    size: content.length,
    compressedSize: 0,
  }

  try {
    await Bun.write(path.join(REWIND_DIR, `${id}.txt`), content)
  } catch {
    // Disk write failed — continue with in-memory only
  }

  // Calculate compressed size
  entry.compressedSize = entry.compressed.length
  rewindStore.set(id, entry)

  // Evict oldest entries if over capacity
  while (rewindStore.size > MAX_REWIND_ENTRIES) {
    const oldestKey = rewindStore.keys().next().value
    if (oldestKey) rewindStore.delete(oldestKey)
  }

  const compressionRatio = content.length > 0
    ? Math.round((1 - entry.compressedSize / content.length) * 100)
    : 0

  return {
    compressed: entry.compressed,
    marker,
    entryId: id,
    compressionRatio,
  }
}

// Compress content using head+tail extraction — preserves structure while dropping interior
function compressContent(content: string): string {
  const lines = content.split("\n")

  // Keep first 10 + last 5 lines, drop interior
  if (lines.length > 20) {
    const head = lines.slice(0, 10)
    const tail = lines.slice(-5)
    const skipped = lines.length - 15
    return `${head.join("\n")}\n\n... ${skipped} lines omitted (full content stored in rewind store) ...\n\n${tail.join("\n")}`
  }

  return content
}

// Apply reversible compression to content
export async function applyReversibleCompression(content: string): Promise<{
  result: string
  compressed: boolean
  entryId?: string
}> {
  if (content.length < MAX_COMPRESSED_SIZE) {
    return { result: content, compressed: false }
  }

  const { compressed, marker, entryId, compressionRatio } = await compressAndStore(content)

  return {
    result: `${marker} (${compressionRatio}% compressed, ${Math.round(content.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB)\n\n${compressed}\n\nUse "opentoken rewind ${entryId}" to retrieve full content.`,
    compressed: true,
    entryId,
  }
}

// Clean up old rewind entries
export async function cleanupRewind(maxAgeMs = 3600000): Promise<number> {
  let cleaned = 0
  const now = Date.now()

  for (const [id, entry] of rewindStore.entries()) {
    if (now - entry.timestamp > maxAgeMs) {
      try {
        const filePath = path.join(REWIND_DIR, `${id}.txt`)
        if (await Bun.file(filePath).exists()) {
          const proc = Bun.spawn(["rm", "-f", filePath])
          await proc.exited
        }
      } catch {
        // Ignore
      }
      rewindStore.delete(id)
      cleaned++
    }
  }

  return cleaned
}

async function ensureDir(): Promise<void> {
  try {
    const dirExists = await Bun.file(REWIND_DIR).exists()
    if (!dirExists) {
      const proc = Bun.spawn(["mkdir", "-p", REWIND_DIR])
      await proc.exited
    }
  } catch {
    // Ignore
  }
}
