import { describe, expect, it } from "bun:test";
import { recordMetric } from "@mrgray17/opentoken-core/utils/metrics";

describe("recordMetric", () => {
	it("writes a metric entry without throwing", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior
		const entry: any = {
			ts: new Date().toISOString(),
			tool: "bash",
			family: "generic",
			sessionID: "test-session",
			before_tokens: 1000,
			after_tokens: 500,
			saved_pct: 50,
		};
		expect(() => recordMetric(entry)).not.toThrow();
	});

	it("writes entry with stage latency", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior
		const entry: any = {
			ts: new Date().toISOString(),
			tool: "read",
			family: "read",
			sessionID: "test-session",
			before_tokens: 2000,
			after_tokens: 1500,
			saved_pct: 25,
			stage_latency_ms: { read: 10, lzw: 5 },
			stage_success: { read: true, lzw: true },
		};
		expect(() => recordMetric(entry as any)).not.toThrow();
	});

	it("writes entry with memory stats", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior
		const entry: any = {
			ts: new Date().toISOString(),
			tool: "bash",
			family: "generic",
			sessionID: "test-session",
			before_tokens: 5000,
			after_tokens: 2500,
			saved_pct: 50,
			memory: {
				rewind_store_size: 10,
				offload_store_size: 3,
				session_count: 2,
				cache_size: 50,
			},
		};
		expect(() => recordMetric(entry)).not.toThrow();
	});

	it("writes entry with assistant role", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior
		const entry: any = {
			ts: new Date().toISOString(),
			tool: "text",
			family: "generic",
			sessionID: "test-session",
			before_tokens: 300,
			after_tokens: 200,
			saved_pct: 33,
			role: "assistant",
		};
		expect(() => recordMetric(entry)).not.toThrow();
	});

	it("handles empty strings and zeros gracefully", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime behavior
		const entry: any = {
			ts: "",
			tool: "",
			family: "",
			before_tokens: 0,
			after_tokens: 0,
			saved_pct: 0,
		};
		expect(() => recordMetric(entry)).not.toThrow();
	});
});
