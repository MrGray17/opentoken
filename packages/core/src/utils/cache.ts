// Read cache — skip disk read if same file was read within TTL
// Uses mtime + size as cache key
// Session-keyed to prevent cross-session cache pollution

import fs from "node:fs";
import { SessionStore } from "./session-store";

interface CacheEntry {
	content: string;
	mtime: number;
	size: number;
	ts: number;
}

const TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_SIZE = 500; // LRU cap — evict oldest when exceeded

interface CacheState {
	cache: Map<string, CacheEntry>;
}

function createCacheState(): CacheState {
	return { cache: new Map() };
}

const store = new SessionStore<CacheState>();

function getState(sessionID: string): CacheState {
	return store.get(sessionID, createCacheState);
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

	// Verify file hasn't changed (use tolerance for floating point mtime)
	try {
		const stat = fs.statSync(filePath);
		if (Math.abs(stat.mtimeMs - entry.mtime) < 1 && stat.size === entry.size) {
			return entry.content;
		}
	} catch {
		// File gone or inaccessible
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
		// LRU eviction: remove oldest entry when cache is full
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
	} catch {
		// Can't stat, don't cache
	}
}
