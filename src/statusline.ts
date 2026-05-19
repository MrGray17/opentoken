// Cute aesthetic status line — shows token savings in conversation
// Injected after filtered outputs when savings are significant

interface StatusLine {
  text: string
  tokens: number
}

// Cute emoji sets for variety
const EMOJI_SETS = [
  { primary: "✨", secondary: "🌸", tertiary: "💫" },
  { primary: "🌟", secondary: "🍃", tertiary: "✨" },
  { primary: "💎", secondary: "🌿", tertiary: "🌸" },
  { primary: "🦋", secondary: "✨", tertiary: "🌙" },
  { primary: "🌺", secondary: "💫", tertiary: "🍀" },
  { primary: "🌸", secondary: "✨", tertiary: "🌟" },
  { primary: "🍃", secondary: "💎", tertiary: "🌸" },
  { primary: "🌙", secondary: "🦋", tertiary: "✨" },
]

let emojiIndex = 0
let callCount = 0

function getEmojis() {
  const set = EMOJI_SETS[emojiIndex % EMOJI_SETS.length]
  emojiIndex++
  return set
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return `${tokens}`
}

// Cute messages based on savings level
function getCuteMessage(savedPct: number, savedTokens: number, sessionTotal: number): string {
  const emojis = getEmojis()

  if (savedPct >= 90) {
    return `${emojis.primary} opentoken saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — session total: ${formatTokens(sessionTotal)}`
  }
  if (savedPct >= 70) {
    return `${emojis.primary}${emojis.secondary} saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`
  }
  if (savedPct >= 50) {
    return `${emojis.primary} trimmed ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`
  }
  if (savedPct >= 30) {
    return `${emojis.secondary} saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`
  }
  return `${emojis.tertiary} saved ${formatTokens(savedTokens)} tokens — total: ${formatTokens(sessionTotal)}`
}

// Generate status line
export function generateStatusLine(savedTokens: number, totalBefore: number, sessionTotal: number): StatusLine | null {
  callCount++

  // Only show every 3rd call to avoid spam
  if (callCount % 3 !== 0) return null

  // Only show if saved > 100 tokens
  if (savedTokens < 100) return null

  const savedPct = totalBefore > 0 ? Math.round((savedTokens / totalBefore) * 100) : 0

  return {
    text: `\n\n${getCuteMessage(savedPct, savedTokens, sessionTotal)}`,
    tokens: 15, // Approximate token cost of the status line itself
  }
}

// Generate session summary status line
export function generateSessionSummary(sessionTotal: number, toolCalls: number): string {
  const emojis = getEmojis()
  const avgSaved = toolCalls > 0 ? Math.round(sessionTotal / toolCalls) : 0

  return `${emojis.primary}${emojis.secondary}${emojis.tertiary} opentoken session summary: saved ${formatTokens(sessionTotal)} tokens across ${toolCalls} calls (avg ${formatTokens(avgSaved)}/call)`
}

// Reset status line state (new session)
export function resetStatusLine(): void {
  emojiIndex = 0
  callCount = 0
}
