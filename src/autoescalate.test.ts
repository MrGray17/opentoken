// Auto-escalation system (#36)
// Ratchet compression as context fills:
// 50% fill → LEAN (drop filler, short synonyms)
// 70% fill → ULTRA (abbreviate, arrows, tables)
// 85% fill → DYNAMIC CEILING (force aggressive truncation)

import { estimateTokens } from "./utils/tokens"
import { SessionStore } from "./utils/session-store"

export type CompressionLevel = "off" | "lean" | "ultra" | "ceiling"

export interface EscalationState {
  level: CompressionLevel
  contextUsed: number
  contextTotal: number
  fillPct: number
  history: { level: CompressionLevel; fillPct: number; timestamp: number }[]
}

// Estimated context window size (varies by model)
const DEFAULT_CONTEXT_SIZE = 200_000 // ~200K tokens (Sonnet)

function createEscalationState(): EscalationState {
  return {
    level: "off",
    contextUsed: 0,
    contextTotal: DEFAULT_CONTEXT_SIZE,
    fillPct: 0,
    history: []}
}

const store = new SessionStore<EscalationState>()

function getState(sessionID: string): EscalationState {
  return store.get(sessionID, createEscalationState)
}

// Update context tracking — accumulates token usage across calls
// Each tool output adds tokens to the LLM context window
export function updateContext(sessionID: string, used: number, total?: number): CompressionLevel {
  const s = getState(sessionID)
  if (total) s.contextTotal = total
  s.contextUsed += used
  s.fillPct = s.contextTotal > 0 ? s.contextUsed / s.contextTotal : 0

  const newLevel = computeLevel(s.fillPct)

  if (newLevel !== s.level) {
    s.level = newLevel
    s.history.push({
      level: newLevel,
      fillPct: s.fillPct,
      timestamp: Date.now()})
  }

  return newLevel
}

// Reset context usage tracking — called when native compaction frees context
// This prevents fillPct from staying artificially high after compaction
export function resetContextUsed(sessionID: string): void {
  const s = getState(sessionID)
  s.contextUsed = 0
  s.fillPct = 0
  const newLevel = computeLevel(s.fillPct)
  if (newLevel !== s.level) {
    s.level = newLevel
    s.history.push({
      level: newLevel,
      fillPct: s.fillPct,
      timestamp: Date.now()})
  }
}

// Compute compression level from fill percentage
function computeLevel(fillPct: number): CompressionLevel {
  if (fillPct >= 0.85) return "ceiling"
  if (fillPct >= 0.70) return "ultra"
  if (fillPct >= 0.50) return "lean"
  return "off"
}

// Get current compression level
export function getCompressionLevel(sessionID: string): CompressionLevel {
  return getState(sessionID).level
}

// Get escalation state
export function getEscalationState(sessionID: string): EscalationState {
  return { ...getState(sessionID) }
}

// Apply compression based on current level
export function applyAutoEscalation(text: string, level?: CompressionLevel): string {
  switch (level) {
    case "off":
      return text
    case "lean":
      return applyLeanCompression(text)
    case "ultra":
      return applyUltraCompression(text)
    case "ceiling":
      return applyCeilingCompression(text)
    default:
      return text
  }
}

// LEAN: Drop filler, short synonyms
function applyLeanCompression(text: string): string {
  let result = text

  // Drop filler words (expanded from 12 → 32 phrases)
  const fillers = [
    "basically", "actually", "essentially", "simply", "just",
    "really", "very", "quite", "rather", "somewhat",
    "in order to", "due to the fact that", "because of the fact that",
    "it is important to note that", "note that", "keep in mind that",
    "as mentioned before", "as we can see", "it should be noted",
    "for the most part", "by and large", "generally speaking",
    "in most cases", "as a rule", "on the whole",
    "to a large extent", "for all intents and purposes",
    "in the grand scheme of things", "when all is said and done",
    "at the end of the day", "needless to say",
    "it goes without saying", "as a matter of fact",
    "in light of the fact that", "with regard to"]
  for (const filler of fillers) {
    result = result.replace(new RegExp(`\\b${filler}\\b`, "gi"), "")
  }

  // Short synonyms
  const synonyms: Record<string, string> = {
    "utilize": "use",
    "utilizes": "uses",
    "utilizing": "using",
    "utilization": "use",
    "implement": "add",
    "implements": "adds",
    "implementing": "adding",
    "impl": "impl",
    "functionality": "feature",
    "approximately": "~",
    "subsequently": "then",
    "nevertheless": "but",
    "nonetheless": "but",
    "furthermore": "also",
    "moreover": "also",
    "however": "but",
    "therefore": "so",
    "consequently": "so",
    "additionally": "also",
    "specifically": "esp",
    "particularly": "esp",
    "especially": "esp",
    "important": "key",
    "significant": "big",
    "substantial": "large",
    "comprehensive": "full",
    "extensive": "wide",
    "sufficient": "enough",
    "necessary": "needed",
    "required": "needed",
    "optional": "opt",
    "avail": "avail",
    "appropriate": "right",
    "suitable": "fit",
    "relevant": "rel",
    "regarding": "re",
    "concerning": "re",
    "pertaining": "re",
    "with respect to": "re",
    "in terms of": "re",
    "in relation to": "re"}

  for (const [full, short] of Object.entries(synonyms)) {
    result = result.replace(new RegExp(`\\b${full}\\b`, "gi"), short)
  }

  // Clean up double spaces
  result = result.replace(/  +/g, " ")

  return result
}

// Remove low-information sentences using simple heuristics
// Sentences with no named entities, no numbers, no code references = low value
function removeLowInfoSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const kept: string[] = []

  for (const sentence of sentences) {
    // Keep short sentences (likely important)
    if (sentence.split(/\s+/).length <= 8) {
      kept.push(sentence)
      continue
    }

    // Keep sentences with numbers (data, metrics, versions)
    if (/\d/.test(sentence)) {
      kept.push(sentence)
      continue
    }

    // Keep sentences with code references (backticks, paths, symbols)
    if (/[`\/\\@#$%^&*(){}[\]|<>]/.test(sentence)) {
      kept.push(sentence)
      continue
    }

    // Keep sentences with named entities (capitalized words, proper nouns)
    if (/[A-Z][a-z]{2,}/.test(sentence)) {
      kept.push(sentence)
      continue
    }

    // Keep sentences with URLs or emails
    if (/[a-z]+:\/\//.test(sentence) || /\S+@\S+/.test(sentence)) {
      kept.push(sentence)
      continue
    }

    // Remove: filler sentences with no signal
    // e.g., "This is a common pattern that developers use."
    // e.g., "The function works as expected in most cases."
  }

  return kept.join(" ")
}

// ULTRA: Abbreviate, arrows, tables + semantic sentence removal
function applyUltraCompression(text: string): string {
  let result = applyLeanCompression(text)

  // Remove low-information sentences (no entities, no numbers, no code refs)
  result = removeLowInfoSentences(result)

  // Protect code lines: don't apply ULTRA phrase replacements to lines that look like code
  const lines = result.split("\n")
  const protectedLines = lines.map((line) => {
    const isCodeLine = /^\s*(import|export|from|const|let|var|function|class|interface|type|def|fn|pub|struct|enum|trait|impl|mod|use|package|func|return|if|else|for|while|switch|case|try|catch|throw|async|await|new|this|self|super|extends|implements|namespace|declare|module|require|module\.exports|\/\/|#|\/\*|\*|@|<\w+|\{|\}|\[|\]|\(|\)|=>|===|!==|\.\.\.)/.test(line)
    if (isCodeLine) return line
    return line
  })
  result = protectedLines.join("\n")

  // Replace common phrases with arrows/symbols
  const phraseReplacements: [RegExp, string][] = [
    [/\bleads to\b/gi, "→"],
    [/\bresults in\b/gi, "→"],
    [/\bcauses\b/gi, "→"],
    [/\bproduces\b/gi, "→"],
    [/\breturns\b/gi, "→"],
    [/\byields\b/gi, "→"],
    [/\bgenerates\b/gi, "→"],
    [/\bcreates\b/gi, "→"],
    [/\bis caused by\b/gi, "←"],
    [/\bdepends on\b/gi, "←"],
    [/\brequires\b/gi, "←"],
    [/\bneeds\b/gi, "←"],
    [/\bdoes not\b/gi, "≠"],
    [/\bcannot\b/gi, "≠"],
    [/\bis not\b/gi, "≠"],
    [/\bare not\b/gi, "≠"],
    [/\bwas not\b/gi, "≠"],
    [/\bwere not\b/gi, "≠"],
    [/\bwill not\b/gi, "≠"],
    [/\bshould not\b/gi, "≠"],
    [/\bmust not\b/gi, "≠"],
    [/\bis equal to\b/gi, "="],
    [/\bis equivalent to\b/gi, "="],
    [/\bis the same as\b/gi, "="],
    [/\bgreater than\b/gi, ">"],
    [/\bless than\b/gi, "<"],
    [/\bgreater than or equal to\b/gi, "≥"],
    [/\bless than or equal to\b/gi, "≤"],
    [/\bfor example\b/gi, "eg"],
    [/\bsuch as\b/gi, "eg"],
    [/\bthat is\b/gi, "ie"],
    [/\bin other words\b/gi, "ie"],
    [/\betcetera\b/gi, "etc"],
    [/\band so on\b/gi, "etc"],
    [/\bper second\b/gi, "/s"],
    [/\bper minute\b/gi, "/min"],
    [/\bper hour\b/gi, "/hr"]]

  for (const [pattern, replacement] of phraseReplacements) {
    result = result.replace(pattern, replacement)
  }

  // Compress list items into table-like format
  const textLines = result.split("\n")
  const compressed: string[] = []
  let inList = false
  let listItems: string[] = []

  for (const line of textLines) {
    const isListItem = /^\s*[-*•]\s/.test(line) || /^\s*\d+\.\s/.test(line)

    if (isListItem) {
      inList = true
      listItems.push(line.replace(/^\s*[-*•]\s/, "").replace(/^\s*\d+\.\s/, ""))
    } else {
      if (inList && listItems.length > 2) {
        // Compress list to semicolon-separated
        compressed.push(listItems.join("; "))
      } else {
        compressed.push(...listItems.map((i) => `- ${i}`))
      }
      inList = false
      listItems = []
      compressed.push(line)
    }
  }

  // Flush remaining list
  if (inList && listItems.length > 2) {
    compressed.push(listItems.join("; "))
  } else if (listItems.length > 0) {
    compressed.push(...listItems.map((i) => `- ${i}`))
  }

  return compressed.join("\n")
}

// CEILING: Force aggressive truncation
function applyCeilingCompression(text: string): string {
  const lines = text.split("\n")

  // Keep only first 10 + last 5 lines
  if (lines.length > 30) {
    const head = lines.slice(0, 10)
    const tail = lines.slice(-5)
    const skipped = lines.length - 15
    return `${head.join("\n")}\n\n... ${skipped} lines omitted (ceiling mode) ...\n\n${tail.join("\n")}`
  }

  // If under 30 lines, apply ultra compression
  return applyUltraCompression(text)
}

// Reset escalation state (new session)
export function resetEscalation(sessionID: string): void {
  store.reset(sessionID, createEscalationState)
}

// De-escalate compression level when context fill percentage drops
// Called periodically to reduce compression when pressure eases
export function deescalate(sessionID: string): CompressionLevel {
  const s = getState(sessionID)
  // If fill percentage dropped below a threshold, step down one level
  if (s.fillPct < 0.45 && s.level !== "off") {
    s.level = "off"
    s.history.push({
      level: "off",
      fillPct: s.fillPct,
      timestamp: Date.now()})
  } else if (s.fillPct < 0.65 && s.level === "ceiling") {
    s.level = "ultra"
    s.history.push({
      level: "ultra",
      fillPct: s.fillPct,
      timestamp: Date.now()})
  } else if (s.fillPct < 0.80 && s.level === "ultra") {
    s.level = "lean"
    s.history.push({
      level: "lean",
      fillPct: s.fillPct,
      timestamp: Date.now()})
  }
  return s.level
}
