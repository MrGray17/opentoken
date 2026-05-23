// OpenToken — Token-saving companion for OpenCode
// Production-grade compression pipeline for tool outputs

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import path from "path"
import os from "os"
import fs from "fs"

// Phase 1 imports
import { preCallFilter } from "./precall"
import { stripThinkingBlocks, detectAndHandleBinary, suppressOversized, aliasJsonKeys, cleanWhitespaceAndNulls, shortenUrls, stripBase64Content, normalizeWhitespace, normalizeLogNoise, minimizeTableWhitespace, minifyJSON, stripAnsi } from "./postcall"
import { convertToTOON } from "./toon"
import { compressLTSC } from "./ltsc"
import { compressLZW } from "./lzw"
import { deduplicate, resetDedup } from "./dedup"
import { progressiveDisclosure, cleanupOffloaded } from "./progressive"
import { applyAutoEscalation, deescalate, updateContext, getCompressionLevel, resetEscalation, resetContextUsed } from "./autoescalate"
import {
  loadSessionSummary,
  finalizeSession,
  trackFile,
  trackError,
  trackGitEvent,
  trackToolCall,
  trackTokensSaved,
  getSessionTracker,
  writeSessionState,
  resetSessionTracker,
} from "./session"
import { detectFamily } from "./families/detect"
import { filterGitOutput } from "./families/git"
import { filterNpmOutput } from "./families/npm"
import { filterCargoOutput } from "./families/cargo"
import { filterTestOutput } from "./families/test"
import { filterFsOutput } from "./families/fs"
import { filterGeneric } from "./families/generic"
import { filterDockerOutput } from "./families/docker"
import { filterPipOutput } from "./families/pip"
import { filterMakeOutput } from "./families/make"
import { filterRead, SOURCE_EXTENSIONS } from "./filters/read"
import { filterGrep } from "./filters/grep"
import { filterGlob } from "./filters/glob"
import { redactSecrets } from "./utils/secrets"
import { estimateTokens } from "./utils/tokens"
import { recordMetric } from "./utils/metrics"
import { getCachedRead, setCachedRead } from "./utils/cache"
import { getStatsSummary, formatStatsSummary, saveStatsSummary } from "./utils/stats"
import { getErrorSummary, logError } from "./utils/errors"

// Phase 2 imports
import { extractSkeleton } from "./skeleton"
import { foldDiffAndLogs } from "./folding"
import { sampleJson } from "./jsonsample"
import { applyReversibleCompression, cleanupRewind } from "./rewind"
import { analyzeContent, getCompressionPipeline } from "./router"
import { indexDirectory, loadIndex } from "./symbolindex"
import { shouldBlockGrep, shouldBlockGlob, shouldBlockShellGrep, trackLSPUsage, resetLSPState } from "./lspfirst"
import { generateStatusLine, generateSessionSummary, resetStatusLine } from "./statusline"

// Phase 7 imports — history compression & session memory
import { compressMessagesInPlace } from "./history"
import { writeSessionSummary, getRelevantSummaries, buildMemoryPrompt, extractContextKeywords, getMemoryStats } from "./memory"

// ─── CONFIGURATION ───

interface OpenTokenConfig {
  maxOutputBytes: number       // Hard limit — reject outputs larger than this
  maxProcessingMs: number      // Timeout per pipeline stage
  safeReadRoot: string         // Only allow reads under this directory
  enableMetrics: boolean       // Track token savings to disk
  enableSymbolIndex: boolean   // Build and query symbol index at startup
  conservativeUseTokens: boolean // Use token count (slower) vs byte count (faster) for safety check
  // Phase 7 — history compression
  enableHistoryCompression: boolean // Kill switch for experimental hooks (default false)
  historyCompressionWindow: number  // Messages to keep full-fidelity (default 12)
  enableSessionMemory: boolean      // Cross-session memory persistence (default false)
  enableTui: boolean                 // TUI status bar (default true)
}

const DEFAULT_CONFIG: OpenTokenConfig = {
  maxOutputBytes: 10 * 1024 * 1024,  // 10MB hard limit
  maxProcessingMs: 5000,              // 5s per stage
  safeReadRoot: "",                   // Empty = use project directory
  enableMetrics: true,
  enableSymbolIndex: true,
  conservativeUseTokens: false,       // Byte count by default (fast)
  enableHistoryCompression: false,    // Kill switch — opt-in for experimental hooks
  historyCompressionWindow: 12,       // Keep last 12 messages full-fidelity
  enableSessionMemory: false,         // Cross-session memory persistence
  enableTui: true,                    // TUI status bar
}

let config: OpenTokenConfig = DEFAULT_CONFIG

async function loadConfig(directory: string): Promise<void> {
  try {
    const configPath = path.join(os.homedir(), ".config", "opentoken", "config.json")
    const file = Bun.file(configPath)
    if (await file.exists()) {
      const userConfig = JSON.parse(await file.text()) as Partial<OpenTokenConfig>
      config = { ...DEFAULT_CONFIG, ...userConfig }
    }
  } catch {
    // Use defaults — config is optional
  }

  // Set safe read root to project directory if not explicitly configured
  if (!config.safeReadRoot) {
    config.safeReadRoot = directory
  }
}

// ─── SECURITY GUARDS ───

function validateToolName(tool: unknown): string {
  if (typeof tool !== "string") return "unknown"
  // Whitelist known tool names
  const known = ["bash", "read", "grep", "glob", "write", "edit", "web_fetch", "web_search"]
  return known.includes(tool) ? tool : tool.replace(/[^a-zA-Z0-9_]/g, "")
}

function sanitizeFilePath(filePath: string, rootDir: string): { safe: boolean; resolved: string; reason?: string } {
  const resolved = path.resolve(rootDir, filePath)
  const normalizedRoot = path.resolve(rootDir)

  // Block path traversal
  if (!resolved.startsWith(normalizedRoot)) {
    return { safe: false, resolved: "", reason: `Path traversal blocked: ${filePath} resolves outside project directory` }
  }

  // Block absolute paths
  if (path.isAbsolute(filePath) && !filePath.startsWith(normalizedRoot)) {
    return { safe: false, resolved: "", reason: `Absolute paths outside project blocked: ${filePath}` }
  }

  return { safe: true, resolved }
}

function validateOutputSize(output: string): { valid: boolean; reason?: string } {
  const bytes = Buffer.byteLength(output, "utf8")
  if (bytes > config.maxOutputBytes) {
    return { valid: false, reason: `Output too large: ${(bytes / 1024 / 1024).toFixed(1)}MB exceeds ${(config.maxOutputBytes / 1024 / 1024).toFixed(0)}MB limit` }
  }
  return { valid: true }
}

function safeEstimateTokens(text: string): number {
  try {
    return estimateTokens(text)
  } catch {
    return Math.ceil(text.length * 0.25) // Fallback estimation
  }
}

// ─── SAFE PIPELINE WRAPPER ───

// Wraps each pipeline stage with error handling — if a stage fails, log and continue
function safeStage<T>(name: string, fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[OpenToken] Stage "${name}" failed: ${msg}`)
    logError({
      ts: new Date().toISOString(),
      stage: name,
      tool: "unknown",
      error: msg,
      stack,
      recoverable: true,
    })
    return fallback
  }
}

async function safeStageAsync<T>(name: string, fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[OpenToken] Stage "${name}" failed: ${msg}`)
    logError({
      ts: new Date().toISOString(),
      stage: name,
      tool: "unknown",
      error: msg,
      stack,
      recoverable: true,
    })
    return fallback
  }
}

// ─── INTERFACES ───

interface ToolInputBefore {
  tool: string
  sessionID: string
  callID: string
}

interface ToolOutputBefore {
  args?: Record<string, unknown>
  result?: string
  error?: string
}

interface ToolInputAfter {
  tool: string
  sessionID: string
  callID: string
  args?: Record<string, unknown>
}

interface ToolOutputAfter {
  title?: string
  output?: string
  metadata?: unknown
}

// ─── HELPERS ───

// LOSSLESS_LINE_THRESHOLD controls entry to lossless stages (ANSI strip, log fold, whitespace).
// Hard truncation cap stays at SHORT_OUTPUT_THRESHOLD (80) in the generic filter.
// This split ensures medium outputs (40-80 lines) get cleaned without risk of truncation.
const LOSSLESS_LINE_THRESHOLD = 40
const SHORT_OUTPUT_THRESHOLD = 80
const MAX_OUTPUT_LENGTH = 20000

function shouldSkipFilter(output: string): boolean {
  const lines = output.split("\n")
  return lines.length < LOSSLESS_LINE_THRESHOLD && output.length < MAX_OUTPUT_LENGTH
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
  if (config.conservativeUseTokens) {
    const origTokens = safeEstimateTokens(original)
    const filtTokens = safeEstimateTokens(filtered)
    if (filtTokens >= origTokens) return original
  } else {
    if (filtered.length >= original.length) return original
  }
  return filtered
}

// ─── CONTENT-AWARE ROUTER ───

function routeContent(content: string, filePath?: string): {
  pipeline: string[]
  analysis: ReturnType<typeof analyzeContent>
} {
  const analysis = safeStage("analyzeContent", () => analyzeContent(content, filePath), { type: "text" as const, language: "unknown" as const, size: 0, lines: 0, isStructured: false, hasErrors: false, isRepetitive: false, compressionCandidates: [] })
  const pipeline = getCompressionPipeline(analysis)
  return { pipeline, analysis }
}

// ─── BASH FILTER PIPELINE ───

async function applyBashFilter(sessionID: string, command: string, output: string): Promise<string> {
  output = safeStage("redactSecrets", () => redactSecrets(output), output)

  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(output), { binary: false, result: output })
  if (binary.binary) return binary.result

  const suppressed = safeStage("suppressOversized", () => suppressOversized(output), { suppressed: false, result: output })
  if (suppressed.suppressed) return suppressed.result

  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output), output)

  // ANSI escape stripping — zero risk, applies even on short outputs
  output = safeStage("stripAnsi", () => stripAnsi(output), output)

  if (shouldSkipFilter(output)) return output

  output = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(output), output)

  output = safeStage("aliasJsonKeys", () => aliasJsonKeys(output), output)

  // TOON format conversion for JSON arrays
  const toon = safeStage("convertToTOON", () => convertToTOON(output), { converted: false, result: output })
  if (toon.converted) output = toon.result

  // Aggressive whitespace normalization
  output = safeStage("normalizeWhitespace", () => normalizeWhitespace(output), output)

  // JSON minification (lossless whitespace removal)
  output = safeStage("minifyJSON", () => minifyJSON(output), output)

  // Table whitespace minimization (strip padding from CLI tables)
  output = safeStage("minimizeTableWhitespace", () => minimizeTableWhitespace(output), output)

  // Log normalization (timestamps, PIDs, elapsed time → static placeholders)
  output = safeStage("normalizeLogNoise", () => normalizeLogNoise(output), output)

  const { pipeline } = routeContent(output)

  if (pipeline.includes("diff-fold") || pipeline.includes("log-fold")) {
    output = await safeStageAsync("foldDiffAndLogs", () => foldDiffAndLogs(output), output)
  }

  if (pipeline.includes("json-sample")) {
    const sampled = safeStage("sampleJson", () => sampleJson(output), { sampled: false, result: output })
    if (sampled.sampled) output = sampled.result
  }

  const family = safeStage("detectFamily", () => detectFamily(command), "generic")
  let filtered: string

  // Route bash grep/rg/ag/ack commands to grep filter instead of family filter
  const isGrepCommand = /\b(grep|rg|ag|ack)\b/.test(command)
  if (isGrepCommand) {
    filtered = safeStage("filterGrep", () => filterGrep(output), output)
  } else {
    switch (family) {
      case "git":
        filtered = safeStage("filterGitOutput", () => filterGitOutput(command, output), output)
        break
      case "npm":
        filtered = safeStage("filterNpmOutput", () => filterNpmOutput(command, output), output)
        break
      case "cargo":
        filtered = safeStage("filterCargoOutput", () => filterCargoOutput(command, output), output)
        break
      case "test":
        filtered = safeStage("filterTestOutput", () => filterTestOutput(command, output), output)
        break
      case "fs":
        // Route `cat <source_file>` through the read pipeline for skeleton extraction.
        // Guard: no flags, pipes, redirects, globs, or multiple files — only cat <path>.
        const catReadMatch = command.match(/^\s*cat\s+(?!-)([^\s|&;>'<*"]+)\s*$/)
        if (catReadMatch) {
          const catPath = catReadMatch[1]
          const ext = "." + (catPath.split(".").pop()?.toLowerCase() || "")
          if (SOURCE_EXTENSIONS.includes(ext)) {
            filtered = safeStage("filterRead", () => filterRead(catPath, output), output)
            break
          }
        }
        // Route read-only fs tools through generic for better head+tail preservation.
        // Cat (non-source), wc, du, df benefit from generic's head(20)+tail(20) over fs's prefix-only truncation.
        // Diff, sort, uniq stay in fs — their output is order-sensitive and needs full visibility.
        if (/^\s*(wc|du|df)\s/.test(command + " ")) {
          filtered = safeStage("filterGeneric", () => filterGeneric(output), output)
        } else {
          filtered = safeStage("filterFsOutput", () => filterFsOutput(command, output), output)
        }
        break
      case "docker":
        filtered = safeStage("filterDockerOutput", () => filterDockerOutput(command, output), output)
        break
      case "pip":
        filtered = safeStage("filterPipOutput", () => filterPipOutput(command, output), output)
        break
      case "make":
        filtered = safeStage("filterMakeOutput", () => filterMakeOutput(command, output), output)
        break
      default:
        filtered = safeStage("filterGeneric", () => filterGeneric(output), output)
    }
  }

  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(sessionID, filtered), { result: filtered, compressed: false })
  if (reversible.compressed) {
    filtered = reversible.result
  }

  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered), filtered)

  // LTSC: Lossless Token Sequence Compression (LZ77-style, 18-27% savings)
  const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), { compressed: false, result: filtered, savings: 0 })
  if (ltsc.compressed) filtered = ltsc.result

  // LZW: Token substitution for repetitive content (stack traces, error logs)
  const lzw = safeStage("compressLZW", () => compressLZW(filtered), { compressed: false, result: filtered, savings: 0 })
  if (lzw.compressed) filtered = lzw.result

  return conservativeFilter(output, filtered)
}

// ─── READ FILTER PIPELINE ───

async function applyReadFilter(sessionID: string, filePath: string, content: string): Promise<string> {
  const pathCheck = sanitizeFilePath(filePath, config.safeReadRoot)
  if (!pathCheck.safe) {
    return `[OpenToken] ${pathCheck.reason}`
  }

  content = safeStage("redactSecrets", () => redactSecrets(content), content)

  trackFile(sessionID, filePath)

  const cached = await safeStageAsync("getCachedRead", () => getCachedRead(sessionID, filePath), null)
  if (cached !== null) {
    return cached
  }

  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(content), { binary: false, result: content })
  if (binary.binary) return binary.result

  const suppressed = safeStage("suppressOversized", () => suppressOversized(content), { suppressed: false, result: content })
  if (suppressed.suppressed) return suppressed.result

  content = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(content), content)

  if (shouldSkipFilter(content)) {
    await safeStageAsync("setCachedRead", () => setCachedRead(sessionID, filePath, content), undefined)
    return content
  }

  content = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(content), content)

  content = safeStage("aliasJsonKeys", () => aliasJsonKeys(content), content)

  // TOON format conversion for JSON arrays
  const toon = safeStage("convertToTOON", () => convertToTOON(content), { converted: false, result: content })
  if (toon.converted) content = toon.result

  // Aggressive whitespace normalization
  content = safeStage("normalizeWhitespace", () => normalizeWhitespace(content), content)

  // JSON minification (lossless whitespace removal)
  content = safeStage("minifyJSON", () => minifyJSON(content), content)

  // Table whitespace minimization (strip padding from CLI tables)
  content = safeStage("minimizeTableWhitespace", () => minimizeTableWhitespace(content), content)

  // Log normalization (timestamps, PIDs, elapsed time → static placeholders)
  content = safeStage("normalizeLogNoise", () => normalizeLogNoise(content), content)

  const { pipeline } = routeContent(content, filePath)

  if (pipeline.includes("skeleton") && content.split("\n").length > 50) {
    const skeleton = await safeStageAsync("extractSkeleton", () => extractSkeleton(filePath, content), content)
    if (skeleton) {
      content = skeleton
    }
  }

  if (pipeline.includes("json-sample")) {
    const sampled = safeStage("sampleJson", () => sampleJson(content), { sampled: false, result: content })
    if (sampled.sampled) content = sampled.result
  }

  let filtered = safeStage("filterRead", () => filterRead(filePath, content), content)

  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(sessionID, filtered, "read"), null)
  if (disclosed) filtered = disclosed.result

  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(sessionID, filtered), { result: filtered, compressed: false })
  if (reversible.compressed) {
    filtered = reversible.result
  }

  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered), filtered)

  // LTSC: Lossless Token Sequence Compression (LZ77-style, 18-27% savings)
  const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), { compressed: false, result: filtered, savings: 0 })
  if (ltsc.compressed) filtered = ltsc.result

  // LZW: Token substitution for repetitive content (stack traces, error logs)
  const lzw = safeStage("compressLZW", () => compressLZW(filtered), { compressed: false, result: filtered, savings: 0 })
  if (lzw.compressed) filtered = lzw.result

  await safeStageAsync("setCachedRead", () => setCachedRead(sessionID, filePath, filtered), undefined)

  return conservativeFilter(content, filtered)
}

// ─── GREP FILTER PIPELINE ───

async function applyGrepFilter(sessionID: string, output: string): Promise<string> {
  output = safeStage("redactSecrets", () => redactSecrets(output), output)

  const binary = safeStage("detectAndHandleBinary", () => detectAndHandleBinary(output), { binary: false, result: output })
  if (binary.binary) return binary.result

  const suppressed = safeStage("suppressOversized", () => suppressOversized(output), { suppressed: false, result: output })
  if (suppressed.suppressed) return suppressed.result

  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output), output)

  if (shouldSkipFilter(output)) return output

  output = safeStage("cleanWhitespaceAndNulls", () => cleanWhitespaceAndNulls(output), output)

  // Aggressive whitespace normalization
  output = safeStage("normalizeWhitespace", () => normalizeWhitespace(output), output)

  // JSON minification (lossless whitespace removal)
  output = safeStage("minifyJSON", () => minifyJSON(output), output)

  // Table whitespace minimization (strip padding from CLI tables)
  output = safeStage("minimizeTableWhitespace", () => minimizeTableWhitespace(output), output)

  // Log normalization (timestamps, PIDs, elapsed time → static placeholders)
  output = safeStage("normalizeLogNoise", () => normalizeLogNoise(output), output)

  let filtered = safeStage("filterGrep", () => filterGrep(output), output)

  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(sessionID, filtered, "grep"), null)
  if (disclosed) filtered = disclosed.result

  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(sessionID, filtered), { result: filtered, compressed: false })
  if (reversible.compressed) {
    filtered = reversible.result
  }

  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered), filtered)

  // LTSC: Lossless Token Sequence Compression (LZ77-style, 18-27% savings)
  const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), { compressed: false, result: filtered, savings: 0 })
  if (ltsc.compressed) filtered = ltsc.result

  // LZW: Token substitution for repetitive content (stack traces, error logs)
  const lzw = safeStage("compressLZW", () => compressLZW(filtered), { compressed: false, result: filtered, savings: 0 })
  if (lzw.compressed) filtered = lzw.result

  return conservativeFilter(output, filtered)
}

// ─── GLOB FILTER PIPELINE ───

async function applyGlobFilter(sessionID: string, output: string): Promise<string> {
  output = safeStage("redactSecrets", () => redactSecrets(output), output)

  const suppressed = safeStage("suppressOversized", () => suppressOversized(output), { suppressed: false, result: output })
  if (suppressed.suppressed) return suppressed.result

  output = safeStage("stripThinkingBlocks", () => stripThinkingBlocks(output), output)

  if (shouldSkipFilter(output)) return output

  // JSON minification (lossless whitespace removal)
  output = safeStage("minifyJSON", () => minifyJSON(output), output)

  // Table whitespace minimization (strip padding from CLI tables)
  output = safeStage("minimizeTableWhitespace", () => minimizeTableWhitespace(output), output)

  // Log normalization (timestamps, PIDs, elapsed time → static placeholders)
  output = safeStage("normalizeLogNoise", () => normalizeLogNoise(output), output)

  let filtered = safeStage("filterGlob", () => filterGlob(output), output)

  const disclosed = await safeStageAsync("progressiveDisclosure", () => progressiveDisclosure(sessionID, filtered, "glob"), null)
  if (disclosed) filtered = disclosed.result

  const reversible = await safeStageAsync("applyReversibleCompression", () => applyReversibleCompression(sessionID, filtered), { result: filtered, compressed: false })
  if (reversible.compressed) {
    filtered = reversible.result
  }

  filtered = safeStage("applyAutoEscalation", () => applyAutoEscalation(filtered), filtered)

  // LTSC: Lossless Token Sequence Compression (LZ77-style, 18-27% savings)
  const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), { compressed: false, result: filtered, savings: 0 })
  if (ltsc.compressed) filtered = ltsc.result

  // LZW: Token substitution for repetitive content (stack traces, error logs)
  const lzw = safeStage("compressLZW", () => compressLZW(filtered), { compressed: false, result: filtered, savings: 0 })
  if (lzw.compressed) filtered = lzw.result

  return conservativeFilter(output, filtered)
}

// ─── MAIN PLUGIN ───

const SESSION_START_FILE = path.join(os.homedir(), ".config", "opentoken", "session-start.json")

export const OpenTokenPlugin: Plugin = async ({ directory }) => {
  console.error("[OpenToken] Plugin loading...")
  await loadConfig(directory)
  console.error(`[OpenToken] Loaded. Symbol index: ${config.enableSymbolIndex}, Metrics: ${config.enableMetrics}`)

  // Generate a unique session ID for this plugin instance
  // Used as the key for all SessionStore state — ensures all hooks share the same tracker
  const sessionID = crypto.randomUUID()

  // Write session ID to disk for observability and TUI session detection
  try {
    const tmp = SESSION_START_FILE + ".tmp"
    await Bun.write(tmp, JSON.stringify({ sessionStart: Date.now(), sessionID }))
    fs.renameSync(tmp, SESSION_START_FILE)
  } catch { /* ignore */ }

  // L38: Load previous session memory
  await safeStageAsync("loadSessionSummary", () => loadSessionSummary(directory), null)

  if (config.enableSymbolIndex) {
    await safeStageAsync("loadIndex", () => loadIndex(), false)
  }

  return {
    // Session start — inject memory, reset state
    "session.created": async () => {
      console.error("[OpenToken] Session started — compression active")
      try {
        const tmp = SESSION_START_FILE + ".tmp"
        await Bun.write(tmp, JSON.stringify({ sessionStart: Date.now(), sessionID }))
        fs.renameSync(tmp, SESSION_START_FILE)
      } catch { /* ignore */ }
      resetDedup(sessionID)
      resetEscalation(sessionID)
      resetContextUsed(sessionID)
      resetLSPState(sessionID, directory)
      resetStatusLine(sessionID)
      resetSessionTracker(sessionID)
      await safeStageAsync("writeSessionState", () => writeSessionState(sessionID, directory, "off"), undefined)
      await safeStageAsync("cleanupOffloaded", () => cleanupOffloaded(sessionID), 0)
      await safeStageAsync("cleanupRewind", () => cleanupRewind(sessionID), 0)

      if (config.enableSymbolIndex) {
        indexDirectory(directory).then((stats) => {
          console.log(`[OpenToken] Indexed ${stats.filesIndexed} files, ${stats.totalSymbols} symbols`)
        }).catch((err) => {
          console.error(`[OpenToken] Symbol indexing failed: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
    },

    "session.deleted": async () => {
      const sessionTracker = getSessionTracker(sessionID)
      console.log(generateSessionSummary(sessionID, sessionTracker.tokensSaved, sessionTracker.toolCalls))
      await safeStageAsync("finalizeSession", () => finalizeSession(sessionID, directory), undefined)
      resetEscalation(sessionID)
      resetContextUsed(sessionID)
    },

    "session.idle": async () => {
      // Idle = user paused, NOT session ended. Persist state but don't reset.
      const sessionTracker = getSessionTracker(sessionID)
      await safeStageAsync("writeSessionState", () => writeSessionState(sessionID, directory, getCompressionLevel(sessionID)), undefined)
    },

    // L1-L4 + L5: Pre-call interception
    "tool.execute.before": async (input: ToolInputBefore, output: ToolOutputBefore) => {
      try {
        const tool = validateToolName(input.tool)

        const result = preCallFilter(tool, output.args || {})

        if (result.blocked) {
          output.result = `[OpenToken blocked] ${result.reason}`
          output.error = result.reason
          return
        }

        if (result.modifiedArgs) {
          Object.assign(output.args ??= {}, result.modifiedArgs)
        }

        // L5: LSP-First Enforcement — block grep/glob for symbols
        if (tool === "grep" && typeof output.args?.pattern === "string") {
          const block = shouldBlockGrep(output.args.pattern)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }

        if (tool === "glob" && typeof output.args?.pattern === "string") {
          const block = shouldBlockGlob(output.args.pattern)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }

        // L5: Block shell grep for symbols
        if (tool === "bash" && typeof output.args?.command === "string") {
          const block = shouldBlockShellGrep(output.args.command)
          if (block.blocked) {
            output.result = `[OpenToken LSP-first] ${block.suggestion}`
            return
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] tool.execute.before error: ${msg}`)
      }
    },

    // L5-L24: Post-call interception
    "tool.execute.after": async (input: ToolInputAfter, output: ToolOutputAfter) => {
      try {
        if (!output.output) return

        // Track errors in original output before filtering
        if (hasErrors(output.output)) {
          trackError(sessionID, output.output)
        }

        // Security: Validate output size
        const sizeCheck = validateOutputSize(output.output)
        if (!sizeCheck.valid) {
          output.output = `[OpenToken] ${sizeCheck.reason}`
          return
        }

        const beforeTokens = safeEstimateTokens(output.output)
        let filtered = output.output
        const tool = validateToolName(input.tool)

        trackToolCall(sessionID)
        trackLSPUsage(sessionID, directory, tool)

        switch (tool) {
          case "bash": {
            const command = String(input.args?.command || "")
            filtered = await applyBashFilter(sessionID, command, output.output)
            break
          }
          case "read": {
            const filePath = String(input.args?.filePath || "")
            filtered = await applyReadFilter(sessionID, filePath, output.output)
            break
          }
          case "grep": {
            filtered = await applyGrepFilter(sessionID, output.output)
            break
          }
          case "glob": {
            filtered = await applyGlobFilter(sessionID, output.output)
            break
          }
          default:
            return // Don't touch other tools
        }

        const deduped = safeStage("deduplicate", () => deduplicate(sessionID, filtered, tool), { deduped: false, result: filtered })
        filtered = deduped.result

        const afterTokens = safeEstimateTokens(filtered)
        const saved = beforeTokens - afterTokens

        if (saved > 0) {
          trackTokensSaved(sessionID, saved)
          updateContext(sessionID, afterTokens)

          const family = tool === "bash" ? detectFamily(String(input.args?.command || "")) : tool

          if (config.enableMetrics) {
            await safeStageAsync("recordMetric", () => recordMetric({
              ts: new Date().toISOString(),
              tool,
              family,
              before_tokens: beforeTokens,
              after_tokens: afterTokens,
              saved_pct: Math.round((saved / beforeTokens) * 100),
            }), undefined)
            // Keep stats-summary.json and session-memory.json fresh for TUI
            await safeStageAsync("saveStatsSummary", () => saveStatsSummary(), undefined)
          }

          // Record metrics (don't inject status line into LLM output — TUI bar handles display)
          const sessionTracker = getSessionTracker(sessionID)
        }

        // Ensure session-start.json exists (fallback if session.created didn't fire)
        // Must run outside if (saved > 0) so it works even when first calls save nothing
        const startFile = path.join(os.homedir(), ".config", "opentoken", "session-start.json")
        try {
          const f = Bun.file(startFile)
          if (!(await f.exists())) {
            const tmp = startFile + ".tmp"
            await Bun.write(tmp, JSON.stringify({ sessionStart: Date.now() }))
            fs.renameSync(tmp, startFile)
          }
        } catch { /* ignore */ }

        // Write session state after every call so TUI gets fresh compression level
        await safeStageAsync("writeSessionState", () => writeSessionState(sessionID, directory, getCompressionLevel(sessionID)), undefined)

        output.output = filtered

        // De-escalate compression when context pressure eases
        deescalate(sessionID)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] tool.execute.after error: ${msg}`)
        // Never crash the pipeline — pass through original output
      }
    },

    // Custom MCP tools for diagnostics
    tool: {
      opentoken_stats: tool({
        description: "Show OpenToken token savings statistics — total saved, by tool, top savings",
        args: {},
        async execute(_args, context) {
          try {
            saveStatsSummary()
            const summary = formatStatsSummary()
            return { output: summary }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { output: `Failed to get stats: ${msg}` }
          }
        },
      }),
      opentoken_health: tool({
        description: "Check OpenToken plugin health — error counts, stage failures, config status",
        args: {},
        async execute(_args, context) {
          try {
            const errors = getErrorSummary()
            const lines: string[] = []
            lines.push("🌸 opentoken health check")
            lines.push("")
            lines.push(`  Total errors: ${errors.total}`)
            if (errors.total > 0) {
              lines.push("")
              lines.push("  Errors by stage:")
              for (const [stage, count] of Object.entries(errors.byStage).sort((a, b) => b[1] - a[1])) {
                lines.push(`    ${stage}: ${count}`)
              }
              if (errors.recent.length > 0) {
                lines.push("")
                lines.push("  Recent errors:")
                for (const e of errors.recent.slice(-5)) {
                  lines.push(`    [${new Date(e.ts).toLocaleTimeString()}] ${e.stage}: ${e.error.slice(0, 100)}`)
                }
              }
            } else {
              lines.push("  No errors recorded ✅")
            }
            lines.push("")
            lines.push(`  Config: metrics=${config.enableMetrics}, symbols=${config.enableSymbolIndex}`)
            lines.push(`  Context: ${getCompressionLevel(directory)}`)
            return { output: lines.join("\n") }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { output: `Health check failed: ${msg}` }
          }
        },
      }),
    },

    // ─── PHASE 7: EXPERIMENTAL HOOKS ───
    // Kill switch: all disabled if enableHistoryCompression is false

    // Compress conversation messages before sending to LLM
    // MUST mutate in-place via splice (output.messages = newArray is a silent no-op)
    "experimental.chat.messages.transform": async (_input, output) => {
      if (!config.enableHistoryCompression) return

      try {
        compressMessagesInPlace(output.messages, {
          window: config.historyCompressionWindow,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] chat.messages.transform error: ${msg}`)
      }
    },

    // Customize compaction prompt + write session memory
    "experimental.session.compacting": async (input, output) => {
      if (!config.enableHistoryCompression) return

      try {
        // Native compaction freed context — reset escalation tracking
        resetContextUsed(sessionID)

        // Generate session summary from metrics
        const tracker = getSessionTracker(sessionID)
        const summary = generateSessionSummary(sessionID, tracker.tokensSaved, tracker.toolCalls)
        if (summary) {
          // Inject into compaction context
          output.context.push(`\n## OpenToken Session Summary\n${summary}`)

          // Write to cross-session memory
          if (config.enableSessionMemory) {
            writeSessionSummary(input.sessionID, directory, summary)
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] session.compacting error: ${msg}`)
      }
    },

    // Inject session memory into system prompt
    "experimental.chat.system.transform": async (input, output) => {
      if (!config.enableHistoryCompression) return

      try {
        // Inject session memory if enabled
        if (config.enableSessionMemory) {
          const stats = getMemoryStats()
          if (stats.total > 0) {
            // Extract keywords from the latest user message
            const latestUserMsg = input as any
            const keywords = latestUserMsg?.message?.content
              ? extractContextKeywords(latestUserMsg.message.content)
              : []

            const relevant = getRelevantSummaries(directory, keywords, 3)
            if (relevant.length > 0) {
              const memoryPrompt = buildMemoryPrompt(relevant)
              if (memoryPrompt) {
                output.system.push(memoryPrompt)
              }
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[OpenToken] chat.system.transform error: ${msg}`)
      }
    },
  }
}

export default OpenTokenPlugin
