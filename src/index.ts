import type { Plugin } from "@opencode-ai/plugin"
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
import { abbreviate, ABBREVIATION_INSTRUCTION } from "./utils/abbreviate"
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
}

const MAX_OUTPUT_LENGTH = 50000 // 50KB — outputs longer than this are always filtered
const SHORT_OUTPUT_THRESHOLD = 200 // lines — outputs shorter than this pass through

function shouldSkipFilter(output: string): boolean {
  const lines = output.split("\n")
  return lines.length < SHORT_OUTPUT_THRESHOLD && output.length < MAX_OUTPUT_LENGTH
}

function hasErrors(output: string): boolean {
  const errorPatterns = [
    /error\[/i,
    /error:/i,
    /fatal:/i,
    /FAILED/i,
    /panic:/i,
    /traceback/i,
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /ENOENT/i,
    /EACCES/i,
    /EPERM/i,
    /MODULE_NOT_FOUND/i,
    /--- FAIL:/i,
    /assertion/i,
    /stack trace/i,
  ]
  return errorPatterns.some((p) => p.test(output))
}

function conservativeFilter(original: string, filtered: string): string {
  // If filter made it worse or same size, return original
  if (filtered.length >= original.length) {
    return original
  }
  return filtered
}

function applyBashFilter(command: string, output: string): string {
  // Always redact secrets first
  output = redactSecrets(output)

  // Short outputs pass through
  if (shouldSkipFilter(output)) return output

  // Errors are preserved in full
  const hasErr = hasErrors(output)

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

  // Optionally apply abbreviations to narrative text
  // (skip if output is mostly code)
  const codeRatio = (output.match(/```/g) || []).length
  if (codeRatio < 2 && !hasErr) {
    filtered = abbreviate(filtered)
  }

  return conservativeFilter(output, filtered)
}

function applyReadFilter(filePath: string, content: string): string {
  content = redactSecrets(content)

  if (shouldSkipFilter(content)) return content

  return filterRead(filePath, content)
}

function applyGrepFilter(output: string): string {
  output = redactSecrets(output)

  if (shouldSkipFilter(output)) return output

  return filterGrep(output)
}

function applyGlobFilter(output: string): string {
  output = redactSecrets(output)

  if (shouldSkipFilter(output)) return output

  return filterGlob(output)
}

export const OpenTokenPlugin: Plugin = async () => {
  return {
    // Inject abbreviation instruction at session start
    "session.created": async () => {
      // Could inject system prompt here if opencode supports it
    },

    // Intercept tool results after execution
    "tool.execute.after": async (input: ToolInput, output: ToolOutput) => {
      if (!output.result) return

      const beforeTokens = estimateTokens(output.result)
      let filtered = output.result
      const tool = input.tool

      switch (tool) {
        case "bash": {
          const command = String(output.args?.command || "")
          filtered = applyBashFilter(command, output.result)
          break
        }
        case "read": {
          const filePath = String(output.args?.filePath || "")
          filtered = applyReadFilter(filePath, output.result)
          break
        }
        case "grep": {
          filtered = applyGrepFilter(output.result)
          break
        }
        case "glob": {
          filtered = applyGlobFilter(output.result)
          break
        }
        default:
          return // Don't touch other tools
      }

      const afterTokens = estimateTokens(filtered)

      // Record metrics if we saved tokens
      if (afterTokens < beforeTokens) {
        const savedPct = Math.round(((beforeTokens - afterTokens) / beforeTokens) * 100)
        const family = tool === "bash" ? detectFamily(String(output.args?.command || "")) : tool

        await recordMetric({
          ts: new Date().toISOString(),
          tool,
          family,
          before_tokens: beforeTokens,
          after_tokens: afterTokens,
          saved_pct: savedPct,
        })
      }

      output.result = filtered
    },
  }
}

export default OpenTokenPlugin
