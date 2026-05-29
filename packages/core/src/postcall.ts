// Post-call processors — clean/compress tool results AFTER execution
// #15 XML/Markdown block stripping (<antThinking>, <thinking>)
// #16 Binary detection (NUL byte scan, suppress)
// #17 Output suppression (>500KB → block entirely)
// #20 Key aliasing (replace long JSON keys with short aliases)
// #21 Whitespace/null cleanup (strip redundant fields, timestamps)
// #27 TOON format conversion (JSON arrays → tabular)
// #28 Aggressive whitespace normalization
// #29 Log normalization (timestamps, PIDs, elapsed time → static placeholders)
// #30 Table whitespace minimization (strip padding from CLI tables)
// #31 JSON minification (lossless whitespace removal)

// #32: ANSI escape sequence stripping — zero risk
// Strips color codes, cursor movements, and terminal control sequences
// that tokenizers count as real tokens but carry zero semantic value
// #35: JSON cleanup — remove null/empty values, deduplicate repeated values
export function cleanJsonValues(text: string): string {
	// Remove entire key-value pairs where value is null, empty, false or 0
	text = text.replace(/"[^"]+"\s*:\s*(null|""|"\[\]")/g, "");
	text = text.replace(/"[^"]+"\s*:\s*(false|0(?![0-9.eE+-])|\[\]|\{\})/g, "");
	// Clean up double commas and trailing commas
	text = text.replace(/,\s*,/g, ",");
	text = text.replace(/,\s*}/g, "}");
	text = text.replace(/\{\s*,/g, "{");
	return text;
}

// #33: File path shortening — strip common project root prefixes
// /home/user/project/src/foo/bar.ts → src/foo/bar.ts
let _projectRoot = "";
export function setProjectRoot(root: string): void {
	_projectRoot = root.endsWith("/") ? root.slice(0, -1) : root;
}

export function shortenPaths(text: string): string {
	if (!_projectRoot || _projectRoot.length < 4) return text;
	const rootPrefix = _projectRoot + "/";
	const lines = text.split("\n");
	const result: string[] = [];
	for (const line of lines) {
		result.push(line.split(rootPrefix).join("./"));
	}
	return result.join("\n");
}

// #34: Directory grouping — collapse repeated file paths in listings
// src/a.ts\nsrc/b.ts\nsrc/c.ts → src/ (3 files): a.ts, b.ts, c.ts
export function groupByDirectory(text: string): string {
	const lines = text.split("\n");
	if (lines.length < 3) return text;

	// Match lines that contain file paths
	const pathPattern = /^\s*([^\s]+\/[^\s]+)/;
	const dirs = new Map<string, string[]>();

	for (const line of lines) {
		const m = line.match(pathPattern);
		if (!m) continue;
		const fullPath = m[1];
		const lastSlash = fullPath.lastIndexOf("/");
		if (lastSlash === -1) continue;
		const dir = fullPath.slice(0, lastSlash);
		const file = fullPath.slice(lastSlash + 1);
		if (!dirs.has(dir)) dirs.set(dir, []);
		const bucket = dirs.get(dir);
		if (bucket) bucket.push(file);
	}

	// Only group directories with 3+ files
	let grouped = text;
	for (const [dir, files] of dirs) {
		if (files.length < 3) continue;
		const summary = `${dir}/ (${files.length} files): ${files.join(", ")}`;
		// Replace first occurrence of each file in this dir with the summary
		let first = true;
		for (const f of files) {
			const fullPath = dir + "/" + f;
			if (first) {
				grouped = grouped.split(fullPath).join(summary);
				first = false;
			} else {
				grouped = grouped.split(fullPath).join("");
			}
		}
	}

	// Clean up double spaces and empty lines
	return grouped.replace(/ {2,}/g, " ").replace(/\n\n\n+/g, "\n\n");
}

export function stripAnsi(text: string): string {
	return text.replace(
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);
}

// #15: Strip reasoning/thinking blocks
const THINKING_BLOCKS: RegExp[] = [
	/<antThinking>[\s\S]*?<\/antThinking>/g,
	/<thinking>[\s\S]*?<\/thinking>/g,
	/<reasoning>[\s\S]*?<\/reasoning>/g,
	/<scratchpad>[\s\S]*?<\/scratchpad>/g,
	/<inner_monologue>[\s\S]*?<\/inner_monologue>/g,
];

export function stripThinkingBlocks(text: string): string {
	let result = text;
	for (const pattern of THINKING_BLOCKS) {
		result = result.replace(pattern, "");
	}
	// Clean up double newlines left behind
	return result.replace(/\n{3,}/g, "\n\n").trim();
}

// #16: Binary detection via NUL byte scan
function isBinaryOutput(text: string): boolean {
	// Check first 64KB for NUL bytes (expanded from 8KB for better detection)
	const sample = text.slice(0, 65536);
	const nulCount = (sample.match(/\0/g) || []).length;
	return nulCount > 3; // More than 3 NUL bytes = binary
}

export function detectAndHandleBinary(text: string): {
	binary: boolean;
	result: string;
} {
	if (isBinaryOutput(text)) {
		// Try to extract any text content — UTF-8 safe
		// Strip control chars but preserve valid UTF-8 sequences
		const textContent = text.replace(
			/[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,
			"",
		);
		if (textContent.trim().length < text.length * 0.1) {
			return {
				binary: true,
				result: "[Binary output suppressed — no text content]",
			};
		}
		return {
			binary: true,
			result: `[Binary output — ${text.length} bytes, ${Math.round((textContent.length / text.length) * 100)}% text]`,
		};
	}
	return { binary: false, result: text };
}

// #17: Output suppression — block entirely if too large
export function suppressOversized(
	text: string,
	maxBytes: number,
): {
	suppressed: boolean;
	result: string;
} {
	const byteLen = Buffer.byteLength(text, "utf8");
	if (byteLen > maxBytes) {
		return {
			suppressed: true,
			result: `[Output suppressed: ${Math.round(byteLen / 1024)}KB exceeds ${Math.round(maxBytes / 1024)}KB limit — use targeted queries instead]`,
		};
	}
	return { suppressed: false, result: text };
}

// #20: Key aliasing — replace long JSON keys with short aliases + legend prefix
const KEY_MAP: Record<string, string> = {
	description: "desc",
	documentation: "docs",
	configuration: "config",
	dependencies: "deps",
	devDependencies: "dd",
	authentication: "auth",
	authorization: "authz",
	implementation: "impl",
	information: "info",
	environment: "env",
	development: "dev",
	production: "prod",
	directory: "dir",
	context: "ctx",
	identifier: "id",
	reference: "ref",
	application: "app",
	component: "comp",
	namespace: "ns",
	repository: "repo",
	parameter: "param",
	property: "prop",
};

export function aliasJsonKeys(text: string): string {
	if (!text.includes("{") || !text.includes("}")) return text;

	let replacements = 0;
	const result = text.replace(
		/(?<=[{,]\s*)"([a-zA-Z_]\w*)"\s*:/g,
		(match, key) => {
			const alias = KEY_MAP[key];
			if (alias) {
				replacements++;
				return `"${alias}":`;
			}
			return match;
		},
	);
	if (replacements === 0) return text;

	// Prepend compact legend so model can decode aliased keys
	const legend =
		"<!--K:" +
		Object.entries(KEY_MAP)
			.map(([k, v]) => `${v}=${k}`)
			.join(",") +
		"-->\n";
	return legend + result;
}

// #22: URL shortening — strip query params + hash from long URLs
export function shortenUrls(text: string): string {
	// Match URLs and check total length in callback
	return text.replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
		if (url.length <= 100) return url; // Skip short URLs
		try {
			const parsed = new URL(url);
			// Keep only origin + pathname
			return parsed.origin + parsed.pathname;
		} catch {
			return url; // Invalid URL, leave as-is
		}
	});
}

// #23: Base64 inline content stripping
export function stripBase64Content(text: string): string {
	// Replace data:...;base64,... with placeholder
	return text.replace(
		/data:[^;]+;base64,[A-Za-z0-9+/=]+/g,
		"[base64 content stripped]",
	);
}

// #21: Whitespace/null cleanup — strip redundant fields
const NULLISH_PATTERNS: RegExp[] = [
	/,\s*"[^"]*"\s*:\s*null/g,
	/,\s*"[^"]*"\s*:\s*""/g,
	/,\s*"[^"]*"\s*:\s*\[\s*\]/g,
	/,\s*"[^"]*"\s*:\s*\{\s*\}/g,
];

const TIMESTAMP_PATTERNS: RegExp[] = [
	/,\s*"(created_at|updated_at|deleted_at|modified_at|timestamp|ts|date|time|datetime|createdOn|updatedOn|createdAt|updatedAt)"\s*:\s*"[^"]*"/g,
	/,\s*"(created_at|updated_at|deleted_at|modified_at|timestamp|ts|date|time|datetime|createdOn|updatedOn|createdAt|updatedAt)"\s*:\s*\d+/g,
];

const REDUNDANT_PATTERNS: RegExp[] = [
	/,\s*"(hash|checksum|signature|digest)"\s*:\s*"[a-f0-9]{20,}"/g,
	/,\s*"(_links|_embedded|_meta|pagination|page_info)"\s*:\s*\{[^}]*\}/g,
];

export function cleanWhitespaceAndNulls(text: string): string {
	if (!text.includes("{") || !text.includes("}")) return text;

	let result = text;

	// Strip null/empty values
	for (const pattern of NULLISH_PATTERNS) {
		result = result.replace(pattern, "");
	}

	// Strip timestamps (saves tokens, usually not needed for coding)
	for (const pattern of TIMESTAMP_PATTERNS) {
		result = result.replace(pattern, "");
	}

	// Strip redundant fields (IDs, hashes, links, versions, types)
	for (const pattern of REDUNDANT_PATTERNS) {
		result = result.replace(pattern, "");
	}

	// Clean up trailing commas, double commas, and extra whitespace
	result = result.replace(/,(\s*,)+/g, ",");
	result = result.replace(/,\s*}/g, "}");
	result = result.replace(/,\s*]/g, "]");
	result = result.replace(/\{\s*,/g, "{");
	result = result.replace(/\[\s*,/g, "[");

	return result;
}

// Aggressive whitespace normalization — 5-15% savings, zero quality risk
// Collapses multiple newlines, strips trailing whitespace, normalizes tabs
export function normalizeWhitespace(text: string): string {
	let result = text;

	// Collapse 3+ newlines into 2 (preserve paragraph breaks)
	result = result.replace(/\n{3}/g, "\n\n");

	// Strip trailing whitespace on each line
	result = result.replace(/[ \t]+$/gm, "");

	// Normalize tabs to 2 spaces (tabs tokenize poorly)
	result = result.replace(/\t/g, "  ");

	// Strip leading blank lines
	result = result.replace(/^\n+/, "");

	// Strip trailing blank lines
	result = result.replace(/\n+$/, "");

	return result;
}

// #29: Log normalization — replace dynamic runtime noise with static placeholders
// Enables provider-side prompt caching (90% discount on cached input tokens)
// Zero quality risk: timestamps, PIDs, and elapsed times are never used for execution
export function normalizeLogNoise(text: string): string {
	let result = text;

	// Timestamps: [2026-05-21 15:53:32.412] → [TIMESTAMP]
	// ISO format: 2026-05-21T15:53:32.412Z → [TIMESTAMP]
	// Common log format: 21/May/2026:15:53:32 +0000 → [TIMESTAMP]
	result = result.replace(
		/\[\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]/g,
		"[TIMESTAMP]",
	);
	result = result.replace(
		/\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
		"[TIMESTAMP]",
	);

	// PIDs: PID 29482, pid: 12345, (12345) → [PID]
	result = result.replace(/\b[Pp][Ii][Dd]\s*\d+/g, "[PID]");
	result = result.replace(/\(\d{4,}\)/g, "([PID])");

	// Elapsed time: passed in 42ms → passed in [X]ms, 4.234s → [X]s
	result = result.replace(/(\d+(?:\.\d+)?)\s*ms/g, "[X]ms");
	result = result.replace(/(\d+(?:\.\d+)?)\s*s\b/g, "[X]s");

	// Memory sizes: 1.234 MB → [X]MB, 512 KB → [X]KB
	result = result.replace(/(\d+(?:\.\d+)?)\s*(?:MB|KB|GB|TB)/gi, "[X]$2");

	return result;
}

// #30: Table whitespace minimization — strip padding from CLI tables
// Zero quality risk: purely visual formatting, all data values preserved
export function minimizeTableWhitespace(text: string): string {
	const lines = text.split("\n");
	const result: string[] = [];

	for (const line of lines) {
		// Detect table lines: lines with multiple | separators
		if ((line.match(/\|/g) || []).length >= 2) {
			// Strip whitespace between | separators: |  id  |  name  | → |id|name|
			const minimized = line.replace(/\|\s*/g, "|").replace(/\s*\|/g, "|");
			result.push(minimized);
		} else {
			result.push(line);
		}
	}

	return result.join("\n");
}

// #31: JSON minification — lossless whitespace removal
// Zero quality risk: LLMs read minified JSON perfectly
export function minifyJSON(text: string): string {
	if (!text.includes("{") && !text.includes("[")) return text;

	// Try to find and minify JSON blocks
	// First, try the entire text as JSON
	try {
		const parsed = JSON.parse(text);
		return JSON.stringify(parsed);
	} catch {
		/* not a single JSON block */
	}

	// Try to find JSON objects/arrays in the text and minify them
	let result = text;
	let changed = true;
	let iterations = 0;
	const MAX_ITERATIONS = 20;

	while (changed && iterations < MAX_ITERATIONS) {
		changed = false;
		iterations++;

		// Find JSON objects: { ... }
		result = result.replace(/\{[^{}]*\}/g, (match) => {
			try {
				const parsed = JSON.parse(match);
				const minified = JSON.stringify(parsed);
				if (minified.length < match.length) {
					changed = true;
					return minified;
				}
			} catch {
				/* not valid JSON */
			}
			return match;
		});

		// Find JSON arrays: [ ... ]
		result = result.replace(/\[[^[\]]*\]/g, (match) => {
			try {
				const parsed = JSON.parse(match);
				const minified = JSON.stringify(parsed);
				if (minified.length < match.length) {
					changed = true;
					return minified;
				}
			} catch {
				/* not valid JSON */
			}
			return match;
		});
	}

	return result;
}

// Line-level repetition folding — collapse consecutive identical lines
// 0-risk: count preserved, pattern unambiguous, reversible from context
export function foldRepeatedLines(text: string): string {
	const lines = text.split("\n");
	if (lines.length < 3) return text;

	const result: string[] = [];
	let i = 0;

	while (i < lines.length) {
		// Check for alternating 2-line pattern ABAB (4+ lines)
		if (
			i + 3 < lines.length &&
			lines[i] === lines[i + 2] &&
			lines[i + 1] === lines[i + 3] &&
			lines[i] !== lines[i + 1]
		) {
			const a = lines[i];
			const b = lines[i + 1];
			let count = 2;
			let j = i + 4;
			while (j + 1 < lines.length && lines[j] === a && lines[j + 1] === b) {
				count++;
				j += 2;
			}
			result.push(`${count}× [${a}, ${b}]`);
			i = j;
			continue;
		}

		// Check for run of identical lines (2+)
		if (i + 1 < lines.length && lines[i] === lines[i + 1]) {
			const line = lines[i];
			let count = 2;
			let j = i + 2;
			while (j < lines.length && lines[j] === line) {
				count++;
				j++;
			}
			result.push(`${count}× ${line}`);
			i = j;
			continue;
		}

		result.push(lines[i]);
		i++;
	}

	return result.join("\n");
}
