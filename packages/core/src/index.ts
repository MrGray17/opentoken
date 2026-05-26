// Transform — main entry point

// Auto-escalation
export {
	applyAutoEscalation,
	deescalate,
	getCompressionLevel,
	resetContextUsed,
	resetEscalation,
	updateContext,
} from "./autoescalate";
// Auto-tune
export { isStageWorthwhile } from "./autotune";
export type { OpenTokenConfig } from "./config";
// State & config
export { config, loadConfig } from "./config";
// Dedup
export { deduplicate, resetDedup } from "./dedup";
export { filterCargoOutput } from "./families/cargo";
// Families
export { detectFamily } from "./families/detect";
export { filterDockerOutput } from "./families/docker";
export { filterFsOutput } from "./families/fs";
export { filterGeneric } from "./families/generic";
export { filterGitOutput } from "./families/git";
export { filterMakeOutput } from "./families/make";
export { filterNpmOutput } from "./families/npm";
export { filterPipOutput } from "./families/pip";
export { filterTestOutput } from "./families/test";
// Filters
export { filterGlob } from "./filters/glob";
export { filterGrep } from "./filters/grep";
export { filterRead, SOURCE_EXTENSIONS } from "./filters/read";
export { foldDiff, foldDiffAndLogs, foldLogs } from "./folding";
export {
	sanitizeFilePath,
	validateOutputSize,
	validateToolName,
} from "./guards";
// History
export { compressMessagesInPlace } from "./history";
export { sampleJson } from "./jsonsample";
// LSP enforcement
export {
	resetLSPState,
	shouldBlockGlob,
	shouldBlockGrep,
	shouldBlockShellGrep,
	trackLSPUsage,
} from "./lspfirst";
export { compressLTSC, decompressLTSC } from "./ltsc";
// Compression
export { compressLZW, decompressLZW } from "./lzw";
// Memory
export {
	buildMemoryPrompt,
	extractContextKeywords,
	getMemoryStats,
} from "./memory";
// Output compression
export {
	compressOutput,
	getConcisenessDirective,
	getOutputBudget,
} from "./outputcomp";
// Pipeline filters
export { applyBashFilter } from "./pipelines/bash";
export { applyGlobFilter } from "./pipelines/glob";
export { applyGrepFilter } from "./pipelines/grep";
export { applyReadFilter } from "./pipelines/read";
// Pre-call
export { preCallFilter, rewriteCommand } from "./precall";
// Progressive disclosure
export { cleanupOffloaded, progressiveDisclosure } from "./progressive";
// Rewind
export {
	abbreviateIdentifiers,
	applyReversibleCompression,
	cleanupRewind,
} from "./rewind";
// Content routing
export { analyzeContent, getCompressionPipeline } from "./router";
// Session
export {
	finalizeSession,
	getSessionTracker,
	loadSessionSummary,
	resetSessionTracker,
	trackError,
	trackFile,
	trackOutputTokensSaved,
	trackTokensSaved,
	trackToolCall,
	writeSessionState,
} from "./session";
export { extractSkeleton } from "./skeleton";
// Symbol index
export { indexDirectory, loadIndex } from "./symbolindex";
export { convertToTOON } from "./toon";
export type { TransformOptions, TransformResult } from "./transform";
export { transformToolOutput } from "./transform";
// Cache
export { getCachedRead, setCachedRead } from "./utils/cache";
export { getErrorSummary, logError } from "./utils/errors";
// Observability
export { logger } from "./utils/logger";
export { recordMetric } from "./utils/metrics";
// Safety
export { redactSecrets } from "./utils/secrets";
// Session file
export {
	ensureSessionStartFile,
	writeSessionStartFileAsync,
} from "./utils/session-file";
export { SessionStore } from "./utils/session-store";
export {
	formatStatsSummary,
	getStatsSummary,
	saveStatsSummary,
} from "./utils/stats";
export { estimateTokens } from "./utils/tokens";
export {
	conservativeFilter,
	hasErrors,
	routeContent,
	safeEstimateTokens,
	safeStage,
	safeStageAsync,
	shouldSkipFilter,
} from "./wrappers";
