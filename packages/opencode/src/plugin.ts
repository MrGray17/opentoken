import {
	applyBashFilter,
	applyGlobFilter,
	applyGrepFilter,
	applyReadFilter,
	buildMemoryPrompt,
	cleanupOffloaded,
	cleanupRewind,
	compressMessagesInPlace,
	compressOutput,
	config,
	deduplicate,
	deescalate,
	detectFamily,
	ensureSessionStartFile,
	estimateTokens,
	extractContextKeywords,
	finalizeSession,
	formatStatsSummary,
	getCompressionLevel,
	getConcisenessDirective,
	getErrorSummary,
	getMemoryStats,
	getOutputBudget,
	getSessionTracker,
	getStatsSummary,
	hasErrors,
	indexDirectory,
	loadConfig,
	loadIndex,
	loadSessionSummary,
	logger,
	preCallFilter,
	recordMetric,
	resetContextUsed,
	resetDedup,
	resetEscalation,
	resetLSPState,
	resetSessionTracker,
	safeEstimateTokens,
	safeStage,
	safeStageAsync,
	saveStatsSummary,
	shouldBlockGlob,
	shouldBlockGrep,
	shouldBlockShellGrep,
	trackError,
	trackLSPUsage,
	trackOutputTokensSaved,
	trackTokensSaved,
	trackToolCall,
	updateContext,
	validateOutputSize,
	validateToolName,
	writeSessionStartFileAsync,
	writeSessionState,
} from "@mrgray17/opentoken-core";
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

// ─── OPENTOKEN TYPES (OpenCode-specific, not in core) ───

interface ToolInputBefore {
	tool: string;
	sessionID: string;
	callID: string;
}

interface ToolOutputBefore {
	args?: Record<string, unknown>;
	result?: string;
	error?: string;
}

interface ToolInputAfter {
	tool: string;
	sessionID: string;
	callID: string;
	args?: Record<string, unknown>;
}

interface ToolOutputAfter {
	title?: string;
	output?: string;
	metadata?: unknown;
}

// ─── HELPERS (shared by diagnostics) ───

function formatStatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
	return `${(n / 1000000).toFixed(1)}M`;
}

function computePerStageSuccess(): Record<string, number> {
	try {
		const errors = getErrorSummary();
		const totalStages = errors.total + 100;
		const result: Record<string, number> = {};
		for (const [stage, count] of Object.entries(errors.byStage)) {
			result[stage] = Math.max(0, 1 - count / Math.max(totalStages, count));
		}
		if (Object.keys(result).length === 0) {
			result.all = 1.0;
		}
		return result;
	} catch {
		return { all: 1.0 };
	}
}

// ─── MAIN PLUGIN ───

export const OpenTokenPlugin: Plugin = async ({ directory }) => {
	logger.info(undefined, undefined, "Plugin loading...");
	await loadConfig(directory);

	try {
		const localModule = await import("./local");
		if (localModule.default && typeof localModule.default === "object") {
			Object.assign(config, localModule.default);
			logger.info(undefined, undefined, "Local overrides applied");
		}
	} catch {
		/* local overrides not present */
	}

	logger.info(
		undefined,
		undefined,
		`Loaded. Symbol index: ${config.enableSymbolIndex}, Metrics: ${config.enableMetrics}`,
	);

	const sessionID = crypto.randomUUID();

	await writeSessionStartFileAsync(sessionID);

	await safeStageAsync(
		"loadSessionSummary",
		() => loadSessionSummary(directory),
		null,
	);

	if (config.enableSymbolIndex) {
		await safeStageAsync("loadIndex", () => loadIndex(), false);
	}

	return {
		"session.created": async () => {
			logger.info(
				sessionID,
				"session.created",
				"Session started — compression active",
			);
			await writeSessionStartFileAsync(sessionID);
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
						logger.info(
							sessionID,
							"symbolIndex",
							`Indexed ${stats.filesIndexed} files, ${stats.totalSymbols} symbols`,
						);
					})
					.catch((err) => {
						logger.error(
							sessionID,
							"symbolIndex",
							"Symbol indexing failed",
							err,
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

		"tool.execute.before": async (
			input: ToolInputBefore,
			output: ToolOutputBefore,
		) => {
			try {
				const toolName = validateToolName(input.tool);

				const result = preCallFilter(toolName, output.args || {}, {
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

				if (toolName === "grep" && typeof output.args?.pattern === "string") {
					const block = shouldBlockGrep(output.args.pattern);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}

				if (toolName === "glob" && typeof output.args?.pattern === "string") {
					const block = shouldBlockGlob(output.args.pattern);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}

				if (toolName === "bash" && typeof output.args?.command === "string") {
					const block = shouldBlockShellGrep(output.args.command);
					if (block.blocked) {
						output.result = `[OpenToken LSP-first] ${block.suggestion}`;
						return;
					}
				}
			} catch (err) {
				logger.error(
					sessionID,
					"tool.execute.before",
					"Pre-call hook failed",
					err,
				);
			}
		},

		"tool.execute.after": async (
			input: ToolInputAfter,
			output: ToolOutputAfter,
		) => {
			try {
				if (!output.output) return;

				if (hasErrors(output.output)) {
					trackError(sessionID, output.output);
				}

				const sizeCheck = validateOutputSize(output.output);
				if (!sizeCheck.valid) {
					output.output = `[OpenToken] ${sizeCheck.reason}`;
					return;
				}

				const beforeTokens = safeEstimateTokens(output.output);
				let filtered = output.output;
				const toolName = validateToolName(input.tool);

				trackToolCall(sessionID);
				trackLSPUsage(sessionID, directory, toolName);

				switch (toolName) {
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
						return;
				}

				const deduped = safeStage(
					"deduplicate",
					() => deduplicate(sessionID, filtered, toolName),
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
					toolName === "bash"
						? detectFamily(String(input.args?.command || ""))
						: toolName;

				if (config.enableMetrics) {
					await safeStageAsync(
						"recordMetric",
						() =>
							recordMetric({
								ts: new Date().toISOString(),
								tool: toolName,
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

				await ensureSessionStartFile(sessionID);

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

				deescalate(sessionID);
			} catch (err) {
				logger.error(
					sessionID,
					"tool.execute.after",
					"Post-call hook failed",
					err,
				);
			}
		},

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
					"Check OpenToken plugin health — error counts, stage failures, config status, compression effectiveness",
				args: {},
				async execute(_args, _context) {
					try {
						const errSummary = getErrorSummary();
						const stats = getStatsSummary();
						const lines: string[] = [];
						lines.push("🌸 opentoken health check");
						lines.push("");
						lines.push(`  Plugin status: active`);
						lines.push(`  Session: ${sessionID.slice(0, 8)}...`);
						lines.push(`  Compression: ${getCompressionLevel(sessionID)}`);
						lines.push("");
						lines.push(`  Total errors: ${errSummary.total}`);
						if (errSummary.total > 0) {
							lines.push("");
							lines.push("  Errors by stage:");
							for (const [stage, count] of Object.entries(
								errSummary.byStage,
							).sort((a, b) => b[1] - a[1])) {
								lines.push(`    ${stage}: ${count}`);
							}

							const spikeThreshold = 5;
							if (errSummary.recent.length >= spikeThreshold) {
								const recentCount = errSummary.recent.length;
								lines.push("");
								lines.push(
									`  ⚠ Failure spike detected: ${recentCount} errors in last ~5min`,
								);
							}

							if (errSummary.recent.length > 0) {
								lines.push("");
								lines.push("  Recent errors:");
								for (const e of errSummary.recent.slice(-5)) {
									lines.push(
										`    [${new Date(e.ts).toLocaleTimeString()}] ${e.stage}: ${e.error.slice(0, 100)}`,
									);
								}
							}
						} else {
							lines.push("  No errors recorded ✅");
						}
						lines.push("");
						lines.push("  Compression stats:");
						lines.push(`    Calls: ${stats.session.totalCalls}`);
						lines.push(
							`    Saved: ${formatStatTokens(stats.session.totalSavedTokens)} (${stats.session.avgSavedPct}%)`,
						);
						lines.push("");
						lines.push("  Per-stage success (last 100 calls):");
						const stageSuccess = computePerStageSuccess();
						for (const [stage, rate] of Object.entries(stageSuccess).sort(
							(a, b) => a[1] - b[1],
						)) {
							const icon = rate >= 0.99 ? "✅" : rate >= 0.9 ? "⚠" : "❌";
							lines.push(`    ${icon} ${stage}: ${(rate * 100).toFixed(0)}%`);
						}
						lines.push("");
						lines.push(
							`  Config: metrics=${config.enableMetrics}, symbols=${config.enableSymbolIndex}, history=${config.enableHistoryCompression}`,
						);
						return { output: lines.join("\n") };
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { output: `Health check failed: ${msg}` };
					}
				},
			}),
		},

		"experimental.chat.messages.transform": async (_input, output) => {
			if (!config.enableHistoryCompression) return;

			try {
				compressMessagesInPlace(output.messages, {
					window: config.historyCompressionWindow,
				});
			} catch (err) {
				logger.error(
					sessionID,
					"chat.messages.transform",
					"History compression failed",
					err,
				);
			}
		},

		"experimental.session.compacting": async (_input, _output) => {
			if (!config.enableHistoryCompression) return;
			resetContextUsed(sessionID);
		},

		"chat.params": async (_input, output) => {
			if (!config.enableOutputSaving) return;
			output.maxOutputTokens = getOutputBudget();
		},

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
			} catch (err) {
				logger.warn(
					sessionID,
					"text.complete",
					"Output compression failed",
					err,
				);
			}
		},

		"experimental.chat.system.transform": async (input, output) => {
			try {
				if (config.enableOutputSaving) {
					output.system.push(getConcisenessDirective());
				}

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
				logger.error(
					sessionID,
					"chat.system.transform",
					"System transform hook failed",
					err,
				);
			}
		},
	};
};

export default OpenTokenPlugin;
