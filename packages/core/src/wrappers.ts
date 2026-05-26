import { config } from "./config";
import { analyzeContent, getCompressionPipeline } from "./router";
import { logError } from "./utils/errors";
import { logger } from "./utils/logger";
import { estimateTokens } from "./utils/tokens";

export function safeEstimateTokens(text: string): number {
	try {
		return estimateTokens(text);
	} catch {
		logger.debug(
			undefined,
			"tokens.estimate",
			"Token estimation failed, using fallback",
		);
		return Math.ceil(text.length * 0.25); // Fallback estimation
	}
}

// ─── SAFE PIPELINE WRAPPER ───

// Wraps each pipeline stage with error handling — if a stage fails, log and continue
export function safeStage<T>(
	name: string,
	fn: () => T,
	fallback: T,
	sessionID?: string,
): T {
	try {
		return fn();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;
		logError({
			ts: new Date().toISOString(),
			stage: name,
			tool: "unknown",
			sessionID,
			error: msg,
			stack,
			recoverable: true,
		});
		return fallback;
	}
}

export async function safeStageAsync<T>(
	name: string,
	fn: () => T | Promise<T>,
	fallback: T,
	sessionID?: string,
): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;
		logError({
			ts: new Date().toISOString(),
			stage: name,
			tool: "unknown",
			sessionID,
			error: msg,
			stack,
			recoverable: true,
		});
		return fallback;
	}
}

// ─── HELPERS ───

// LOSSLESS_LINE_THRESHOLD controls entry to lossless stages (ANSI strip, log fold, whitespace).
// Hard truncation cap stays at SHORT_OUTPUT_THRESHOLD (80) in the generic filter.
// This split ensures medium outputs (40-80 lines) get cleaned without risk of truncation.
const LOSSLESS_LINE_THRESHOLD = 40;
const MAX_OUTPUT_LENGTH = 20000;

export function shouldSkipFilter(output: string): boolean {
	const lines = output.split("\n");
	return (
		lines.length < LOSSLESS_LINE_THRESHOLD && output.length < MAX_OUTPUT_LENGTH
	);
}

export function hasErrors(output: string): boolean {
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
	];
	return errorPatterns.some((p) => p.test(output));
}

export function conservativeFilter(original: string, filtered: string): string {
	if (config.conservativeUseTokens) {
		const origTokens = safeEstimateTokens(original);
		const filtTokens = safeEstimateTokens(filtered);
		if (filtTokens >= origTokens) return original;
	} else {
		if (filtered.length >= original.length) return original;
	}
	return filtered;
}

// ─── CONTENT-AWARE ROUTER ───

export function routeContent(
	content: string,
	filePath?: string,
): {
	pipeline: string[];
	analysis: ReturnType<typeof analyzeContent>;
} {
	const analysis = safeStage(
		"analyzeContent",
		() => analyzeContent(content, filePath),
		{
			type: "text" as const,
			language: "unknown" as const,
			size: 0,
			lines: 0,
			isStructured: false,
			hasErrors: false,
			isRepetitive: false,
			compressionCandidates: [],
		},
	);
	const pipeline = getCompressionPipeline(analysis);
	return { pipeline, analysis };
}
