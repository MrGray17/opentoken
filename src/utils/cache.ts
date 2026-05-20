// Read cache — skip disk read if same file was read within TTL
// Uses mtime + size as cache key

import fs from "fs"

interface CacheEntry {
  content: string
  mtime: number
  size: number
  ts: number
}

const TTL_MS = 30_000 // 30 seconds
const MAX_CACHE_SIZE = 500 // LRU cap — evict oldest when exceeded
const cache = new Map<string, CacheEntry>()

function makeKey(filePath: string): string {
  return filePath
}

export function getCachedRead(filePath: string): string | null {
  const entry = cache.get(makeKey(filePath))
  if (!entry) return null

  const now = Date.now()
  if (now - entry.ts > TTL_MS) {
    cache.delete(makeKey(filePath))
    return null
  }

  // Verify file hasn't changed (use tolerance for floating point mtime)
  try {
    const stat = fs.statSync(filePath)
    if (Math.abs(stat.mtimeMs - entry.mtime) < 1 && stat.size === entry.size) {
      return entry.content
    }
  } catch {
    // File gone or inaccessible
  }

  cache.delete(makeKey(filePath))
  return null
}

export function setCachedRead(filePath: string, content: string): void {
  try {
    const stat = fs.statSync(filePath)
    // LRU eviction: remove oldest entry when cache is full
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value
      if (oldestKey) cache.delete(oldestKey)
    }
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
