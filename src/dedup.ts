// Cross-call deduplication engine (#25)
// Same output within N calls → collapse to single reference line
// Uses content hashing + similarity detection
// Session-keyed to prevent cross-session dedup corruption

import { SessionStore } from "./utils/session-store"

interface DedupEntry {
  hash: string
  content: string
  tool: string
  callNumber: number
  timestamp: number
}

interface DedupState {
  recentCalls: DedupEntry[]
  callCounter: number
}

const DEDUP_WINDOW = 16 // Number of recent calls to check against
const SIMILARITY_THRESHOLD = 0.85 // 85% similarity = duplicate

function createDedupState(): DedupState {
  return { recentCalls: [], callCounter: 0 }
}

const store = new SessionStore<DedupState>()

function getState(sessionID: string): DedupState {
  return store.get(sessionID, createDedupState)
}

// Simple hash for content dedup
function hashContent(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// Jaccard similarity for fuzzy matching — samples words to avoid huge Sets
function jaccardSimilarity(a: string, b: string): number {
  const MAX_WORDS = 500
  const wordsA = a.toLowerCase().split(/\s+/)
  const wordsB = b.toLowerCase().split(/\s+/)

  const sampleA = wordsA.length > MAX_WORDS
    ? wordsA.filter((_, i) => i % Math.ceil(wordsA.length / MAX_WORDS) === 0)
    : wordsA
  const sampleB = wordsB.length > MAX_WORDS
    ? wordsB.filter((_, i) => i % Math.ceil(wordsB.length / MAX_WORDS) === 0)
    : wordsB

  const setA = new Set(sampleA)
  const setB = new Set(sampleB)

  let intersection = 0
  for (const w of setA) {
    if (setB.has(w)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

// Check if content is similar to any recent call
function findSimilarEntry(state: DedupState, content: string, tool: string): DedupEntry | null {
  const currentHash = hashContent(content)

  for (const entry of state.recentCalls) {
    // Exact hash match
    if (entry.hash === currentHash && entry.tool === tool) {
      return entry
    }

    // Fuzzy similarity check (for slightly different outputs)
    if (entry.tool === tool && content.length > 100 && entry.content.length > 100) {
      const similarity = jaccardSimilarity(content, entry.content)
      if (similarity >= SIMILARITY_THRESHOLD) {
        return entry
      }
    }
  }

  return null
}

// Record a call for future dedup checks
function recordCall(state: DedupState, content: string, tool: string): void {
  state.callCounter++
  const entry: DedupEntry = {
    hash: hashContent(content),
    content: content,
    tool,
    callNumber: state.callCounter,
    timestamp: Date.now()}

  state.recentCalls.push(entry)

  // Trim to window size
  if (state.recentCalls.length > DEDUP_WINDOW) {
    state.recentCalls.splice(0, state.recentCalls.length - DEDUP_WINDOW)
  }
}

// Main dedup function
export function deduplicate(sessionID: string, content: string, tool: string): { result: string; deduped: boolean } {
  const state = getState(sessionID)
  const similar = findSimilarEntry(state, content, tool)

  if (similar) {
    // Return reference instead of full content
    return {
      deduped: true,
      result: `[Duplicate of call #${similar.callNumber} (${similar.tool}) — see earlier result]`}
  }

  // Record this call
  recordCall(state, content, tool)

  return { deduped: false, result: content }
}

// Reset dedup state (new session)
export function resetDedup(sessionID: string): void {
  store.reset(sessionID, createDedupState)
}
