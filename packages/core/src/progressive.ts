// Progressive disclosure system (#26)
// Summary first, full content on demand
// Stores oversized results in temp files, leaves pointer in context
// Session-keyed to prevent cross-session data leakage

import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "./utils/configDir";
import { fileExists, writeTextFile } from "./utils/fs-compat";
import { logger } from "./utils/logger";
import { SessionStore } from "./utils/session-store";

const OFFLOAD_DIR = path.join(getConfigDir(), "offload");
const MAX_INLINE_LINES = 10;
const MAX_INLINE_BYTES = 1024; // 1KB

interface OffloadEntry {
	id: string;
	tool: string;
	summary: string;
	filePath: string;
	fullSize: number;
	fullLines: number;
	timestamp: number;
}

interface OffloadState {
	store: Map<string, OffloadEntry>;
	counter: number;
}

function createOffloadState(): OffloadState {
	return { store: new Map(), counter: 0 };
}

const store = new SessionStore<OffloadState>();

function getState(sessionID: string): OffloadState {
	return store.get(sessionID, createOffloadState);
}

// Cache whether OFFLOAD_DIR is known to exist (avoids repeated fs access)
let _dirKnownExists = false;

async function ensureDir(): Promise<void> {
	if (_dirKnownExists) return;
	try {
		const dirExists = await fileExists(OFFLOAD_DIR);
		if (!dirExists) {
			fs.mkdirSync(OFFLOAD_DIR, { recursive: true });
		}
		_dirKnownExists = true;
	} catch {
		logger.warn(
			undefined,
			"offload.ensureDir",
			"Failed to create offload directory",
		);
	}
}

// Generate a unique offload ID
function generateId(state: OffloadState): string {
	state.counter++;
	return `ot-${state.counter}-${Date.now().toString(36)}`;
}

// Create a concise summary of content
function createSummary(content: string, tool: string): string {
	const lines = content.split("\n");
	const totalLines = lines.length;
	const totalBytes = content.length;

	// Extract key info based on tool type
	let keyInfo = "";

	if (tool === "bash") {
		const errors = lines
			.filter((l) => /error|fail|panic|fatal/i.test(l))
			.slice(0, 5);
		const files = lines
			.filter((l) => /^\s*[AMDRCU?!\s]{2}\s+/.test(l))
			.slice(0, 10);
		const passFail = lines
			.filter((l) =>
				/^\s*(ok |not ok|\d+\.\.\d+|\d+ tests|\d+ passing|\d+ failed)/i.test(l),
			)
			.slice(0, 3);
		if (errors.length > 0) keyInfo = `Errors: ${errors.length}`;
		if (files.length > 0)
			keyInfo += `${keyInfo ? ", " : ""}Changed: ${files.length} files`;
		if (passFail.length > 0)
			keyInfo += `${keyInfo ? ", " : ""}Tests: ${passFail.map((l) => l.trim().slice(0, 40)).join("; ")}`;
		if (!keyInfo) keyInfo = `${totalLines} lines`;
	} else if (tool === "read") {
		const symbols = lines.filter((l) =>
			/^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var|def|struct|enum|trait|impl)\s+/m.test(
				l,
			),
		).length;
		const fnNames = lines
			.filter((l) => /^(export\s+)?(async\s+)?function\s+(\w+)/.test(l))
			.map((l) => l.match(/(?:function|def)\s+(\w+)/)?.[1])
			.filter(Boolean)
			.slice(0, 5);
		keyInfo = `${totalLines} lines, ${symbols} symbols`;
		if (fnNames.length > 0) keyInfo += `: ${fnNames.join(", ")}`;
	} else if (tool === "grep") {
		const matchCount = lines.filter((l) => l.includes(":")).length;
		const files = new Set(lines.map((l) => l.split(":")[0]).filter(Boolean));
		keyInfo = `${matchCount} matches in ${files.size} files`;
	} else if (tool === "glob") {
		keyInfo = `${totalLines} files found`;
	} else {
		const errs = lines
			.filter((l) => /error|fail|panic|fatal/i.test(l))
			.slice(0, 3);
		if (errs.length > 0) keyInfo = `${errs.length} errors`;
	}

	return `[${totalLines} lines, ${Math.round(totalBytes / 1024)}KB${keyInfo ? `, ${keyInfo}` : ""}]`;
}

// Offload content to temp file, return summary + pointer
export async function progressiveDisclosure(
	sessionID: string,
	content: string,
	tool: string,
): Promise<{
	result: string;
	offloaded: boolean;
	entryId?: string;
}> {
	const lines = content.split("\n");

	// Short content → inline
	if (lines.length <= MAX_INLINE_LINES && content.length <= MAX_INLINE_BYTES) {
		return { result: content, offloaded: false };
	}

	// Create summary
	const summary = createSummary(content, tool);

	// Offload full content to file
	await ensureDir();
	const state = getState(sessionID);
	const id = generateId(state);
	const filePath = path.join(OFFLOAD_DIR, `${id}.txt`);

	try {
		await writeTextFile(filePath, content);
	} catch {
		logger.warn(
			sessionID,
			"offload.write",
			"Failed to write offload file, falling back to head+tail",
		);
		// If offload fails, fall back to head+tail
		const head = lines.slice(0, 50).join("\n");
		const tail = lines.slice(-20).join("\n");
		return {
			result: `${summary}\n\n${head}\n\n... ${lines.length - 70} lines omitted ...\n\n${tail}`,
			offloaded: false,
		};
	}

	const entry: OffloadEntry = {
		id,
		tool,
		summary,
		filePath,
		fullSize: content.length,
		fullLines: lines.length,
		timestamp: Date.now(),
	};
	state.store.set(id, entry);

	// Return summary + pointer
	return {
		result: `${summary}\nFull output offloaded. Use "opentoken fetch ${id}" to retrieve.`,
		offloaded: true,
		entryId: id,
	};
}

// Clean up old offloaded files (older than 1 hour)
export async function cleanupOffloaded(
	sessionID: string,
	maxAgeMs = 3600000,
): Promise<number> {
	const state = getState(sessionID);
	let cleaned = 0;
	const now = Date.now();

	for (const [id, entry] of state.store.entries()) {
		if (now - entry.timestamp > maxAgeMs) {
			try {
				if (fs.existsSync(entry.filePath)) {
					fs.unlinkSync(entry.filePath);
				}
			} catch {
				logger.debug(
					sessionID,
					"offload.cleanup",
					"Failed to delete expired offload file",
				);
			}
			state.store.delete(id);
			cleaned++;
		}
	}

	return cleaned;
}
