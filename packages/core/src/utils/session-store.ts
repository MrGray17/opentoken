// Session-scoped state manager
// Prevents cross-session state corruption when multiple sessions run concurrently
// Each module creates its own SessionStore<T> instance for its state type

const MAX_CONCURRENT_SESSIONS = 10;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class SessionStore<T extends object> {
	private sessions = new Map<string, { state: T; lastAccess: number }>();

	// Get or create session state — atomic check-then-create
	get(sessionID: string, factory: () => T): T {
		const existing = this.sessions.get(sessionID);
		if (existing) {
			existing.lastAccess = Date.now();
			return existing.state;
		}

		// Double-check after potential concurrent factory creation
		const doubleCheck = this.sessions.get(sessionID);
		if (doubleCheck) {
			doubleCheck.lastAccess = Date.now();
			return doubleCheck.state;
		}

		const state = factory();
		this.sessions.set(sessionID, { state, lastAccess: Date.now() });
		this.evict(sessionID);
		return state;
	}

	// Reset session state (re-create via factory)
	reset(sessionID: string, factory: () => T): T {
		const state = factory();
		this.sessions.set(sessionID, { state, lastAccess: Date.now() });
		return state;
	}

	// Remove a specific session
	delete(sessionID: string): void {
		this.sessions.delete(sessionID);
	}

	// Evict stale sessions (oldest first, beyond TTL or max count)
	// Accepts currentID to prevent evicting the session being created
	private evict(currentID?: string): void {
		const now = Date.now();

		// First pass: remove expired sessions
		for (const [id, entry] of this.sessions.entries()) {
			if (now - entry.lastAccess > SESSION_TTL_MS) {
				this.sessions.delete(id);
			}
		}

		// Second pass: remove oldest if still over capacity — skip currentID
		while (this.sessions.size > MAX_CONCURRENT_SESSIONS) {
			let oldestId: string | undefined;
			let oldestTime = Infinity;
			for (const [id, entry] of this.sessions.entries()) {
				if (id === currentID) continue;
				if (entry.lastAccess < oldestTime) {
					oldestTime = entry.lastAccess;
					oldestId = id;
				}
			}
			if (oldestId) this.sessions.delete(oldestId);
			else break;
		}
	}

	// Get count of active sessions
	get size(): number {
		return this.sessions.size;
	}

	// Clear all sessions
	clear(): void {
		this.sessions.clear();
	}
}
