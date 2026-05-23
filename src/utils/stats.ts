// Metrics aggregation — compute summaries from metrics.jsonl
// Provides stats for the `opentoken stats` command and TUI display

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const SUMMARY_FILE = path.join(METRICS_DIR, "stats-summary.json");

interface MetricEntry {
	ts: string;
	tool: string;
	family: string;
	sessionID?: string;
	before_tokens: number;
	after_tokens: number;
	saved_pct: number;
}

interface ToolStats {
	calls: number;
	totalBefore: number;
	totalAfter: number;
	totalSaved: number;
	avgSavedPct: number;
}

interface StatsSummary {
	generatedAt: string;
	session: {
		totalCalls: number;
		totalBeforeTokens: number;
		totalAfterTokens: number;
		totalSavedTokens: number;
		avgSavedPct: number;
		startedAt?: string;
		lastCallAt?: string;
	};
	byTool: Record<string, ToolStats>;
	byFamily: Record<string, ToolStats>;
	topSavings: Array<{
		tool: string;
		family: string;
		saved: number;
		pct: number;
		ts: string;
	}>;
}

function parseMetricsFile(): MetricEntry[] {
	try {
		if (!fs.existsSync(METRICS_FILE)) return [];
		const text = fs.readFileSync(METRICS_FILE, "utf8");
		const lines = text
			.trim()
			.split("\n")
			.filter((l) => l.trim());
		const entries: MetricEntry[] = [];
		for (const line of lines) {
			try {
				entries.push(JSON.parse(line) as MetricEntry);
			} catch {
				// skip malformed lines
			}
		}
		return entries;
	} catch {
		return [];
	}
}

function computeToolStats(entries: MetricEntry[]): Record<string, ToolStats> {
	const stats: Record<string, ToolStats> = {};
	for (const entry of entries) {
		if (!stats[entry.tool]) {
			stats[entry.tool] = {
				calls: 0,
				totalBefore: 0,
				totalAfter: 0,
				totalSaved: 0,
				avgSavedPct: 0,
			};
		}
		const s = stats[entry.tool];
		s.calls++;
		s.totalBefore += entry.before_tokens;
		s.totalAfter += entry.after_tokens;
		s.totalSaved += entry.before_tokens - entry.after_tokens;
	}
	// Compute averages
	for (const key of Object.keys(stats)) {
		const s = stats[key];
		s.avgSavedPct =
			s.totalBefore > 0 ? Math.round((s.totalSaved / s.totalBefore) * 100) : 0;
	}
	return stats;
}

function computeTopSavings(
	entries: MetricEntry[],
	limit = 10,
): Array<{
	tool: string;
	family: string;
	saved: number;
	pct: number;
	ts: string;
}> {
	return entries
		.map((e) => ({
			tool: e.tool,
			family: e.family,
			saved: e.before_tokens - e.after_tokens,
			pct: e.saved_pct,
			ts: e.ts,
		}))
		.filter((e) => e.saved > 0)
		.sort((a, b) => b.saved - a.saved)
		.slice(0, limit);
}

export function getStatsSummary(sessionID?: string): StatsSummary {
	const allEntries = parseMetricsFile();
	const entries = sessionID
		? allEntries.filter((e) => e.sessionID === sessionID)
		: allEntries;
	const now = new Date();

	const totalBefore = entries.reduce((sum, e) => sum + e.before_tokens, 0);
	const totalAfter = entries.reduce((sum, e) => sum + e.after_tokens, 0);
	const totalSaved = totalBefore - totalAfter;

	return {
		generatedAt: now.toISOString(),
		session: {
			totalCalls: entries.length,
			totalBeforeTokens: totalBefore,
			totalAfterTokens: totalAfter,
			totalSavedTokens: totalSaved,
			avgSavedPct:
				totalBefore > 0 ? Math.round((totalSaved / totalBefore) * 100) : 0,
			startedAt: entries.length > 0 ? entries[0].ts : undefined,
			lastCallAt:
				entries.length > 0 ? entries[entries.length - 1].ts : undefined,
		},
		byTool: computeToolStats(entries),
		byFamily: computeToolStats(entries),
		topSavings: computeTopSavings(entries),
	};
}

function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
	return `${(n / 1000000).toFixed(1)}M`;
}

export function formatStatsSummary(sessionID?: string): string {
	const stats = getStatsSummary(sessionID);
	const lines: string[] = [];

	lines.push("🌸 opentoken stats");
	lines.push("");
	lines.push(`  Calls:        ${stats.session.totalCalls}`);
	lines.push(
		`  Tokens in:    ${formatTokens(stats.session.totalBeforeTokens)}`,
	);
	lines.push(`  Tokens out:   ${formatTokens(stats.session.totalAfterTokens)}`);
	lines.push(
		`  Tokens saved: ${formatTokens(stats.session.totalSavedTokens)} (${stats.session.avgSavedPct}%)`,
	);

	if (stats.session.startedAt) {
		lines.push(
			`  Session:      ${new Date(stats.session.startedAt).toLocaleString()} → ${new Date(stats.session.lastCallAt ?? "").toLocaleString()}`,
		);
	}

	lines.push("");
	lines.push("  By tool:");
	for (const [tool, s] of Object.entries(stats.byTool).sort(
		(a, b) => b[1].totalSaved - a[1].totalSaved,
	)) {
		lines.push(
			`    ${tool.padEnd(12)} ${String(s.calls).padStart(4)} calls  saved ${formatTokens(s.totalSaved).padStart(6)} (${String(s.avgSavedPct).padStart(3)}%)`,
		);
	}

	if (stats.topSavings.length > 0) {
		lines.push("");
		lines.push("  Top savings:");
		for (const s of stats.topSavings.slice(0, 5)) {
			lines.push(
				`    ${s.tool}/${s.family}: saved ${formatTokens(s.saved)} (${s.pct}%)`,
			);
		}
	}

	return lines.join("\n");
}

// Save summary to disk for TUI to read
export function saveStatsSummary(sessionID?: string): void {
	try {
		const stats = getStatsSummary(sessionID);
		const outFile = sessionID ? `${SUMMARY_FILE}.${sessionID}` : SUMMARY_FILE;
		fs.writeFileSync(outFile, JSON.stringify(stats, null, 2));
	} catch {
		// Silent fail — summary is optional
	}
}
