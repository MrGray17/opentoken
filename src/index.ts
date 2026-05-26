import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import {
	deescalate,
	getCompressionLevel,
	resetContextUsed,
	resetEscalation,
	updateContext,
} from "./autoescalate";
import { config, loadConfig } from "./config";
import { deduplicate, resetDedup } from "./dedup";
import { detectFamily } from "./families/detect";
import { validateOutputSize, validateToolName } from "./guards";
import { compressMessagesInPlace } from "./history";
import {
	resetLSPState,
	shouldBlockGlob,
	shouldBlockGrep,
	shouldBlockShellGrep,
	trackLSPUsage,
} from "./lspfirst";
import {
	buildMemoryPrompt,
	extractContextKeywords,
	getMemoryStats,
} from "./memory";
import {
	compressOutput,
	getConcisenessDirective,
	getOutputBudget,
} from "./outputcomp";
import { applyBashFilter } from "./pipelines/bash";
import { applyGlobFilter } from "./pipelines/glob";
import { applyGrepFilter } from "./pipelines/grep";
import { applyReadFilter } from "./pipelines/read";
import { preCallFilter } from "./precall";
import { cleanupOffloaded } from "./progressive";
import { cleanupRewind } from "./rewind";
import {
	finalizeSession,
	getSessionTracker,
	loadSessionSummary,
	resetSessionTracker,
	trackError,
	trackOutputTokensSaved,
	trackTokensSaved,
	trackToolCall,
	writeSessionState,
} from "./session";
import { indexDirectory, loadIndex } from "./symbolindex";
import { getErrorSummary } from "./utils/errors";
import { recordMetric } from "./utils/metrics";
import { formatStatsSummary, saveStatsSummary } from "./utils/stats";
import { estimateTokens } from "./utils/tokens";
import {
	hasErrors,
	safeEstimateTokens,
	safeStage,
	safeStageAsync,
	type ToolInputAfter,
	type ToolInputBefore,
	type ToolOutputAfter,
	type ToolOutputBefore,
} from "./wrappers";

// ─── MAIN PLUGIN ───

const SESSION_START_FILE = path.join(
	os.homedir(),
	".config",
	"opentoken",
	"session-start.json",
);

export const OpenTokenPlugin: Plugin = async ({ directory }) => {
	console.error("[OpenToken] Plugin loading...");
	await loadConfig(directory);
	console.error(
		`[OpenToken] Loaded. Symbol index: ${config.enableSymbolIndex}, Metrics: ${config.enableMetrics}`,
	);

	// Generate a unique session ID for this plugin instance
	// Used as the key for all SessionStore state — ensures all hooks share the same tracker
	const sessionID = crypto.randomUUID();

	// Write session ID to disk for observability and TUI session detection
	try {
		const tmp = `${SESSION_START_FILE}.tmp`;
		await Bun.write(
			tmp,
			JSON.stringify({ sessionStart: Date.now(), sessionID }),
		);
		fs.renameSync(tmp, SESSION_START_FILE);
	} catch {
		/* fs */
	}

	// L38: Load previous session memory
	await safeStageAsync(
		"loadSessionSummary",
		() => loadSessionSummary(directory),
		null,
	);

	if (config.enableSymbolIndex) {
		await safeStageAsync("loadIndex", () => loadIndex(), false);
	}

	return {
		// Session start — inject memory, reset state
		"session.created": async () => {
			console.error("[OpenToken] Session started — compression active");
			try {
				const tmp = `${SESSION_START_FILE}.tmp`;
				await Bun.write(
					tmp,
					JSON.stringify({ sessionStart: Date.now(), sessionID }),
				);
				fs.renameSync(tmp, SESSION_START_FILE);
			} catch {
				/* fs */
			}
			resetDedup(sessionID);
			resetEscalation(sessionID);
			resetContextUsed(sessionID);
			resetLSPState(sessionID, directory);
			resetSessionTracker(sessionID);
			await safeStageAsync(
				"writeSessionState",
				() => writeSessionState(sessionID, directory, "off"),
				undefined,
			);
			await safeStageAsync(
				"cleanupOffloaded",
				() => cleanupOffloaded(sessionID),
				0,
			);
			await safeStageAsync("cleanupRewind", () => cleanupRewind(sessionID), 0);

			if (config.enableSymbolIndex) {
				indexDirectory(directory)
					.then((stats) => {
						console.log(
							`[OpenToken] Indexed ${stats.filesIndexed} files, ${stats.totalSymbols} symbols`,
						);
					})
					.catch((err) => {
						console.error(
							`[OpenToken] Symbol indexing failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
			}
		},

		"session.deleted": async () => {
			await safeStageAsync(
				"finalizeSession",
				() => finalizeSession(sessionID, directory),
				undefined,
			);
			resetEscalation(sessionID);
			resetContextUsed(sessionID);
		},

		"session.idle": async () => {
			// Idle = user paused, NOT session ended. Persist state but don't reset.
			const _sessionTracker = getSessionTracker(sessionID);
			await safeStageAsync(
				"writeSessionState",
				() =>
					writeSessionState(
						sessionID,
						directory,
						getCompressionLevel(sessionID),
					),
				undefined,
			);
		},

		// L1-L4 + L5: Pre-call interception
		"tool.execute.before": async (
			input: ToolInputBefore,
			output: ToolOutputBefore,
		) => {
			try {
				const tool = validateToolName(input.tool);

				const result = preCallFilter(tool, output.args || {}, {
					allowLockFiles: config.allowLockFileReads,
				});

				if (result.blocked) {
					output.result = `[OpenToken blocked] ${result.reason}`;
					output.error = result.reason;
					return;
				}

				if (result.modifiedArgs) {
					Object.assign((output.args ??= {}), result.modifiedArgs);
				}

				// L5: LSP-First Enforcement — block grep/glob for symbols
				if (tool === "grep" && typeof output.args?.pattern === "string") {
					const block = shouldBlockGrep(output.args.pattern);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}

				if (tool === "glob" && typeof output.args?.pattern === "string") {
					const block = shouldBlockGlob(output.args.pattern);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}

				// L5: Block shell grep for symbols
				if (tool === "bash" && typeof output.args?.command === "string") {
					const block = shouldBlockShellGrep(output.args.command);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[OpenToken] tool.execute.before error: ${msg}`);
			}
		},

		// L5-L24: Post-call interception
		"tool.execute.after": async (
			input: ToolInputAfter,
			output: ToolOutputAfter,
		) => {
			try {
				if (!output.output) return;

				// Track errors in original output before filtering
				if (hasErrors(output.output)) {
					trackError(sessionID, output.output);
				}

				// Security: Validate output size
				const sizeCheck = validateOutputSize(output.output);
				if (!sizeCheck.valid) {
					output.output = `[OpenToken] ${sizeCheck.reason}`;
					return;
				}

				const beforeTokens = safeEstimateTokens(output.output);
				let filtered = output.output;
				const tool = validateToolName(input.tool);

				trackToolCall(sessionID);
				trackLSPUsage(sessionID, directory, tool);

				switch (tool) {
					case "bash": {
						const command = String(input.args?.command || "");
						filtered = await applyBashFilter(sessionID, command, output.output);
						break;
					}
					case "read": {
						const filePath = String(input.args?.filePath || "");
						filtered = await applyReadFilter(
							sessionID,
							filePath,
							output.output,
						);
						break;
					}
					case "grep": {
						filtered = await applyGrepFilter(sessionID, output.output);
						break;
					}
					case "glob": {
						filtered = await applyGlobFilter(sessionID, output.output);
						break;
					}
					default:
						return; // Don't touch other tools
				}

				const deduped = safeStage(
					"deduplicate",
					() => deduplicate(sessionID, filtered, tool),
					{ deduped: false, result: filtered },
				);
				filtered = deduped.result;

				const afterTokens = safeEstimateTokens(filtered);
				const saved = beforeTokens - afterTokens;

				if (saved > 0) {
					trackTokensSaved(sessionID, saved);
					updateContext(sessionID, afterTokens);
					const _sessionTracker = getSessionTracker(sessionID);
				}

				const family =
					tool === "bash"
						? detectFamily(String(input.args?.command || ""))
						: tool;

				if (config.enableMetrics) {
					await safeStageAsync(
						"recordMetric",
						() =>
							recordMetric({
								ts: new Date().toISOString(),
								tool,
								family,
								sessionID: sessionID,
								before_tokens: beforeTokens,
								after_tokens: afterTokens,
								saved_pct:
									beforeTokens > 0
										? Math.round((saved / beforeTokens) * 100)
										: 0,
							}),
						undefined,
					);
					await safeStageAsync(
						"saveStatsSummary",
						() => saveStatsSummary(sessionID),
						undefined,
					);
				}

				// Ensure session-start.json exists (fallback if session.created didn't fire)
				// Must run outside if (saved > 0) so it works even when first calls save nothing
				const startFile = path.join(
					os.homedir(),
					".config",
					"opentoken",
					"session-start.json",
				);
				try {
					const f = Bun.file(startFile);
					if (!(await f.exists())) {
						const tmp = `${startFile}.tmp`;
						await Bun.write(
							tmp,
							JSON.stringify({ sessionStart: Date.now(), sessionID }),
						);
						fs.renameSync(tmp, startFile);
					}
				} catch {
					/* fs */
				}

				// Write session state after every call so TUI gets fresh compression level
				await safeStageAsync(
					"writeSessionState",
					() =>
						writeSessionState(
							sessionID,
							directory,
							getCompressionLevel(sessionID),
						),
					undefined,
				);

				output.output = filtered;

				// De-escalate compression when context pressure eases
				deescalate(sessionID);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[OpenToken] tool.execute.after error: ${msg}`);
				// Never crash the pipeline — pass through original output
			}
		},

		// Custom MCP tools for diagnostics
		tool: {
			opentoken_stats: tool({
				description:
					"Show OpenToken token savings statistics — total saved, by tool, top savings",
				args: {
					since: tool.schema.string().optional(),
				},
				async execute(args, _context) {
					try {
						const sid = args.since === "all" ? undefined : sessionID;
						const summary = formatStatsSummary(sid);
						return { output: summary };
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { output: `Failed to get stats: ${msg}` };
					}
				},
			}),
			opentoken_health: tool({
				description:
					"Check OpenToken plugin health — error counts, stage failures, config status",
				args: {},
				async execute(_args, _context) {
					try {
						const errors = getErrorSummary();
						const lines: string[] = [];
						lines.push("🌸 opentoken health check");
						lines.push("");
						lines.push(`  Total errors: ${errors.total}`);
						if (errors.total > 0) {
							lines.push("");
							lines.push("  Errors by stage:");
							for (const [stage, count] of Object.entries(errors.byStage).sort(
								(a, b) => b[1] - a[1],
							)) {
								lines.push(`    ${stage}: ${count}`);
							}
							if (errors.recent.length > 0) {
								lines.push("");
								lines.push("  Recent errors:");
								for (const e of errors.recent.slice(-5)) {
									lines.push(
										`    [${new Date(e.ts).toLocaleTimeString()}] ${e.stage}: ${e.error.slice(0, 100)}`,
									);
								}
							}
						} else {
							lines.push("  No errors recorded ✅");
						}
						lines.push("");
						lines.push(
							`  Config: metrics=${config.enableMetrics}, symbols=${config.enableSymbolIndex}`,
						);
						lines.push(`  Context: ${getCompressionLevel(directory)}`);
						return { output: lines.join("\n") };
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { output: `Health check failed: ${msg}` };
					}
				},
			}),
		},

		// ─── PHASE 7: EXPERIMENTAL HOOKS ───
		// Kill switch: all disabled if enableHistoryCompression is false

		// Compress conversation messages before sending to LLM
		// MUST mutate in-place via splice (output.messages = newArray is a silent no-op)
		"experimental.chat.messages.transform": async (_input, output) => {
			if (!config.enableHistoryCompression) return;

			try {
				compressMessagesInPlace(output.messages, {
					window: config.historyCompressionWindow,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[OpenToken] chat.messages.transform error: ${msg}`);
			}
		},

		// Customize compaction prompt + write session memory
		"experimental.session.compacting": async (_input, _output) => {
			if (!config.enableHistoryCompression) return;

			// Native compaction freed context — reset escalation tracking
			resetContextUsed(sessionID);
		},

		// Cap output tokens to budget
		"chat.params": async (_input, output) => {
			if (!config.enableOutputSaving) return;
			output.maxOutputTokens = getOutputBudget();
		},

		// Compress model response text post-generation
		"experimental.text.complete": async (_input, output) => {
			if (!config.enableOutputSaving) return;
			try {
				const before = estimateTokens(output.text);
				const compressed = compressOutput(output.text);
				if (compressed !== output.text) {
					const after = estimateTokens(compressed);
					const saved = before - after;
					trackOutputTokensSaved(sessionID, saved);
					if (config.enableMetrics) {
						recordMetric({
							ts: new Date().toISOString(),
							tool: "assistant",
							family: "assistant",
							sessionID,
							before_tokens: before,
							after_tokens: after,
							saved_pct: before > 0 ? Math.round((saved / before) * 100) : 0,
							role: "assistant",
						});
					}
					output.text = compressed;
				}
			} catch {
				// Silent fail — never break output
			}
		},

		// Inject session memory into system prompt
		"experimental.chat.system.transform": async (input, output) => {
			try {
				// Output conciseness directive — fires independently of history compression
				if (config.enableOutputSaving) {
					output.system.push(getConcisenessDirective());
				}

				// Inject session memory if enabled — fires independently of history compression
				if (config.enableSessionMemory) {
					const stats = getMemoryStats();
					if (stats.total > 0 && directory) {
						const msg = input as { message?: { content?: string } };
						const keywords = msg?.message?.content
							? extractContextKeywords(msg.message.content)
							: [];
						const memoryPrompt = buildMemoryPrompt(directory, keywords);
						if (memoryPrompt) {
							output.system.push(memoryPrompt);
						}
					}
				}

				if (!config.enableHistoryCompression) return;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[OpenToken] chat.system.transform error: ${msg}`);
			}
		},
	};
};

export default OpenTokenPlugin;
