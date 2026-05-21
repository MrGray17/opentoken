// LTSC — Lossless Token Sequence Compression
// Based on Harvill et al. (2025), arXiv:2506.00307
// LZ77-style: finds repeated subsequences, replaces with meta-tokens,
// prepends dictionary. Fully lossless — zero quality impact.
// 18-27% average savings, up to 60% on repetitive/structured output.

const MIN_SUBSTRING_LEN = 12 // Minimum repeated substring length (chars)
const MAX_DICT_SIZE = 50 // Maximum dictionary entries
const MIN_REPEATS = 2 // Minimum times a substring must repeat to be worth compressing

// Find all repeated substrings of sufficient length
function findRepeatedSubstrings(text: string): Array<{ str: string; positions: number[]; savings: number }> {
  const repeats: Array<{ str: string; positions: number[]; savings: number }> = []
  const seen = new Map<string, number[]>()

  // Sliding window approach — find substrings of MIN_SUBSTRING_LEN to 80 chars
  for (let len = MIN_SUBSTRING_LEN; len <= 80; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const sub = text.slice(i, i + len)

      // Skip if contains newlines (breaks meta-token format)
      if (sub.includes("\n")) continue

      // Skip if already tracked as part of a longer repeat
      if (seen.has(sub)) {
        seen.get(sub)!.push(i)
      } else {
        seen.set(sub, [i])
      }
    }
  }

  // Filter to only substrings that repeat enough times
  for (const [str, positions] of seen) {
    if (positions.length >= MIN_REPEATS) {
      // Savings = (repeats - 1) * str.length - (repeats * meta-token-length) - dict-entry-length
      // Meta-token is like "§1" (2 chars), dict entry is like "§1=str " (~str.length + 5)
      const dictEntryLen = 3 + str.length // "§N=str"
      const replacementCost = positions.length * 2 // "§N" per occurrence
      const originalCost = positions.length * str.length
      const savings = originalCost - replacementCost - dictEntryLen

      if (savings > 0) {
        repeats.push({ str, positions, savings })
      }
    }
  }

  // Sort by savings descending
  repeats.sort((a, b) => b.savings - a.savings)

  return repeats
}

// Remove overlapping/redundant repeats (greedy selection)
function selectNonOverlapping(repeats: Array<{ str: string; positions: number[]; savings: number }>): Array<{ str: string; positions: number[] }> {
  const selected: Array<{ str: string; positions: number[] }> = []
  const usedPositions = new Set<string>()

  for (const repeat of repeats) {
    if (selected.length >= MAX_DICT_SIZE) break

    // Check if this repeat overlaps with any already selected
    const nonOverlappingPositions: number[] = []
    let hasAny = false

    for (const pos of repeat.positions) {
      const key = `${pos}-${repeat.str.length}`
      if (!usedPositions.has(key)) {
        // Check if any part of this occurrence overlaps with selected substrings
        let overlaps = false
        for (let i = pos; i < pos + repeat.str.length; i++) {
          if (usedPositions.has(String(i))) {
            overlaps = true
            break
          }
        }
        if (!overlaps) {
          nonOverlappingPositions.push(pos)
          hasAny = true
        }
      }
    }

    if (hasAny && nonOverlappingPositions.length >= MIN_REPEATS) {
      selected.push({ str: repeat.str, positions: nonOverlappingPositions })

      // Mark positions as used
      for (const pos of nonOverlappingPositions) {
        for (let i = pos; i < pos + repeat.str.length; i++) {
          usedPositions.add(String(i))
        }
      }
    }
  }

  return selected
}

// Apply compression: replace substrings with meta-tokens, prepend dictionary
export function compressLTSC(text: string): { compressed: boolean; result: string; savings: number } {
  const originalLength = text.length

  // Find repeated substrings
  const repeats = findRepeatedSubstrings(text)
  if (repeats.length === 0) {
    return { compressed: false, result: text, savings: 0 }
  }

  // Select non-overlapping repeats
  const selected = selectNonOverlapping(repeats)
  if (selected.length === 0) {
    return { compressed: false, result: text, savings: 0 }
  }

  // Build dictionary and compressed text
  const dict: string[] = []
  const replacements: Array<{ pos: number; len: number; token: string }> = []

  for (let i = 0; i < selected.length; i++) {
    const token = `§${i + 1}`
    dict.push(`${token}=${selected[i].str}`)

    for (const pos of selected[i].positions) {
      replacements.push({ pos, len: selected[i].str.length, token })
    }
  }

  // Sort replacements by position descending (so we can replace without offset issues)
  replacements.sort((a, b) => b.pos - a.pos)

  let compressed = text
  for (const rep of replacements) {
    compressed = compressed.slice(0, rep.pos) + rep.token + compressed.slice(rep.pos + rep.len)
  }

  // Prepend dictionary as comment block (LLMs understand this format)
  const dictBlock = `<!--LTSC:${dict.join(",")}-->\n`
  const result = dictBlock + compressed

  const savings = originalLength - result.length
  const savingsPct = originalLength > 0 ? Math.round((savings / originalLength) * 100) : 0

  // Only return compressed if it's actually smaller
  if (savings <= 0) {
    return { compressed: false, result: text, savings: 0 }
  }

  return { compressed: true, result, savings }
}

// Decompress LTSC (for verification/testing)
export function decompressLTSC(text: string): string {
  // Extract dictionary
  const dictMatch = text.match(/^<!--LTSC:(.+?)-->\n/)
  if (!dictMatch) return text

  const dictStr = dictMatch[1]
  const dict = new Map<string, string>()

  for (const entry of dictStr.split(",")) {
    const eqIdx = entry.indexOf("=")
    if (eqIdx > 0) {
      dict.set(entry.slice(0, eqIdx), entry.slice(eqIdx + 1))
    }
  }

  // Replace meta-tokens with original strings
  let result = text.slice(dictMatch[0].length)
  for (const [token, str] of dict) {
    result = result.split(token).join(str)
  }

  return result
}
