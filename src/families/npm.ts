// NPM/Yarn/Bun/Pnpm filter — install, test, lint output

const ERROR_PATTERNS = [
	/error/i,
	/ERR!/i,
	/failed/i,
	/ENOENT/i,
	/EEXIST/i,
	/EACCES/i,
	/EPERM/i,
	/MODULE_NOT_FOUND/i,
	/SyntaxError/i,
	/TypeError/i,
];

export function filterNpmInstall(output: string): string {
	const lines = output.split("\n");
	const added: string[] = [];
	const changed: string[] = [];
	const removed: string[] = [];
	const warnings: string[] = [];

	for (const line of lines) {
		if (line.includes("added ") && line.includes("package")) {
			added.push(line.trim());
		} else if (line.includes("changed ")) {
			changed.push(line.trim());
		} else if (line.includes("removed ")) {
			removed.push(line.trim());
		} else if (line.includes("warn") || line.includes("deprecated")) {
			warnings.push(line.trim());
		}
	}

	let result = "";
	if (added.length) result += `Added: ${added.length} packages\n`;
	if (changed.length) result += `Changed: ${changed.length} packages\n`;
	if (removed.length) result += `Removed: ${removed.length} packages\n`;
	if (warnings.length > 0 && warnings.length <= 10) {
		result += `Warnings:\n${warnings.slice(0, 10).join("\n")}\n`;
	} else if (warnings.length > 10) {
		result += `Warnings: ${warnings.length} (truncated)\n`;
	}

	return result || output;
}

export function filterNpmTest(output: string): string {
	const lines = output.split("\n");
	const failures: string[] = [];
	const summary: string[] = [];
	let inFailure = false;
	let failureBlock: string[] = [];

	for (const line of lines) {
		// Detect test summary
		if (/^\s*(✓|✗|✘|pass|fail|PASS|FAIL|Tests:|Test Suites:)/.test(line)) {
			summary.push(line.trim());
		}
		// Detect failure blocks
		if (/FAIL|✗|✘|failed|Error:|at .*\(.*:\d+:\d+\)/.test(line)) {
			if (!inFailure) {
				inFailure = true;
				failureBlock = [line];
			} else {
				failureBlock.push(line);
			}
		} else if (inFailure && line.trim() === "") {
			inFailure = false;
			if (failureBlock.length > 0) {
				failures.push(failureBlock.join("\n"));
				failureBlock = [];
			}
		}
	}

	if (failures.length === 0) {
		// All passed — just show summary
		return summary.filter((s) => s).join("\n") || "(all tests passed)";
	}

	let result = `FAILURES (${failures.length}):\n\n`;
	result += failures.slice(0, 5).join("\n\n");
	if (failures.length > 5) {
		result += `\n\n... and ${failures.length - 5} more failures`;
	}
	result += `\n\n${summary.filter((s) => s).join("\n")}`;

	return result;
}

export function filterNpmOutput(command: string, output: string): string {
	// Check for errors first
	if (ERROR_PATTERNS.some((p) => p.test(output))) {
		// Still filter but keep error context
		const lines = output.split("\n");
		const errorLines = lines.filter((l) =>
			ERROR_PATTERNS.some((p) => p.test(l)),
		);
		if (errorLines.length < lines.length / 2) {
			return errorLines.join("\n");
		}
	}

	if (
		command.includes("install") ||
		command.includes("add") ||
		command.includes("remove")
	) {
		return filterNpmInstall(output);
	}
	if (
		command.includes("test") ||
		command.includes("jest") ||
		command.includes("mocha") ||
		command.includes("vitest")
	) {
		return filterNpmTest(output);
	}
	if (
		command.includes("lint") ||
		command.includes("eslint") ||
		command.includes("prettier")
	) {
		return filterNpmLint(output);
	}

	// Default: truncate
	if (output.length > 10000) {
		return `${output.slice(0, 5000)}\n... (truncated)`;
	}
	return output;
}

function filterNpmLint(output: string): string {
	const lines = output.split("\n");
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const line of lines) {
		if (/error|Error/.test(line)) errors.push(line.trim());
		else if (/warn|Warning/.test(line)) warnings.push(line.trim());
	}

	let result = "";
	if (errors.length > 0) {
		result += `Errors (${errors.length}):\n${errors.slice(0, 20).join("\n")}\n`;
		if (errors.length > 20) result += `... and ${errors.length - 20} more\n`;
	}
	if (warnings.length > 0 && warnings.length <= 20) {
		result += `Warnings (${warnings.length}):\n${warnings.join("\n")}\n`;
	} else if (warnings.length > 20) {
		result += `Warnings: ${warnings.length} (truncated)\n`;
	}

	return result || "(clean)";
}
