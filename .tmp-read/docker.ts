// Docker filter — build/pull/push output compression
// Strips progress bars, layer hashes, extraction status
// Guard: only applies to docker build/pull/push subcommands to avoid
// eating app log output from docker logs / docker run

const PROGRESS_PATTERNS = [
	/^#\d+/,
	/Downloading/,
	/Extracting/,
	/Waiting/,
	/^\s*$/,
];

export function filterDockerOutput(command: string, output: string): string {
	// Guard: only compress build/pull/push subcommands
	// This prevents erasing app log output from docker logs / docker run / docker exec
	if (!/^\s*docker\s+(build|pull|push)\b/.test(command)) return output;

	const lines = output.split("\n");
	const result: string[] = [];

	for (const line of lines) {
		// Keep error/fatal lines
		if (/error|fatal|failed|Error|FAILED/i.test(line)) {
			result.push(line);
			continue;
		}
		// Keep final tagged image line
		if (/Successfully\s+(built|tagged)/i.test(line)) {
			result.push(line);
			continue;
		}
		// Strip progress lines
		if (PROGRESS_PATTERNS.some((p) => p.test(line))) continue;
		// Keep anything left (safety net — err on the side of keeping)
		if (line.trim()) {
			result.push(line);
		}
	}

	if (result.length === 0) {
		return "(docker output compressed — all layers cached, no errors)";
	}
	return result.join("\n");
}
