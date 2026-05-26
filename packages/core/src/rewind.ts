// Reversible Compression — inspired by claw-compactor's RewindStore
// Aggressively compress content but store originals in hash-addressed store
// LLM can retrieve any compressed section by its marker ID
// Session-keyed to prevent cross-session data leakage

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./utils/logger";
import { SessionStore } from "./utils/session-store";

const REWIND_DIR = path.join(os.homedir(), ".config", "opentoken", "rewind");
const MAX_COMPRESSED_SIZE = 15 * 1024; // 15KB — compress anything larger

interface RewindEntry {
	id: string;
	original: string;
	compressed: string;
	marker: string;
	timestamp: number;
	size: number;
	compressedSize: number;
}

interface RewindState {
	store: Map<string, RewindEntry>;
	counter: number;
}

function createRewindState(): RewindState {
	return { store: new Map(), counter: 0 };
}

const store = new SessionStore<RewindState>();

function getState(sessionID: string): RewindState {
	return store.get(sessionID, createRewindState);
}

// Generate a unique rewind ID
function generateId(state: RewindState): string {
	state.counter++;
	const hash = crypto
		.createHash("md5")
		.update(`${Date.now()}-${state.counter}`)
		.digest("hex")
		.slice(0, 8);
	return `rw-${hash}`;
}

// Compress content and store original
export async function compressAndStore(
	sessionID: string,
	content: string,
): Promise<{
	compressed: string;
	marker: string;
	entryId: string;
	compressionRatio: number;
}> {
	await ensureDir();

	const state = getState(sessionID);
	const id = generateId(state);
	const marker = `[COMPRESSED:${id}]`;

	// Store the original
	const entry: RewindEntry = {
		id,
		original: content,
		compressed: compressContent(content),
		marker,
		timestamp: Date.now(),
		size: content.length,
		compressedSize: 0,
	};

	try {
		await Bun.write(path.join(REWIND_DIR, `${id}.txt`), content);
	} catch {
		logger.warn(
			sessionID,
			"rewind.write",
			"Failed to write rewind entry to disk, using in-memory only",
		);
	}

	// Calculate compressed size
	entry.compressedSize = entry.compressed.length;
	state.store.set(id, entry);

	const compressionRatio =
		content.length > 0
			? Math.round((1 - entry.compressedSize / content.length) * 100)
			: 0;

	return {
		compressed: entry.compressed,
		marker,
		entryId: id,
		compressionRatio,
	};
}

// Compress content using head+tail extraction — preserves structure while dropping interior
function compressContent(content: string): string {
	const lines = content.split("\n");

	// Keep first 10 + last 5 lines, drop interior
	if (lines.length > 20) {
		const head = lines.slice(0, 10);
		const tail = lines.slice(-5);
		const skipped = lines.length - 15;
		return `${head.join("\n")}\n\n... ${skipped} lines omitted (full content stored in rewind store) ...\n\n${tail.join("\n")}`;
	}

	return content;
}

// Apply reversible compression to content
export async function applyReversibleCompression(
	sessionID: string,
	content: string,
): Promise<{
	result: string;
	compressed: boolean;
	entryId?: string;
}> {
	if (content.length < MAX_COMPRESSED_SIZE) {
		return { result: content, compressed: false };
	}

	const { compressed, marker, entryId, compressionRatio } =
		await compressAndStore(sessionID, content);

	return {
		result: `${marker} (${compressionRatio}% compressed, ${Math.round(content.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB)\n\n${compressed}\n\nUse "opentoken rewind ${entryId}" to retrieve full content.`,
		compressed: true,
		entryId,
	};
}

// Clean up old rewind entries
export async function cleanupRewind(
	sessionID: string,
	maxAgeMs = 3600000,
): Promise<number> {
	const state = getState(sessionID);
	let cleaned = 0;
	const now = Date.now();

	for (const [id, entry] of state.store.entries()) {
		if (now - entry.timestamp > maxAgeMs) {
			try {
				const filePath = path.join(REWIND_DIR, `${id}.txt`);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			} catch {
				logger.debug(
					sessionID,
					"rewind.cleanup",
					"Failed to delete expired rewind file",
				);
			}
			state.store.delete(id);
			cleaned++;
		}
	}

	return cleaned;
}

async function ensureDir(): Promise<void> {
	try {
		if (!fs.existsSync(REWIND_DIR)) {
			fs.mkdirSync(REWIND_DIR, { recursive: true });
		}
	} catch {
		logger.warn(
			undefined,
			"rewind.ensureDir",
			"Failed to create rewind directory",
		);
	}
}

// Semantic abbreviation — replace long repeated identifiers with $N$ markers
// 0-risk: legend appended to output so LLM can resolve abbreviations
const MIN_IDENTIFIER_LENGTH = 40;

export function abbreviateIdentifiers(sessionID: string, text: string): string {
	const _state = getState(sessionID);

	// Find all potential identifiers (word chars, dots, slashes, hyphens — 40+ chars)
	const identPattern = new RegExp(
		`[A-Za-z_/.][A-Za-z0-9_/.-]{${MIN_IDENTIFIER_LENGTH - 1},}(?<![.\\-/])`,
		"g",
	);
	const matches = text.match(identPattern);
	if (!matches || matches.length < 2) return text;

	// Count frequency
	const freq = new Map<string, number>();
	for (const m of matches) {
		freq.set(m, (freq.get(m) || 0) + 1);
	}

	// Filter to those appearing 2+ times, sort by frequency descending
	const candidates = [...freq.entries()]
		.filter(([, count]) => count >= 2)
		.sort((a, b) => b[1] - a[1]);
	if (candidates.length === 0) return text;

	// Calculate savings: original chars vs abbreviation chars + legend
	const totalOriginalChars = candidates.reduce(
		(sum, [id, count]) => sum + id.length * count,
		0,
	);
	const totalAbbrevChars = candidates.reduce(
		(sum, [, count]) => sum + 3 * count,
		0,
	); // $1$ = 3 chars
	const legendLength = candidates.reduce(
		(sum, [id, _i]) => sum + 3 + 3 + id.length + 2,
		0,
	); // "$1$ = id\n"
	const savings = totalOriginalChars - totalAbbrevChars - legendLength;
	if (savings <= 0) return text;

	// Build replacement map
	let result = text;
	for (let i = 0; i < candidates.length; i++) {
		const [id] = candidates[i];
		const marker = `$${i + 1}$`;
		// Escape special regex chars in the identifier
		const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		result = result.replace(new RegExp(escaped, "g"), marker);
	}

	// Append legend
	const legend = candidates
		.map(([id, count], i) => `$${i + 1}$ = ${id} (${count}x)`)
		.join("\n");
	result += `\n\n# Abbreviations:\n${legend}`;

	return result;
}
