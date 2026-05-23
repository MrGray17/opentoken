// Make/cmake filter — build progress line folding
// Folds [N%] compilation progress lines unless adjacent to warnings/errors
// Linker output and final summary pass through unchanged

export function filterMakeOutput(_command: string, output: string): string {
	const lines = output.split("\n");
	const result: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Always pass through non-progress lines
		if (!/^\[[\d%.\s]+\]/.test(line)) {
			result.push(line);
			continue;
		}

		// Check if line itself has warning/error embedded
		if (/warning|error/i.test(line)) {
			result.push(line);
			continue;
		}

		// Keep if adjacent line (before or after) has warning/error
		const prevLine = i > 0 ? lines[i - 1] : "";
		const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
		const adjacentHasIssue =
			/warning|error/i.test(prevLine) || /warning|error/i.test(nextLine);

		if (adjacentHasIssue) {
			result.push(line);
		}

		// Skip pure progress lines — cosmetic, no semantic value
	}

	if (result.length === 0) {
		return "(build output compressed — no warnings or errors)";
	}
	return result.join("\n");
}
