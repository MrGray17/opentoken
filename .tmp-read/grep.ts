import { applyAutoEscalation } from "../autoescalate";
import { config } from "../config";
import { filterGrep } from "../filters/grep";
import { compressLTSC } from "../ltsc";
import { compressLZW } from "../lzw";
import { progressiveDisclosure } from "../progressive";
import { abbreviateIdentifiers, applyReversibleCompression } from "../rewind";
import { redactSecrets } from "../utils/secrets";
import {
	cleanWhitespaceAndNulls,
	conservativeFilter,
	detectAndHandleBinary,
	foldRepeatedLines,
	minifyJSON,
	minimizeTableWhitespace,
	normalizeLogNoise,
	normalizeWhitespace,
	safeStage,
	safeStageAsync,
	shouldSkipFilter,
	stripThinkingBlocks,
	suppressOversized,
} from "./shared";
export async function applyGrepFilter(
	sessionID: string,
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

	if (shouldSkipFilter(output)) return output;

	output = safeStage(
		"cleanWhitespaceAndNulls",
		() => cleanWhitespaceAndNulls(output),
		output,
	);

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

	let filtered = safeStage("filterGrep", () => filterGrep(output), output);

	const disclosed = await safeStageAsync(
		"progressiveDisclosure",
		() => progressiveDisclosure(sessionID, filtered, "grep"),
		null,
	);
	if (disclosed) filtered = disclosed.result;

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
	const ltsc = safeStage("compressLTSC", () => compressLTSC(filtered), {
		compressed: false,
		result: filtered,
		savings: 0,
	});
	if (ltsc.compressed) filtered = ltsc.result;

	// LZW: Token substitution for repetitive content (stack traces, error logs)
	const lzw = safeStage("compressLZW", () => compressLZW(filtered), {
		compressed: false,
		result: filtered,
		savings: 0,
	});
	if (lzw.compressed) filtered = lzw.result;

	return conservativeFilter(output, filtered);
}
