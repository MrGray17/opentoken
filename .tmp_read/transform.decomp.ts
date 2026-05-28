import { updateContext } from "./autoescalate";
import { deduplicate } from "./dedup";
import { detectFamily } from "./families/detect";
import { validateToolName } from "./guards";
import { applyBashFilter } from "./pipelines/bash";
import { applyGlobFilter } from "./pipelines/glob";
import { applyGrepFilter } from "./pipelines/grep";
import { applyReadFilter } from "./pipelines/read";
import { trackTokensSaved, trackToolCall } from "./session";
import { recordMetric } from "./utils/metrics";
import { safeEstimateTokens } from "./wrappers";

export interface TransformOptions {
	sessionID?: string;
	enableMetrics?: boolean;
	enableDedup?: boolean;
}

export interface TransformResult {
	output: string;
	beforeTokens: number;
	afterTokens: number;
	saved: number;
}

export async function transformToolOutput(
	tool: string,
	command: string,
	output: string,
	opts: TransformOptions = {},
): Promise<TransformResult> {
	const toolName = validateToolName(tool);
	const sid = opts.sessionID ?? "";
	let filtered = output;
	const beforeTokens = safeEstimateTokens(output);

	switch (toolName) {
		case "bash":
			filtered = await applyBashFilter(sid, command, output);
			break;
		case "read":
			filtered = await applyReadFilter(sid, "", output);
			break;
		case "grep":
			filtered = await applyGrepFilter(sid, output);
			break;
		case "glob":
			filtered = await applyGlobFilter(sid, output);
			break;
	}

	if (opts.enableDedup !== false) {
		filtered = deduplicate(sid, filtered, toolName).result;
	}

	const afterTokens = safeEstimateTokens(filtered);
	const saved = beforeTokens - afterTokens;

	if (saved > 0 && sid) {
		trackTokensSaved(sid, saved);
		trackToolCall(sid);
		updateContext(sid, afterTokens);
	}

	if (opts.enableMetrics !== false && sid) {
		const family = toolName === "bash" ? detectFamily(command) : toolName;
		recordMetric({
			ts: new Date().toISOString(),
			tool: toolName,
			family,
			sessionID: sid,
			before_tokens: beforeTokens,
			after_tokens: afterTokens,
			saved_pct:
				beforeTokens > 0 ? Math.round((saved / beforeTokens) * 100) : 0,
		});
	}

	return { output: filtered, beforeTokens, afterTokens, saved };
}
