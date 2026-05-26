// Glob result filter — strip noise directories, group by directory

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
	"vendor",
];

const MAX_RESULTS = 100;

export function filterGlob(output: string): string {
	const paths = output.split("\n").filter(Boolean);
	const filtered = paths.filter(
		(p) =>
			!NOISE_DIRS.some((d) => p.includes(`/${d}/`) || p.startsWith(`${d}/`)),
	);

	if (filtered.length === 0) {
		return "(no matches)";
	}

	if (filtered.length <= MAX_RESULTS) {
		return filtered.join("\n");
	}

	// Group by top-level directory
	const groups: Record<string, string[]> = {};
	for (const path of filtered) {
		const top = path.split("/")[0] || ".";
		if (!groups[top]) groups[top] = [];
		groups[top].push(path);
	}

	let result = `${filtered.length} files:\n`;
	const sorted = Object.entries(groups).sort(
		(a, b) => b[1].length - a[1].length,
	);
	for (const [dir, files] of sorted.slice(0, 20)) {
		result += `  ${dir}/: ${files.length} files\n`;
		// Show a few examples
		for (const f of files.slice(0, 3)) {
			result += `    ${f}\n`;
		}
		if (files.length > 3) {
			result += `    ... and ${files.length - 3} more\n`;
		}
	}
	if (sorted.length > 20) {
		result += `  ... and ${sorted.length - 20} more directories`;
	}

	return result;
}
