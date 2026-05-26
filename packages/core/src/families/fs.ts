// Filesystem commands filter — ls, find, tree, etc.

const NOISE_DIRS = [
	"node_modules",
	".git",
	"dist",
	"build",
	".cache",
	"__pycache__",
	".venv",
	"venv",
	".next",
	".nuxt",
	".svelte-kit",
	"target",
	"coverage",
	".turbo",
	".parcel-cache",
];

export function filterLs(output: string): string {
	const lines = output.split("\n").filter(Boolean);
	const dirs: string[] = [];
	const files: string[] = [];

	for (const line of lines) {
		// Skip noise directories
		if (NOISE_DIRS.some((d) => line.includes(d))) continue;
		if (line.endsWith("/")) dirs.push(line);
		else files.push(line);
	}

	let result = "";
	if (dirs.length > 0) {
		result += `Dirs (${dirs.length}):\n${dirs.slice(0, 30).join("\n")}\n`;
		if (dirs.length > 30) result += `... and ${dirs.length - 30} more\n`;
	}
	if (files.length > 0) {
		result += `Files (${files.length}):\n${files.slice(0, 50).join("\n")}\n`;
		if (files.length > 50) result += `... and ${files.length - 50} more`;
	}

	return result || "(empty)";
}

export function filterFind(output: string): string {
	const lines = output.split("\n").filter(Boolean);
	const filtered = lines.filter(
		(l) =>
			!NOISE_DIRS.some((d) => l.includes(`/${d}/`) || l.startsWith(`${d}/`)),
	);

	if (filtered.length <= 100) {
		return filtered.join("\n") || "(empty)";
	}

	// Group by top-level directory
	const groups: Record<string, number> = {};
	for (const line of filtered) {
		const top = line.split("/")[0] || ".";
		groups[top] = (groups[top] || 0) + 1;
	}

	const limit = 10;
	let result = `${filtered.length} files:\n`;
	const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
	for (const [dir, count] of sorted.slice(0, limit)) {
		result += `  ${dir}/: ${count}\n`;
	}
	if (sorted.length > limit) {
		result += `  ... and ${sorted.length - limit} more directories`;
	}

	return result;
}

export function filterTree(output: string): string {
	const lines = output.split("\n");
	// Limit depth to 3 levels, collapse empty dirs
	const filtered = lines.filter((l) => {
		// Count indentation level (2 chars per level typically)
		const depth = l.search(/\S/);
		if (depth === -1) return false;
		return depth <= 6; // ~3 levels
	});

	// When tree is very broad (>80 lines), switch to head+tail preservation
	// This preserves the structure at both ends without dumping a massive wall of text
	const MAX_TREE_LINES = 80;
	if (filtered.length > MAX_TREE_LINES) {
		const head = filtered.slice(0, 40);
		const tail = filtered.slice(-40);
		const skipped = filtered.length - 80;
		return (
			head.join("\n") +
			`\n  ... ${skipped} entries omitted ...\n` +
			tail.join("\n")
		);
	}

	// Add summary line if present
	const summaryLine = lines.find(
		(l) => /^\d+ director/.test(l) || /^\d+ file/.test(l),
	);
	if (summaryLine) {
		filtered.push(summaryLine);
	}

	return filtered.join("\n") || output;
}

export function filterFsOutput(command: string, output: string): string {
	let result = output;
	if (command.startsWith("ls") || command.includes(" ls "))
		result = filterLs(output);
	else if (command.startsWith("find") || command.includes(" find "))
		result = filterFind(output);
	else if (command.startsWith("tree") || command.includes(" tree "))
		result = filterTree(output);
	else if (output.length > 10000) {
		result = `${output.slice(0, 5000)}\n... (truncated)`;
	}

	return compressPaths(result);
}

// Path prefix compression — collapse shared directory prefixes
// 0-risk: fully reconstructable from prefix + suffix list
export function compressPaths(output: string): string {
	const lines = output.split("\n");
	if (lines.length < 3) return output;

	// Collect path-like lines (contain /, not noise dirs)
	const pathLines: { index: number; path: string }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.includes("/") && !NOISE_DIRS.some((d) => line.includes(d))) {
			pathLines.push({ index: i, path: line });
		}
	}
	if (pathLines.length < 3) return output;

	// Find longest common prefix among path lines
	const paths = pathLines.map((p) => p.path);
	let prefix = paths[0];
	for (let i = 1; i < paths.length; i++) {
		let j = 0;
		while (
			j < prefix.length &&
			j < paths[i].length &&
			prefix[j] === paths[i][j]
		)
			j++;
		prefix = prefix.slice(0, j);
		if (!prefix) break;
	}
	// Trim to last / for a clean directory prefix
	const lastSlash = prefix.lastIndexOf("/");
	if (lastSlash <= 0) return output;
	prefix = prefix.slice(0, lastSlash + 1);

	// Build suffix list
	const suffixes = paths.map((p) => p.slice(prefix.length));
	if (suffixes.length < 3) return output;

	// Check savings >= 30%
	const originalLen = suffixes.reduce(
		(s, sfx) => s + prefix.length + sfx.length,
		0,
	);
	const compressedLen = prefix.length + 2 + suffixes.join(", ").length + 2; // "prefix/ [s1, s2, ...]"
	if (compressedLen >= originalLen * 0.7) return output;

	// Replace path lines with compressed format, keep non-path lines intact
	const result: string[] = [];
	let pathIdx = 0;
	for (let i = 0; i < lines.length; i++) {
		if (pathIdx < pathLines.length && i === pathLines[pathIdx].index) {
			if (pathIdx === 0) {
				result.push(`${prefix}[${suffixes.join(", ")}]`);
			}
			pathIdx++;
		} else {
			result.push(lines[i]);
		}
	}
	return result.join("\n");
}
