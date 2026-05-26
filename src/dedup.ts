// Cross-call deduplication engine (#25)
// Same output within N calls → collapse to single reference line.
// Uses content hashing + similarity detection.
// Session-keyed to prevent cross-session dedup corruption.
// Improved: content-aware window, size-based similarity, cross-tool.

import { SessionStore } from "./utils/session-store";

interface DedupEntry {
	hash: string;
	content: string;
	tool: string;
	callNumber: number;
	timestamp: number;
}

interface DedupState {
	recentCalls: DedupEntry[];
	callCounter: number;
}

const MIN_WINDOW = 8;
const MAX_WINDOW = 64;
const SIMILARITY_THRESHOLD = 0.85;

function createDedupState(): DedupState {
	return { recentCalls: [], callCounter: 0 };
}

const store = new SessionStore<DedupState>();

function getState(sessionID: string): DedupState {
	return store.get(sessionID, createDedupState);
}

function hashContent(text: string): string {
	let h = 0;
	for (let i = 0; i < text.length; i++) {
		h = ((h << 5) - h + text.charCodeAt(i)) | 0;
	}
	return h.toString(36);
}

function getAdaptiveWindow(content: string): number {
	const len = content.length;
	if (len > 5000) return MAX_WINDOW;
	if (len > 1000) return 32;
	return MIN_WINDOW;
}

function jaccardSimilarity(a: string, b: string): number {
	const MAX_WORDS = 500;
	const wordsA = a.toLowerCase().split(/\s+/);
	const wordsB = b.toLowerCase().split(/\s+/);

	const sampleA =
		wordsA.length > MAX_WORDS
			? wordsA.filter((_, i) => i % Math.ceil(wordsA.length / MAX_WORDS) === 0)
			: wordsA;
	const sampleB =
		wordsB.length > MAX_WORDS
			? wordsB.filter((_, i) => i % Math.ceil(wordsB.length / MAX_WORDS) === 0)
			: wordsB;

	const setA = new Set(sampleA);
	const setB = new Set(sampleB);

	let intersection = 0;
	for (const w of setA) {
		if (setB.has(w)) intersection++;
	}

	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function findSimilarEntry(
	state: DedupState,
	content: string,
	_tool: string,
): DedupEntry | null {
	const currentHash = hashContent(content);

	for (const entry of state.recentCalls) {
		// Exact hash match — cross-tool dedup
		if (entry.hash === currentHash) {
			return entry;
		}

		// Fuzzy similarity check — cross-tool
		const contentLenOk = content.length > 100 && entry.content.length > 100;
		if (contentLenOk) {
			const sim = jaccardSimilarity(content, entry.content);
			if (sim >= SIMILARITY_THRESHOLD) {
				return entry;
			}
		}
	}

	return null;
}

function recordCall(state: DedupState, content: string, tool: string): void {
	state.callCounter++;
	const entry: DedupEntry = {
		hash: hashContent(content),
		content,
		tool,
		callNumber: state.callCounter,
		timestamp: Date.now(),
	};

	state.recentCalls.push(entry);

	const window = getAdaptiveWindow(content);
	if (state.recentCalls.length > window) {
		state.recentCalls.splice(0, state.recentCalls.length - window);
	}
}

export function deduplicate(
	sessionID: string,
	content: string,
	tool: string,
): { result: string; deduped: boolean } {
	const state = getState(sessionID);
	const similar = findSimilarEntry(state, content, tool);

	if (similar) {
		return {
			deduped: true,
			result: `[Duplicate of call #${similar.callNumber} (${similar.tool}) — see earlier result]`,
		};
	}

	recordCall(state, content, tool);

	return { deduped: false, result: content };
}

export function resetDedup(sessionID: string): void {
	store.reset(sessionID, createDedupState);
}
