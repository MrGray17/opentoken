// Progressive disclosure system (#26)
// Summary first, full content on demand
// Stores oversized results in temp files, leaves pointer in context
// Session-keyed to prevent cross-session data leakage

import os from "node:os";
import path from "node:path";
import { SessionStore } from "./utils/session-store";

const OFFLOAD_DIR = path.join(os.homedir(), ".config", "opentoken", "offload");
const MAX_INLINE_LINES = 80;
const MAX_INLINE_BYTES = 8 * 1024; // 8KB

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

async function ensureDir(): Promise<void> {
	try {
		const dirExists = await Bun.file(OFFLOAD_DIR).exists();
		if (!dirExists) {
			const proc = Bun.spawn(["mkdir", "-p", OFFLOAD_DIR]);
			await proc.exited;
		}
	} catch {
		// Ignore
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
		// Extract exit code, errors, file changes
		const errors = lines
			.filter((l) => /error|fail|panic|fatal/i.test(l))
			.slice(0, 5);
		const files = lines
			.filter((l) => /^\s*[AMDRCU?!\s]{2}\s+/.test(l))
			.slice(0, 10);
		if (errors.length > 0) keyInfo = `Errors: ${errors.length}`;
		if (files.length > 0)
			keyInfo += `${keyInfo ? ", " : ""}Changed: ${files.length} files`;
	} else if (tool === "read") {
		// Extract file type, line count, symbols
		const symbols = lines.filter((l) =>
			/^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var|def|struct|enum|trait|impl)\s+/m.test(
				l,
			),
		).length;
		keyInfo = `${totalLines} lines, ${symbols} symbols`;
	} else if (tool === "grep") {
		const matchCount = lines.filter((l) => l.includes(":")).length;
		const files = new Set(lines.map((l) => l.split(":")[0]).filter(Boolean));
		keyInfo = `${matchCount} matches in ${files.size} files`;
	} else if (tool === "glob") {
		keyInfo = `${totalLines} files found`;
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
		await Bun.write(filePath, content);
	} catch {
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
				if (await Bun.file(entry.filePath).exists()) {
					const proc = Bun.spawn(["rm", "-f", entry.filePath]);
					await proc.exited;
				}
			} catch {
				// Ignore
			}
			state.store.delete(id);
			cleaned++;
		}
	}

	return cleaned;
}
