// Auto-tuning — metrics-driven compression weight adjustment
// Reads per-call metrics file, computes per-family effectiveness.
// Pipeline stages query this to skip heavy processing on low-yield families.
// 0-risk: if data missing/corrupt, returns neutral (1.0) — no change to pipeline.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const CACHE_TTL_MS = 60_000;

interface FamilyMetrics {
	calls: number;
	totalBefore: number;
	totalAfter: number;
	avgSavings: number;
}

let cache: { ts: number; data: Map<string, FamilyMetrics> } | null = null;

function readMetrics(): Map<string, FamilyMetrics> {
	const now = Date.now();
	if (cache && now - cache.ts < CACHE_TTL_MS) {
		return cache.data;
	}

	const byFamily = new Map<string, FamilyMetrics>();

	try {
		if (!fs.existsSync(METRICS_FILE)) {
			cache = { ts: now, data: byFamily };
			return byFamily;
		}

		const content = fs.readFileSync(METRICS_FILE, "utf-8");
		for (const line of content.split("\n").filter(Boolean)) {
			try {
				const entry = JSON.parse(line);
				const family: string = entry.family || entry.tool || "generic";
				const before = entry.before_tokens || 0;
				const after = entry.after_tokens || 0;

				let m = byFamily.get(family);
				if (!m) {
					m = { calls: 0, totalBefore: 0, totalAfter: 0, avgSavings: 0 };
					byFamily.set(family, m);
				}
				m.calls++;
				m.totalBefore += before;
				m.totalAfter += after;
			} catch {
				// skip malformed lines
			}
		}

		for (const [, m] of byFamily) {
			m.avgSavings =
				m.totalBefore > 0 ? (m.totalBefore - m.totalAfter) / m.totalBefore : 0;
		}

		cache = { ts: now, data: byFamily };
	} catch {
		cache = { ts: now, data: byFamily };
	}

	return byFamily;
}

// Get compression effectiveness for a family (0.0 = useless, 1.0 = perfect)
// Returns neutral (1.0) if no data — safe default, pipeline runs unchanged.
export function getFamilyEffectiveness(family: string): number {
	const metrics = readMetrics();
	const m = metrics.get(family);
	if (!m || m.calls < 3) return 1.0;
	return Math.max(0, Math.min(1, m.avgSavings));
}

// Check if a heavy compression stage is worthwhile for this family
export function isStageWorthwhile(
	family: string,
	threshold: number = -0.01,
): boolean {
	return getFamilyEffectiveness(family) >= threshold;
}

// Get effectiveness for all tracked families (for stats/debug)
export function getAllEffectiveness(): Record<string, number> {
	const metrics = readMetrics();
	const result: Record<string, number> = {};
	for (const [family, m] of metrics) {
		if (m.calls >= 3) {
			result[family] = Math.round(m.avgSavings * 100);
		}
	}
	return result;
}

// Clear cache (for testing)
export function resetCache(): void {
	cache = null;
}
