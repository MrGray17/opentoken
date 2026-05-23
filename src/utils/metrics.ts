// Metrics recording — append JSONL entries for offline analysis
// Implements log rotation: 10MB max, keeps 5 rotated files

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface MetricEntry {
	ts: string;
	tool: string;
	family: string;
	sessionID?: string;
	before_tokens: number;
	after_tokens: number;
	saved_pct: number;
}

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken");
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl");
const MAX_METRICS_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROTATED_FILES = 5;

function ensureDir(): void {
	try {
		if (!fs.existsSync(METRICS_DIR)) {
			fs.mkdirSync(METRICS_DIR, { recursive: true });
			fs.chmodSync(METRICS_DIR, 0o700);
		}
	} catch {
		// Homedir inaccessible — metrics will silently fail
	}
}

// Rotate metrics file if it exceeds size limit
function rotateIfNeeded(): void {
	try {
		if (!fs.existsSync(METRICS_FILE)) return;
		const stat = fs.statSync(METRICS_FILE);
		if (stat.size < MAX_METRICS_SIZE) return;

		// Rotate: delete oldest, shift others, rename current
		const oldest = `${METRICS_FILE}.${MAX_ROTATED_FILES}`;
		if (fs.existsSync(oldest)) fs.unlinkSync(oldest);

		for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
			const src = `${METRICS_FILE}.${i}`;
			const dest = `${METRICS_FILE}.${i + 1}`;
			if (fs.existsSync(src)) fs.renameSync(src, dest);
		}

		fs.renameSync(METRICS_FILE, `${METRICS_FILE}.1`);
		fs.chmodSync(`${METRICS_FILE}.1`, 0o600);
	} catch {
		// Rotation failed — continue appending (metrics shouldn't break pipeline)
	}
}

export function recordMetric(entry: MetricEntry): void {
	try {
		ensureDir();
		rotateIfNeeded();
		const line = `${JSON.stringify(entry)}\n`;
		fs.appendFileSync(METRICS_FILE, line);
		fs.chmodSync(METRICS_FILE, 0o600);
	} catch {
		// Silent fail — metrics shouldn't break the pipeline
	}
}
