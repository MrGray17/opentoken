import { applyAutoEscalation } from "../autoescalate";
import { isStageWorthwhile } from "../autotune";
import { config } from "../config";
import { filterCargoOutput } from "../families/cargo";
import { detectFamily } from "../families/detect";
import { filterDockerOutput } from "../families/docker";
import { filterFsOutput } from "../families/fs";
import { filterGeneric } from "../families/generic";
import { filterGitOutput } from "../families/git";
import { filterMakeOutput } from "../families/make";
import { filterNpmOutput } from "../families/npm";
import { filterPipOutput } from "../families/pip";
import { filterTestOutput } from "../families/test";
import { filterGrep } from "../filters/grep";
import { filterRead, SOURCE_EXTENSIONS } from "../filters/read";
import { foldDiffAndLogs } from "../folding";
import { sampleJson } from "../jsonsample";
import { compressLTSC } from "../ltsc";
import { compressLZW } from "../lzw";
import { abbreviateIdentifiers, applyReversibleCompression } from "../rewind";
import { convertToTOON } from "../toon";
import { getCachedRead, setCachedRead } from "../utils/cache";
import { redactSecrets } from "../utils/secrets";
import {
	aliasJsonKeys,
	cleanWhitespaceAndNulls,
	conservativeFilter,
	detectAndHandleBinary,
	foldRepeatedLines,
	minifyJSON,
	minimizeTableWhitespace,
	normalizeLogNoise,
	normalizeWhitespace,
	routeContent,
	safeStage,
	safeStageAsync,
	shouldSkipFilter,
	stripAnsi,
	stripThinkingBlocks,
	suppressOversized,
} from "./shared";
export async function applyBashFilter(
	sessionID: string,
	command: string,
	output: string,
): Promise<string> {
	output = safeStage("redactSecrets", () => redactSecrets(output), output);

	const binary = safeStage(
		"detectAndHandleBinary",
		() => detectAndHandleBinary(output),
		{ binary: false, result: output },
	);
	if (binary.binary) return binary.result;

	const suppressed = safeStage(
		"suppressOversized",
		() => suppressOversized(output, config.maxOutputBytes),
		{ suppressed: false, result: output },
	);
	if (suppressed.suppressed) return suppressed.result;

	output = safeStage(
		"stripThinkingBlocks",
		() => stripThinkingBlocks(output),
		output,
	);

	// ANSI escape stripping — zero risk, applies even on short outputs
	output = safeStage("stripAnsi", () => stripAnsi(output), output);

	if (shouldSkipFilter(output)) return output;

	output = safeStage(
		"cleanWhitespaceAndNulls",
		() => cleanWhitespaceAndNulls(output),
		output,
	);

	output = safeStage("aliasJsonKeys", () => aliasJsonKeys(output), output);

	// TOON format conversion for JSON arrays
	const toon = safeStage("convertToTOON", () => convertToTOON(output), {
		converted: false,
		result: output,
	});
	if (toon.converted) output = toon.result;

	// Aggressive whitespace normalization
	output = safeStage(
		"normalizeWhitespace",
		() => normalizeWhitespace(output),
		output,
	);

	// Line-level repetition folding — collapse consecutive identical lines
	output = safeStage(
		"foldRepeatedLines",
		() => foldRepeatedLines(output),
		output,
	);

	// JSON minification (lossless whitespace removal)
	output = safeStage("minifyJSON", () => minifyJSON(output), output);

	// Table whitespace minimization (strip padding from CLI tables)
	output = safeStage(
		"minimizeTableWhitespace",
		() => minimizeTableWhitespace(output),
		output,
	);

	// Log normalization (timestamps, PIDs, elapsed time → static placeholders)
	output = safeStage(
		"normalizeLogNoise",
		() => normalizeLogNoise(output),
		output,
	);

	const { pipeline } = routeContent(output);

	if (pipeline.includes("diff-fold") || pipeline.includes("log-fold")) {
		output = await safeStageAsync(
			"foldDiffAndLogs",
			() => foldDiffAndLogs(output),
			output,
		);
	}

	if (pipeline.includes("json-sample")) {
		const sampled = safeStage("sampleJson", () => sampleJson(output), {
			sampled: false,
			result: output,
		});
		if (sampled.sampled) output = sampled.result;
	}

	const family = safeStage(
		"detectFamily",
		() => detectFamily(command),
		"generic",
	);
	let filtered: string;

	// Route bash grep/rg/ag/ack commands to grep filter instead of family filter
	const isGrepCommand = /\b(grep|rg|ag|ack)\b/.test(command);
	if (isGrepCommand) {
		filtered = safeStage("filterGrep", () => filterGrep(output), output);
	} else {
		switch (family) {
			case "git":
				filtered = safeStage(
					"filterGitOutput",
					() => filterGitOutput(command, output),
					output,
				);
				break;
			case "npm":
				filtered = safeStage(
					"filterNpmOutput",
					() => filterNpmOutput(command, output),
					output,
				);
				break;
			case "cargo":
				filtered = safeStage(
					"filterCargoOutput",
					() => filterCargoOutput(command, output),
					output,
				);
				break;
			case "test":
				filtered = safeStage(
					"filterTestOutput",
					() => filterTestOutput(command, output),
					output,
				);
				break;
			case "fs": {
				// Route `cat <source_file>` through the read pipeline for skeleton extraction.
				// Guard: no flags, pipes, redirects, globs, or multiple files — only cat <path>.
				const catReadMatch = command.match(
					/^\s*cat\s+(?!-)([^\s|&;>'<*"]+)\s*$/,
				);
				if (catReadMatch) {
					const catPath = catReadMatch[1];
					// Cross-tool dedup: if read tool already showed this file, point to it
					const cachedRead = getCachedRead(sessionID, catPath);
					if (cachedRead !== null) {
						filtered = `[Contents of ${catPath} already shown via read — see earlier result]`;
						break;
					}
					const ext = `.${catPath.split(".").pop()?.toLowerCase() || ""}`;
					if (SOURCE_EXTENSIONS.includes(ext)) {
						filtered = safeStage(
							"filterRead",
							() => filterRead(catPath, output),
							output,
						);
						// Cache the skeleton for future cat/read dedup
						setCachedRead(sessionID, catPath, filtered);
						break;
					}
				}
				// Route read-only fs tools through generic for better head+tail preservation.
				// Cat (non-source), wc, du, df benefit from generic's head(20)+tail(20) over fs's prefix-only truncation.
				// Diff, sort, uniq stay in fs — their output is order-sensitive and needs full visibility.
				if (/^\s*(wc|du|df)\s/.test(`${command} `)) {
					filtered = safeStage(
						"filterGeneric",
						() => filterGeneric(output),
						output,
					);
				} else {
					filtered = safeStage(
						"filterFsOutput",
						() => filterFsOutput(command, output),
						output,
					);
				}
				break;
			}
			case "docker":
				filtered = safeStage(
					"filterDockerOutput",
					() => filterDockerOutput(command, output),
					output,
				);
				break;
			case "pip":
				filtered = safeStage(
					"filterPipOutput",
					() => filterPipOutput(command, output),
					output,
				);
				break;
			case "make":
				filtered = safeStage(
					"filterMakeOutput",
					() => filterMakeOutput(command, output),
					output,
				);
				break;
			default:
				filtered = safeStage(
					"filterGeneric",
					() => filterGeneric(output),
					output,
				);
		}
	}

	const reversible = await safeStageAsync(
		"applyReversibleCompression",
		() => applyReversibleCompression(sessionID, filtered),
		{ result: filtered, compressed: false },
	);
	if (reversible.compressed) {
		filtered = reversible.result;
	}

	filtered = safeStage(
		"applyAutoEscalation",
		() => applyAutoEscalation(filtered),
		filtered,
	);

	// Semantic abbreviation — replace long repeated identifiers with $N$ markers
	filtered = safeStage(
		"abbreviateIdentifiers",
		() => abbreviateIdentifiers(sessionID, filtered),
		filtered,
	);

	// LTSC: Lossless Token Sequence Compression (LZ77-style, 18-27% savings)
	// Only run if autotune says it's worthwhile for this command family
	if (isStageWorthwhile(family)) {
		const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), {
			compressed: false,
			result: filtered,
			savings: 0,
		});
		if (ltsc.compressed) filtered = ltsc.result;
	}

	// LZW: Token substitution for repetitive content (stack traces, error logs)
	if (isStageWorthwhile(family, 0.05)) {
		const lzw = safeStage("compressLZW", () => compressLZW(filtered), {
			compressed: false,
			result: filtered,
			savings: 0,
		});
		if (lzw.compressed) filtered = lzw.result;
	}

	return conservativeFilter(output, filtered);
}
