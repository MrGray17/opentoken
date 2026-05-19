// OpenToken — Token-saving companion for OpenCode
// 15-layer compression pipeline:
// L1:  Command rewrite (#3)
// L2:  Block minified files (#6)
// L3:  Size caps on write/edit (#7)
// L4:  Subagent budget (#5)
// L5:  Family-based bash filtering
// L6:  Read/grep/glob compression
// L7:  Binary detection (#16)
// L8:  Output suppression (#17)
// L9:  Strip thinking blocks (#15)
// L10: Whitespace/null cleanup (#21)
// L11: Key aliasing (#20)
// L12: Cross-call dedup (#25)
// L13: Progressive disclosure (#26)
// L14: Auto-escalation (#36)
// L15: Session memory + cache-lock (#38, #43)

import type { Plugin } from "@opencode-ai/plugin"
import { preCallFilter, rewriteCommand, isMinifiedOrGenerated } from "./precall"
import { postCallProcess, stripThinkingBlocks, detectAndHandleBinary, suppressOversized, aliasJsonKeys, cleanWhitespaceAndNulls } from "./postcall"
import { deduplicate, resetDedup } from "./dedup"
import { progressiveDisclosure, cleanupOffloaded } from "./progressive"
import { applyAutoEscalation, updateContext, getCompressionLevel, resetEscalation } from "./autoescalate"
import {
  loadSessionSummary,
  checkCacheLock,
  finalizeSession,
  trackFile,
  trackError,
  trackTestResult,
  trackGitEvent,
  trackToolCall,
  trackTokensSaved,
  getSessionTracker,
} from "./session"
import { detectFamily } from "./families/detect"
import { filterGitOutput } from "./families/git"
import { filterNpmOutput } from "./families/npm"
import { filterCargoOutput } from "./families/cargo"
import { filterTestOutput } from "./families/test"
import { filterFsOutput } from "./families/fs"
import { filterGeneric } from "./families/generic"
import { filterRead } from "./filters/read"
import { filterGrep } from "./filters/grep"
import { filterGlob } from "./filters/glob"
import { redactSecrets } from "./utils/secrets"
import { abbreviate } from "./utils/abbreviate"
import { estimateTokens } from "./utils/tokens"
import { recordMetric } from "./utils/metrics"
import { getCachedRead, setCachedRead } from "./utils/cache"

interface ToolInput {
  tool: string
  args: Record<string, unknown>
}

interface ToolOutput {
  result: string
  error?: string
  args?: Record<string, unknown>
}

const MAX_OUTPUT_LENGTH = 50000 // 50KB
const SHORT_OUTPUT_THRESHOLD = 200 // lines

function shouldSkipFilter(output: string): boolean {
  const lines = output.split("\n")
  return lines.length < SHORT_OUTPUT_THRESHOLD && output.length < MAX_OUTPUT_LENGTH
}

function hasErrors(output: string): boolean {
  const errorPatterns = [
    /error\[/i, /error:/i, /fatal:/i, /FAILED/i, /panic:/i,
    /traceback/i, /SyntaxError/i, /TypeError/i, /ReferenceError/i,
    /ENOENT/i, /EACCES/i, /EPERM/i, /MODULE_NOT_FOUND/i,
    /--- FAIL:/i, /assertion/i, /stack trace/i,
  ]
  return errorPatterns.some((p) => p.test(output))
}

function conservativeFilter(original: string, filtered: string): string {
  if (filtered.length >= original.length) return original
  return filtered
}

// ─── BASH FILTER PIPELINE ───
function applyBashFilter(command: string, output: string): string {
  // L0: Secret redaction (always first)
  output = redactSecrets(output)

  // L7: Binary detection
  const binary = detectAndHandleBinary(output)
  if (binary.binary) return binary.result

  // L8: Output suppression
  const suppressed = suppressOversized(output)
  if (suppressed.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = stripThinkingBlocks(output)

  // Short outputs pass through (after safety checks)
  if (shouldSkipFilter(output)) return output

  // L10: Whitespace/null cleanup
  output = cleanWhitespaceAndNulls(output)

  // L11: Key aliasing
  output = aliasJsonKeys(output)

  // L5: Family-based filtering
  const family = detectFamily(command)
  let filtered: string

  switch (family) {
    case "git":
      filtered = filterGitOutput(command, output)
      break
    case "npm":
      filtered = filterNpmOutput(command, output)
      break
    case "cargo":
      filtered = filterCargoOutput(command, output)
      break
    case "test":
      filtered = filterTestOutput(command, output)
      break
    case "fs":
      filtered = filterFsOutput(command, output)
      break
    default:
      filtered = filterGeneric(output)
  }

  // L14: Auto-escalation
  filtered = applyAutoEscalation(filtered)

  // Track errors
  if (hasErrors(output)) {
    trackError(filtered.slice(0, 200))
  }

  // Track git events
  if (family === "git") {
    trackGitEvent(command.slice(0, 50))
  }

  return conservativeFilter(output, filtered)
}

// ─── READ FILTER PIPELINE ───
async function applyReadFilter(filePath: string, content: string): Promise<string> {
  // L0: Secret redaction
  content = redactSecrets(content)

  // Track file access
  trackFile(filePath)

  // Check cache
  const cached = await getCachedRead(filePath)
  if (cached !== null) {
    return `[Cached read: ${filePath} — ${cached.split("\n").length} lines]`
  }

  // L7: Binary detection
  const binary = detectAndHandleBinary(content)
  if (binary.binary) return binary.result

  // L8: Output suppression
  const suppressed = suppressOversized(content)
  if (suppressed.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  content = stripThinkingBlocks(content)

  // Short files pass through
  if (shouldSkipFilter(content)) {
    await setCachedRead(filePath, content)
    return content
  }

  // L10: Whitespace/null cleanup
  content = cleanWhitespaceAndNulls(content)

  // L11: Key aliasing
  content = aliasJsonKeys(content)

  // L6: Read compression (outline for source files)
  let filtered = filterRead(filePath, content)

  // L13: Progressive disclosure
  const disclosed = await progressiveDisclosure(filtered, "read")
  filtered = disclosed.result

  // L14: Auto-escalation
  filtered = applyAutoEscalation(filtered)

  // Cache the original content
  await setCachedRead(filePath, content)

  return conservativeFilter(content, filtered)
}

// ─── GREP FILTER PIPELINE ───
async function applyGrepFilter(output: string): Promise<string> {
  // L0: Secret redaction
  output = redactSecrets(output)

  // L7: Binary detection
  const binary = detectAndHandleBinary(output)
  if (binary.binary) return binary.result

  // L8: Output suppression
  const suppressed = suppressOversized(output)
  if (suppressed.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = stripThinkingBlocks(output)

  // Short outputs pass through
  if (shouldSkipFilter(output)) return output

  // L10: Whitespace/null cleanup
  output = cleanWhitespaceAndNulls(output)

  // L6: Grep compression
  let filtered = filterGrep(output)

  // L13: Progressive disclosure
  const disclosed = await progressiveDisclosure(filtered, "grep")
  filtered = disclosed.result

  // L14: Auto-escalation
  filtered = applyAutoEscalation(filtered)

  return conservativeFilter(output, filtered)
}

// ─── GLOB FILTER PIPELINE ───
async function applyGlobFilter(output: string): Promise<string> {
  // L0: Secret redaction
  output = redactSecrets(output)

  // L8: Output suppression
  const suppressed = suppressOversized(output)
  if (suppressed.suppressed) return suppressed.result

  // L9: Strip thinking blocks
  output = stripThinkingBlocks(output)

  // Short outputs pass through
  if (shouldSkipFilter(output)) return output

  // L6: Glob compression
  let filtered = filterGlob(output)

  // L13: Progressive disclosure
  const disclosed = await progressiveDisclosure(filtered, "glob")
  filtered = disclosed.result

  // L14: Auto-escalation
  filtered = applyAutoEscalation(filtered)

  return conservativeFilter(output, filtered)
}

// ─── MAIN PLUGIN ───
export const OpenTokenPlugin: Plugin = async ({ directory }) => {
  // L38: Load previous session memory
  const prevSession = await loadSessionSummary(directory)

  return {
    // Session start — inject memory, reset state
    "session.created": async () => {
      resetDedup()
      resetEscalation()
      await cleanupOffloaded()

      // L43: Check cache-lock
      // (rules/config hashing would go here if opencode exposes them)
    },

    // Session end — save memory
    "session.deleted": async () => {
      await finalizeSession(directory)
    },

    "session.idle": async () => {
      await finalizeSession(directory)
    },

    // L1-L4: Pre-call interception
    "tool.execute.before": async (input: ToolInput, output: ToolOutput) => {
      const result = preCallFilter(input.tool, output.args || {})

      if (result.blocked) {
        // Block the tool call
        output.result = `[OpenToken blocked] ${result.reason}`
        output.error = result.reason
        return
      }

      if (result.modifiedArgs) {
        // Modify tool args (e.g., command rewrite)
        Object.assign(output.args, result.modifiedArgs)
      }
    },

    // L5-L15: Post-call interception
    "tool.execute.after": async (input: ToolInput, output: ToolOutput) => {
      if (!output.result) return

      const beforeTokens = estimateTokens(output.result)
      let filtered = output.result
      const tool = input.tool

      trackToolCall()

      switch (tool) {
        case "bash": {
          const command = String(output.args?.command || "")
          filtered = applyBashFilter(command, output.result)
          break
        }
        case "read": {
          const filePath = String(output.args?.filePath || "")
          filtered = await applyReadFilter(filePath, output.result)
          break
        }
        case "grep": {
          filtered = await applyGrepFilter(output.result)
          break
        }
        case "glob": {
          filtered = await applyGlobFilter(output.result)
          break
        }
        default:
          return // Don't touch other tools
      }

      // L12: Cross-call dedup
      const deduped = deduplicate(filtered, tool)
      filtered = deduped.result

      const afterTokens = estimateTokens(filtered)
      const saved = beforeTokens - afterTokens

      if (saved > 0) {
        trackTokensSaved(saved)

        // Update context tracking for auto-escalation
        updateContext(beforeTokens) // Approximate context used

        const family = tool === "bash" ? detectFamily(String(output.args?.command || "")) : tool

        await recordMetric({
          ts: new Date().toISOString(),
          tool,
          family,
          before_tokens: beforeTokens,
          after_tokens: afterTokens,
          saved_pct: Math.round((saved / beforeTokens) * 100),
        })
      }

      output.result = filtered
    },
  }
}

export default OpenTokenPlugin
