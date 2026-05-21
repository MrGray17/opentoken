// History compression — compress conversation messages before sending to LLM
// Uses sliding window: keep recent messages full-fidelity, compress older ones
// MUST mutate in-place via splice (output.messages = newArray is a silent no-op)

import type { Message, Part } from "@opencode-ai/sdk"

interface HistoryConfig {
  window: number           // Messages to keep full-fidelity (default 12)
  maxCompressedTokens: number // Skip compression if estimated tokens below this
  summarizeToolResults: boolean // Extract content summaries vs just size
}

const DEFAULT_CONFIG: HistoryConfig = {
  window: 12,
  maxCompressedTokens: 3000,
  summarizeToolResults: true,
}

// Detect if OpenCode is currently compacting
function isCompacting(messages: { info: Message; parts: Part[] }[]): boolean {
  return messages.some(m =>
    m.parts.some(p => p.type === "compaction")
  )
}

// Fast token estimate (char × 0.25)
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25)
}

// Estimate total tokens across all messages
function estimateTotalTokens(messages: { info: Message; parts: Part[] }[]): number {
  let total = 0
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") total += estimateTokens((p as any).text ?? "")
      if (p.type === "reasoning") total += estimateTokens((p as any).text ?? "")
      if (p.type === "tool") {
        const state = (p as any).state
        if (state?.output) total += estimateTokens(state.output)
      }
    }
  }
  return total
}

// Extract a one-line summary from a read result
function summarizeReadResult(output: string): string {
  const lines = output.split("\n")
  const nonEmpty = lines.filter(l => l.trim().length > 0)

  // Look for function/class/export patterns
  const symbols = nonEmpty.filter(l =>
    /^(export\s+)?(function|class|const|let|var|interface|type|enum)\s+\w+/.test(l.trim())
  )

  if (symbols.length > 0) {
    const count = symbols.length
    const first = symbols.slice(0, 3).map(s => s.trim().slice(0, 60)).join(", ")
    return `${count} symbol${count > 1 ? "s" : ""}: ${first}${count > 3 ? "..." : ""}`
  }

  // Look for markdown headings
  const headings = nonEmpty.filter(l => /^#{1,3}\s+/.test(l.trim()))
  if (headings.length > 0) {
    const first = headings.slice(0, 2).map(h => h.trim().replace(/^#+\s+/, "")).join(" / ")
    return `sections: ${first}`
  }

  // Fallback: first meaningful line
  const firstMeaningful = nonEmpty.find(l => l.trim().length > 10)
  if (firstMeaningful) {
    return `starts: "${firstMeaningful.trim().slice(0, 80)}"`
  }

  return `${lines.length} lines`
}

// Extract summary from bash output
function summarizeBashOutput(command: string, output: string): string {
  const lines = output.split("\n")
  const nonEmpty = lines.filter(l => l.trim().length > 0)

  // Test output patterns
  const passMatch = output.match(/(\d+)\s+pass(?:ing)?/i)
  const failMatch = output.match(/(\d+)\s+fail(?:ed|ing)?/i)
  if (passMatch || failMatch) {
    const parts = []
    if (passMatch) parts.push(`${passMatch[1]} passing`)
    if (failMatch) parts.push(`${failMatch[1]} failed`)
    return `test: ${parts.join(", ")}`
  }

  // Git status
  if (command.startsWith("git status")) {
    const changed = nonEmpty.filter(l => /^\s*(modified|new file|deleted|renamed|added):/.test(l))
    if (changed.length > 0) {
      return `${changed.length} file${changed.length > 1 ? "s" : ""} changed`
    }
    return "clean working tree"
  }

  // Git diff
  if (command.startsWith("git diff")) {
    const hunkHeaders = nonEmpty.filter(l => l.startsWith("@@"))
    const files = nonEmpty.filter(l => l.startsWith("diff --git"))
    if (files.length > 0) {
      return `${files.length} file${files.length > 1 ? "s" : ""}, ${hunkHeaders.length} hunks`
    }
    return "no changes"
  }

  // NPM/Yarn/Bun install
  if (/^(npm|yarn|bun)\s+(install|add)/.test(command)) {
    const added = output.match(/added\s+(\d+)/i)
    const changed = output.match(/changed\s+(\d+)/i)
    const parts = []
    if (added) parts.push(`+${added[1]}`)
    if (changed) parts.push(`~${changed[1]}`)
    return parts.length > 0 ? `install: ${parts.join(", ")}` : "install complete"
  }

  // Build output (make, cargo build, tsc)
  if (/^(make|cargo build|tsc|npx tsc)/.test(command)) {
    const errors = nonEmpty.filter(l => /error/i.test(l))
    const warnings = nonEmpty.filter(l => /warn(?:ing)?/i.test(l))
    const parts = []
    if (errors.length > 0) parts.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`)
    if (warnings.length > 0) parts.push(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`)
    return parts.length > 0 ? `build: ${parts.join(", ")}` : "build success"
  }

  // ls / find / tree
  if (/^(ls|find|tree)/.test(command)) {
    return `${nonEmpty.length} entries`
  }

  // Fallback: last few lines
  const lastLines = nonEmpty.slice(-3).map(l => l.trim().slice(0, 60))
  if (lastLines.length > 0) {
    return `output: ${lastLines.join(" | ")}`
  }

  return `${lines.length} lines`
}

// Compress a single tool part
function compressToolPart(part: Part, config: HistoryConfig): string | null {
  if (part.type !== "tool") return null

  const toolPart = part as any
  const toolName = toolPart.tool || "unknown"
  const state = toolPart.state as any

  // Keep errors and in-progress tools
  if (!state || state.status === "error" || state.status === "running" || state.status === "pending") return null

  // Output lives on state, not metadata (SDK ToolStateCompleted.output)
  const output = state.output ?? ""
  if (typeof output !== "string" || output.length === 0) return null

  if (!config.summarizeToolResults) {
    return `[${toolName}: ${estimateTokens(output)} tokens]`
  }

  // Command-specific summaries
  if (toolName === "read") {
    const filePath = (state.input as any)?.filePath ?? "unknown"
    const summary = summarizeReadResult(output)
    return `[read: ${filePath} — ${summary}, ${estimateTokens(output)} tokens]`
  }

  if (toolName === "bash") {
    const command = String((state.input as any)?.command ?? "")
    const summary = summarizeBashOutput(command, output)
    return `[bash: ${summary}, ${estimateTokens(output)} tokens]`
  }

  if (toolName === "grep") {
    const matches = output.split("\n").filter((l: string) => l.trim().length > 0).length
    return `[grep: ${matches} matches, ${estimateTokens(output)} tokens]`
  }

  if (toolName === "glob") {
    const matches = output.split("\n").filter((l: string) => l.trim().length > 0).length
    return `[glob: ${matches} files, ${estimateTokens(output)} tokens]`
  }

  // Generic tool summary
  return `[${toolName}: ${estimateTokens(output)} tokens]`
}

// Compress reasoning parts
function compressReasoningPart(part: Part): string | null {
  if (part.type !== "reasoning") return null
  const rp = part as any
  const text = rp.text || ""
  if (text.length === 0) return null
  return `[reasoning: ${estimateTokens(text)} tokens]`
}

// Compress text parts (assistant responses)
function compressTextPart(part: Part): string | null {
  if (part.type !== "text") return null
  const tp = part as any
  const text = tp.text || ""
  if (text.length === 0) return null
  if (tp.synthetic) return null // Keep synthetic messages

  // Short responses pass through
  if (text.length < 200) return null

  // Extract key information: decisions, file paths, action items
  const lines = text.split("\n")
  const important = lines.filter((l: string) =>
    l.includes("```") ||
    l.includes("file:") ||
    l.includes("decision") ||
    l.includes("TODO") ||
    l.match(/^#{1,3}\s/) ||
    l.match(/^- \[[ x]\]/)
  )

  if (important.length > 0) {
    const summary = important.slice(0, 5).map((l: string) => l.trim()).join("\n")
    return `[response summary (${estimateTokens(text)} tokens):\n${summary}]`
  }

  return `[response: ${estimateTokens(text)} tokens]`
}

// Compress a single message's parts
function compressMessageParts(parts: Part[], config: HistoryConfig): Part[] {
  const compressed: Part[] = []

  for (const part of parts) {
    // Never compress these part types
    if (part.type === "step-start" || part.type === "step-finish" ||
        part.type === "file" || part.type === "compaction" ||
        part.type === "snapshot" || part.type === "patch") {
      compressed.push(part)
      continue
    }

    if (part.type === "tool") {
      const summary = compressToolPart(part, config)
      if (summary) {
        compressed.push({
          ...part,
          type: "text",
          text: summary,
        } as any)
      } else {
        compressed.push(part)
      }
      continue
    }

    if (part.type === "reasoning") {
      const summary = compressReasoningPart(part)
      if (summary) {
        compressed.push({
          ...part,
          type: "text",
          text: summary,
        } as any)
      } else {
        compressed.push(part)
      }
      continue
    }

    if (part.type === "text") {
      const summary = compressTextPart(part)
      if (summary) {
        compressed.push({
          ...part,
          text: summary,
        } as any)
      } else {
        compressed.push(part)
      }
      continue
    }

    // Unknown part types pass through
    compressed.push(part)
  }

  return compressed
}

// Collapse consecutive compressed tool results into a single summary
function collapseConsecutiveTools(parts: Part[]): Part[] {
  const result: Part[] = []
  let toolSummaries: string[] = []

  function flushTools() {
    if (toolSummaries.length === 1) {
      result.push({
        id: "collapsed",
        sessionID: "",
        messageID: "",
        type: "text",
        text: toolSummaries[0],
      } as any)
    } else if (toolSummaries.length > 1) {
      result.push({
        id: "collapsed",
        sessionID: "",
        messageID: "",
        type: "text",
        text: `[${toolSummaries.length} tool results: ${toolSummaries.join("; ")}]`,
      } as any)
    }
    toolSummaries = []
  }

  for (const part of parts) {
    const tp = part as any
    if (tp.type === "text" && tp.text?.startsWith("[")) {
      toolSummaries.push(tp.text)
    } else {
      flushTools()
      result.push(part)
    }
  }

  flushTools()
  return result
}

// Main compression function — mutates messages array in-place via splice
export function compressMessagesInPlace(
  messages: { info: Message; parts: Part[] }[],
  userConfig?: Partial<HistoryConfig>
): void {
  const config = { ...DEFAULT_CONFIG, ...userConfig }

  // Skip if compacting (let native compaction handle it)
  if (isCompacting(messages)) return

  // Skip if too few messages
  if (messages.length <= config.window + 1) return

  // Skip if total tokens are low
  if (estimateTotalTokens(messages) < config.maxCompressedTokens) return

  // Determine which messages to compress (everything except the last N)
  const compressUpTo = messages.length - config.window

  // Compress messages in-place
  for (let i = 0; i < compressUpTo; i++) {
    const msg = messages[i]

    // Never compress user messages
    if (msg.info.role === "user") continue

    // Compress parts
    const compressedParts = compressMessageParts(msg.parts, config)
    const collapsedParts = collapseConsecutiveTools(compressedParts)

    // Replace parts in-place
    msg.parts.splice(0, msg.parts.length, ...collapsedParts)
  }
}

// Check if compression should be applied
export function shouldCompress(
  messages: { info: Message; parts: Part[] }[],
  window: number = 12
): boolean {
  if (isCompacting(messages)) return false
  if (messages.length <= window + 1) return false
  if (estimateTotalTokens(messages) < 3000) return false
  return true
}

// Get compression stats for a message array
export function getCompressionStats(
  messages: { info: Message; parts: Part[] }[],
  window: number = 12
): { before: number; after: number; saved: number; pct: number } {
  const before = estimateTotalTokens(messages)

  // Clone for estimation
  const clone = messages.map(m => ({
    info: { ...m.info },
    parts: m.parts.map(p => ({ ...p })),
  }))

  compressMessagesInPlace(clone, { window })
  const after = estimateTotalTokens(clone)

  return {
    before,
    after,
    saved: before - after,
    pct: before > 0 ? Math.round((1 - after / before) * 100) : 0,
  }
}
