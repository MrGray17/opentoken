import { describe, expect, it, beforeEach } from "bun:test";
import { SessionStore } from "../src/utils/session-store";

interface TestState {
	count: number;
}

describe("SessionStore", () => {
	let store: SessionStore<TestState>;
	let factoryCalls = 0;

	beforeEach(() => {
		store = new SessionStore<TestState>();
		factoryCalls = 0;
	});

	const factory = () => {
		factoryCalls++;
		return { count: 0 };
	};

	it("get creates new session on first call", () => {
		const state = store.get("s1", factory);
		expect(state).toEqual({ count: 0 });
		expect(factoryCalls).toBe(1);
	});

	it("get returns existing session on second call", () => {
		store.get("s1", factory);
		const state = store.get("s1", factory);
		expect(state).toEqual({ count: 0 });
		expect(factoryCalls).toBe(1);
	});

	it("tracks lastAccess per session", () => {
		const state1 = store.get("s1", factory);
		const access1 = (store as any).sessions.get("s1").lastAccess;
		// Wait 1ms then access again
		const state2 = store.get("s1", factory);
		const access2 = (store as any).sessions.get("s1").lastAccess;
		expect(access2).toBeGreaterThanOrEqual(access1);
		expect(state1).toBe(state2); // same object ref
	});

	it("reset replaces state", () => {
		const state = store.get("s1", factory);
		state.count = 42;
		const resetState = store.reset("s1", factory);
		expect(resetState.count).toBe(0);
		expect(resetState).not.toBe(state);
	});

	it("delete removes session", () => {
		store.get("s1", factory);
		store.delete("s1");
		const state = store.get("s1", factory);
		expect(factoryCalls).toBe(2); // factory called again
	});

	it("size reflects active sessions", () => {
		store.get("s1", factory);
		store.get("s2", factory);
		store.get("s3", factory);
		expect(store.size).toBe(3);
	});

	it("evict removes stale (30+ min) sessions", () => {
		store.get("s1", factory);
		// Manually set lastAccess to 31 minutes ago
		const entry = (store as any).sessions.get("s1");
		entry.lastAccess = Date.now() - 31 * 60 * 1000;
		// Trigger eviction via new session
		store.get("s2", factory);
		expect((store as any).sessions.has("s1")).toBe(false);
		expect(store.size).toBe(1);
	});

	it("enforces max 10 concurrent sessions", () => {
		for (let i = 0; i < 12; i++) {
			store.get(`s${i}`, factory);
		}
		expect(store.size).toBeLessThanOrEqual(10);
	});

	it("clear empties all", () => {
		store.get("s1", factory);
		store.get("s2", factory);
		store.clear();
		expect(store.size).toBe(0);
	});

	it("concurrent sessions are isolated", async () => {
		const conStore = new SessionStore<{ count: number }>();
		const results = await Promise.all(
			[0, 1, 2, 3, 4].map((i) =>
				Promise.resolve().then(() => {
					const state = conStore.get(`s${i}`, () => ({ count: 0 }));
					state.count = i * 100;
					return state.count;
				}),
			),
		);
		expect(results).toEqual([0, 100, 200, 300, 400]);
	});

	it("concurrent eviction works", async () => {
		const evictStore = new SessionStore<{ count: number }>();
		await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				Promise.resolve().then(() => {
					evictStore.get(`s${i}`, () => ({ count: i }));
				}),
			),
		);
		expect(evictStore.size).toBeLessThanOrEqual(10);
	});
});
