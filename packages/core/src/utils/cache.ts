import fs from "node:fs";
import { SessionStore } from "./session-store";

interface CacheEntry {
	content: string;
	mtime: number;
	size: number;
	ts: number;
}

const TTL_MS = 30_000;
const MAX_CACHE_SIZE = 500;
const MTIME_TOLERANCE_MS = 5000;

interface CacheState {
	cache: Map<string, CacheEntry>;
}

function createState(): CacheState {
	return { cache: new Map() };
}

const store = new SessionStore<CacheState>();

function getState(sessionID: string): CacheState {
	return store.get(sessionID, createState);
}

function makeKey(filePath: string): string {
	return filePath;
}

export function getCachedRead(
	sessionID: string,
	filePath: string,
): string | null {
	const state = getState(sessionID);
	const entry = state.cache.get(makeKey(filePath));
	if (!entry) return null;

	const now = Date.now();
	if (now - entry.ts > TTL_MS) {
		state.cache.delete(makeKey(filePath));
		return null;
	}

	try {
		const stat = fs.statSync(filePath);
		if (
			Math.abs(stat.mtimeMs - entry.mtime) <= MTIME_TOLERANCE_MS &&
			stat.size === entry.size
		) {
			return entry.content;
		}
	} catch (e) {
		if (e instanceof Error && (e as NodeJS.ErrnoException).code !== "ENOENT") {
			throw e;
		}
	}

	state.cache.delete(makeKey(filePath));
	return null;
}

export function setCachedRead(
	sessionID: string,
	filePath: string,
	content: string,
): void {
	try {
		const state = getState(sessionID);
		const stat = fs.statSync(filePath);
		if (state.cache.size >= MAX_CACHE_SIZE) {
			const oldestKey = state.cache.keys().next().value;
			if (oldestKey) state.cache.delete(oldestKey);
		}
		state.cache.set(makeKey(filePath), {
			content,
			mtime: stat.mtimeMs,
			size: stat.size,
			ts: Date.now(),
		});
	} catch (e) {
		if (e instanceof Error && (e as NodeJS.ErrnoException).code !== "ENOENT") {
			throw e;
		}
	}
}
