import { applyAutoEscalation } from "../autoescalate";
import { config } from "../config";
import { filterRead } from "../filters/read";
import { sanitizeFilePath } from "../guards";
import { sampleJson } from "../jsonsample";
import { compressLTSC } from "../ltsc";
import { compressLZW } from "../lzw";
import { progressiveDisclosure } from "../progressive";
import { abbreviateIdentifiers, applyReversibleCompression } from "../rewind";
import { trackFile } from "../session";
import { extractSkeleton } from "../skeleton";
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
	stripThinkingBlocks,
	suppressOversized,
} from "./shared";
export async function applyReadFilter(
	sessionID: string,
	filePath: string,
	content: string,
): Promise<string> {
	const pathCheck = sanitizeFilePath(filePath, config.safeReadRoot);
	if (!pathCheck.safe) {
		return `[OpenToken] ${pathCheck.reason}`;
	}

	content = safeStage("redactSecrets", () => redactSecrets(content), content);

	trackFile(sessionID, filePath);

	const cached = await safeStageAsync(
		"getCachedRead",
		() => getCachedRead(sessionID, filePath),
		null,
	);
	if (cached !== null) {
		return cached;
	}

	const binary = safeStage(
		"detectAndHandleBinary",
		() => detectAndHandleBinary(content),
		{ binary: false, result: content },
	);
	if (binary.binary) return binary.result;

	const suppressed = safeStage(
		"suppressOversized",
		() => suppressOversized(content, config.maxOutputBytes),
		{ suppressed: false, result: content },
	);
	if (suppressed.suppressed) return suppressed.result;

	content = safeStage(
		"stripThinkingBlocks",
		() => stripThinkingBlocks(content),
		content,
	);

	if (shouldSkipFilter(content)) {
		await safeStageAsync(
			"setCachedRead",
			() => setCachedRead(sessionID, filePath, content),
			undefined,
		);
		return content;
	}

	content = safeStage(
		"cleanWhitespaceAndNulls",
		() => cleanWhitespaceAndNulls(content),
		content,
	);

	content = safeStage("aliasJsonKeys", () => aliasJsonKeys(content), content);

	// TOON format conversion for JSON arrays
	const toon = safeStage("convertToTOON", () => convertToTOON(content), {
		converted: false,
		result: content,
	});
	if (toon.converted) content = toon.result;

	// Aggressive whitespace normalization
	content = safeStage(
		"normalizeWhitespace",
		() => normalizeWhitespace(content),
		content,
	);

	// Line-level repetition folding — collapse consecutive identical lines
	content = safeStage(
		"foldRepeatedLines",
		() => foldRepeatedLines(content),
		content,
	);

	// JSON minification (lossless whitespace removal)
	content = safeStage("minifyJSON", () => minifyJSON(content), content);

	// Table whitespace minimization (strip padding from CLI tables)
	content = safeStage(
		"minimizeTableWhitespace",
		() => minimizeTableWhitespace(content),
		content,
	);

	// Log normalization (timestamps, PIDs, elapsed time → static placeholders)
	content = safeStage(
		"normalizeLogNoise",
		() => normalizeLogNoise(content),
		content,
	);

	const { pipeline } = routeContent(content, filePath);

	if (pipeline.includes("skeleton") && content.split("\n").length > 50) {
		const skeleton = await safeStageAsync(
			"extractSkeleton",
			() => extractSkeleton(filePath, content),
			content,
		);
		if (skeleton) {
			content = skeleton;
		}
	}

	if (pipeline.includes("json-sample")) {
		const sampled = safeStage("sampleJson", () => sampleJson(content), {
			sampled: false,
			result: content,
		});
		if (sampled.sampled) content = sampled.result;
	}

	let filtered = safeStage(
		"filterRead",
		() => filterRead(filePath, content),
		content,
	);

	const disclosed = await safeStageAsync(
		"progressiveDisclosure",
		() => progressiveDisclosure(sessionID, filtered, "read"),
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

	await safeStageAsync(
		"setCachedRead",
		() => setCachedRead(sessionID, filePath, filtered),
		undefined,
	);

	return conservativeFilter(content, filtered);
}

// ─── GREP FILTER PIPELINE ───
