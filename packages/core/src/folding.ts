// Diff Folding + Log Folding — inspired by claw-compactor
// Collapse unchanged diff context lines and repeated log lines

// Diff Folding — collapse unchanged context lines in git diff output
export function foldDiff(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let contextRun = 0;
	let inHunk = false;

	for (const line of lines) {
		// Detect hunk headers
		if (line.startsWith("@@")) {
			// Flush any pending context run
			if (contextRun > 0) {
				result.push(`  ... ${contextRun} context lines omitted`);
				contextRun = 0;
			}
			inHunk = true;
			result.push(line);
			continue;
		}

		// Detect diff headers
		if (
			line.startsWith("diff --git") ||
			line.startsWith("index ") ||
			line.startsWith("---") ||
			line.startsWith("+++")
		) {
			if (contextRun > 0) {
				result.push(`  ... ${contextRun} context lines omitted`);
				contextRun = 0;
			}
			inHunk = false;
			result.push(line);
			continue;
		}

		if (inHunk) {
			// Context lines (start with space)
			if (line.startsWith(" ") && line.length > 1) {
				contextRun++;
				continue;
			}

			// Added/removed lines — flush context run first
			if (contextRun > 0) {
				if (contextRun <= 3) {
					// Keep short context runs
					for (let i = 0; i < contextRun; i++) {
						result.push("  [context]");
					}
				} else {
					result.push(`  ... ${contextRun} context lines omitted`);
				}
				contextRun = 0;
			}

			// Keep added/removed lines
			if (line.startsWith("+") || line.startsWith("-")) {
				// Truncate long lines
				if (line.length > 120) {
					result.push(`${line.slice(0, 120)}...`);
				} else {
					result.push(line);
				}
			}
		} else {
			// Outside hunks — keep headers
			result.push(line);
		}
	}

	// Flush final context run
	if (contextRun > 0) {
		result.push(`  ... ${contextRun} context lines omitted`);
	}

	return result.join("\n");
}

// Log Folding — collapse repeated consecutive log lines
export function foldLogs(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let currentLine = "";
	let runCount = 0;

	for (const line of lines) {
		if (line === currentLine) {
			runCount++;
		} else {
			// Flush previous run
			if (runCount > 1) {
				result.push(`  ${runCount} x ${currentLine}`);
			} else if (runCount === 1) {
				result.push(currentLine);
			}
			currentLine = line;
			runCount = 1;
		}
	}

	// Flush final run
	if (runCount > 1) {
		result.push(`  ${runCount} x ${currentLine}`);
	} else if (runCount === 1) {
		result.push(currentLine);
	}

	return result.join("\n");
}

// Pre-compiled log detection regexes
const LOG_PYTHON_RE =
	/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}\s+-\s+\w+\s+-\s+(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL)\s+-/m;
const LOG_K8S_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?\s/m;
const LOG_SYSLOG_RE =
	/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+/m;

// Collapse non-consecutive identical lines (>=5 occurrences anywhere in output)
function foldRepeats(content: string): string {
	const lines = content.split("\n");
	const counts = new Map<string, number>();
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length < 4) continue;
		counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
	}

	const toCollapse = new Set<string>();
	for (const [line, count] of counts) {
		if (count >= 5) toCollapse.add(line);
	}

	if (toCollapse.size === 0) return content;

	const result: string[] = [];
	const shown = new Set<string>();

	for (const line of lines) {
		const trimmed = line.trim();
		if (toCollapse.has(trimmed)) {
			if (!shown.has(trimmed)) {
				const count = counts.get(trimmed) ?? 0;
				result.push(`  ${count} x ${trimmed}`);
				shown.add(trimmed);
			}
		} else {
			result.push(line);
		}
	}

	return result.join("\n");
}

// Combined diff + log folding
export function foldDiffAndLogs(content: string): string {
	let result = foldRepeats(content);

	// Detect if content is a diff
	if (content.includes("diff --git") || content.startsWith("@@")) {
		result = foldDiff(result);
	}

	// Detect if content looks like log output — expanded format detection
	const isLogOutput =
		content.includes("[INFO]") ||
		content.includes("[WARN]") ||
		content.includes("[ERROR]") ||
		content.includes("INFO:") ||
		content.includes("WARN:") ||
		content.includes("ERROR:") ||
		LOG_PYTHON_RE.test(content) ||
		LOG_K8S_RE.test(content) ||
		LOG_SYSLOG_RE.test(content);

	if (isLogOutput) {
		result = foldLogs(result);
	}

	return result;
}
