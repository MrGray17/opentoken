// Grep result filter — collapse duplicates, trim to match + context

const NOISE_PATTERNS = [
	/node_modules\//,
	/\.git\//,
	/dist\//,
	/build\//,
	/\.cache\//,
	/__pycache__\//,
	/\.venv\//,
	/coverage\//,
	/\.next\//,
	/\.nuxt\//,
	/\.svelte-kit\//,
	/\.turbo\//,
	/vendor\//,
	/\.min\./,
];

const MAX_MATCHES_PER_FILE = 10;
const MAX_MATCH_LINE_LENGTH = 120;

interface GrepMatch {
	file: string;
	lineNum: string;
	content: string;
}

// Parse rg --json line format
function parseRgJsonLine(line: string): GrepMatch | null {
	try {
		const parsed = JSON.parse(line);
		if (
			parsed.type === "match" &&
			parsed.data?.path?.text &&
			parsed.data?.line_number != null
		) {
			return {
				file: parsed.data.path.text,
				lineNum: String(parsed.data.line_number),
				content:
					parsed.data.lines?.text?.trim() ??
					parsed.data.submatches
						?.map((s: { match: { text: string } }) => s.match.text)
						.join(" ") ??
					"",
			};
		}
	} catch {
		// Not valid JSON
	}
	return null;
}

export function filterGrep(output: string): string {
	const lines = output.split("\n");
	const matches: Map<string, string[]> = new Map();

	// Detect rg --json format (first line is valid JSON with type field)
	const isRgJson = lines.length > 0 && parseRgJsonLine(lines[0]) !== null;

	if (isRgJson) {
		// Parse rg --json format
		for (const line of lines) {
			const parsed = parseRgJsonLine(line);
			if (!parsed) continue;
			if (NOISE_PATTERNS.some((p) => p.test(parsed.file))) continue;

			let fileMatches = matches.get(parsed.file);
			if (!fileMatches) {
				fileMatches = [];
				matches.set(parsed.file, fileMatches);
			}
			if (fileMatches.length < MAX_MATCHES_PER_FILE) {
				let content = parsed.content;
				if (content.length > MAX_MATCH_LINE_LENGTH) {
					content = content.slice(0, MAX_MATCH_LINE_LENGTH) + "...";
				}
				fileMatches.push(`${parsed.lineNum}: ${content}`);
			}
		}
	} else {
		// Parse standard grep output or rg --vimgrep format: "file:line:content" or "file:line-col:content"
		for (const line of lines) {
			// Skip noise directories
			if (NOISE_PATTERNS.some((p) => p.test(line))) continue;

			// Parse: "file:line:content" or "file:line:col:content" (vimgrep)
			const match = line.match(/^([^:]+):(\d+)(?::(\d+))?:?(.*)$/);
			if (!match) continue;

			const [, file, lineNum, , content] = match;
			if (!matches.has(file)) matches.set(file, []);

			let fileMatches = matches.get(file);
			if (!fileMatches) {
				fileMatches = [];
				matches.set(file, fileMatches);
			}
			if (fileMatches.length < MAX_MATCHES_PER_FILE) {
				let trimmed = content;
				if (trimmed.length > MAX_MATCH_LINE_LENGTH) {
					trimmed = trimmed.slice(0, MAX_MATCH_LINE_LENGTH) + "...";
				}
				fileMatches.push(`${lineNum}: ${trimmed}`);
			}
		}
	}

	if (matches.size === 0) {
		return "(no matches)";
	}

	// Build grouped display: collapse files in same directory (3+ files)
	const dirs = new Map<string, string[]>();
	for (const file of matches.keys()) {
		const lastSlash = file.lastIndexOf("/");
		const dir = lastSlash === -1 ? "." : file.slice(0, lastSlash);
		if (!dirs.has(dir)) dirs.set(dir, []);
		dirs.get(dir)?.push(file);
	}

	let totalMatches = 0;
	let result = "";

	for (const [dir, files] of dirs) {
		if (files.length >= 3) {
			const names = files.map((f) => f.slice(f.lastIndexOf("/") + 1));
			result += `${dir}/ (${files.length} files: ${names.join(", ")}):\n`;
			for (const file of files) {
				const fileMatches = matches.get(file);
				if (!fileMatches) continue;
				totalMatches += fileMatches.length;
				result += `  ${file.slice(file.lastIndexOf("/") + 1)}:\n`;
				for (const m of fileMatches) {
					result += `    ${m}\n`;
				}
			}
		} else {
			for (const file of files) {
				const fileMatches = matches.get(file);
				if (!fileMatches) continue;
				totalMatches += fileMatches.length;
				result += `${file}:\n`;
				for (const m of fileMatches) {
					result += `  ${m}\n`;
				}
				if (fileMatches.length >= MAX_MATCHES_PER_FILE) {
					result += `  ... more matches\n`;
				}
			}
		}
		result += "\n";
	}

	return `${dirs.size} files in ${dirs.size === 1 ? "1 dir" : `${dirs.size} dirs`}, ${totalMatches} matches:\n\n${result.trim()}`;
}
