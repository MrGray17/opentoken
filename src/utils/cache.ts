// Read cache — skip disk read if same file was read within TTL
// Uses mtime + size as cache key

interface CacheEntry {
  content: string
  mtime: number
  size: number
  ts: number
}

const TTL_MS = 30_000 // 30 seconds
const cache = new Map<string, CacheEntry>()

function makeKey(filePath: string): string {
  return filePath
}

export async function getCachedRead(filePath: string): Promise<string | null> {
  const entry = cache.get(makeKey(filePath))
  if (!entry) return null

  const now = Date.now()
  if (now - entry.ts > TTL_MS) {
    cache.delete(makeKey(filePath))
    return null
  }

  // Verify file hasn
  try {
    const stat = await Bun.file(filePath).stat()
    if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
      return entry.content
    }
  } catch {
    // File gone or inaccessible
  }

  cache.delete(makeKey(filePath))
  return null
}

export async function setCachedRead(filePath: string, content: string): Promise<void> {
  try {
    const stat = await Bun.file(filePath).stat()
    cache.set(makeKey(filePath), {
      content,
      mtime: stat.mtimeMs,
      size: stat.size,
      ts: Date.now(),
    })
  } catch {
    // Can't stat, don't cache
  }
}

export function clearCache(): void {
  cache.clear()
}
