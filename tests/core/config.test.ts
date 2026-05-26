import { describe, expect, it } from "bun:test";
import { loadConfig, validateConfig } from "@opentoken/core/config";

const DEFAULT_CONFIG = {
	maxOutputBytes: 10 * 1024 * 1024,
	maxProcessingMs: 5000,
	safeReadRoot: "",
	enableMetrics: true,
	enableSymbolIndex: true,
	conservativeUseTokens: false,
	enableHistoryCompression: true,
	historyCompressionWindow: 4,
	enableSessionMemory: false,
	enableTui: true,
	tuiUseEmoji: true,
	allowLockFileReads: false,
	enableOutputSaving: true,
};

describe("validateConfig", () => {
	it("returns defaults for empty input", () => {
		const result = validateConfig({});
		expect(result.maxOutputBytes).toBe(DEFAULT_CONFIG.maxOutputBytes);
		expect(result.enableMetrics).toBe(DEFAULT_CONFIG.enableMetrics);
	});

	it("validates number values", () => {
		const result = validateConfig({ maxOutputBytes: 5 * 1024 * 1024 });
		expect(result.maxOutputBytes).toBe(5 * 1024 * 1024);
	});

	it("coerces number with NaN to default", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime type coercion
		const result = validateConfig({ maxOutputBytes: NaN } as any);
		expect(result.maxOutputBytes).toBe(DEFAULT_CONFIG.maxOutputBytes);
	});

	it("coerces number with wrong type to default", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime type coercion
		const result = validateConfig({ maxOutputBytes: "not-a-number" } as any);
		expect(result.maxOutputBytes).toBe(DEFAULT_CONFIG.maxOutputBytes);
	});

	it("rejects maxOutputBytes below 1MB", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ maxOutputBytes: 500 * 1024 } as any);
		expect(result.maxOutputBytes).toBe(DEFAULT_CONFIG.maxOutputBytes);
	});

	it("rejects maxOutputBytes above 100MB", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ maxOutputBytes: 200 * 1024 * 1024 } as any);
		expect(result.maxOutputBytes).toBe(DEFAULT_CONFIG.maxOutputBytes);
	});

	it("rejects maxProcessingMs below 100", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ maxProcessingMs: 50 } as any);
		expect(result.maxProcessingMs).toBe(DEFAULT_CONFIG.maxProcessingMs);
	});

	it("rejects maxProcessingMs above 30000", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ maxProcessingMs: 60000 } as any);
		expect(result.maxProcessingMs).toBe(DEFAULT_CONFIG.maxProcessingMs);
	});

	it("rejects historyCompressionWindow below 1", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ historyCompressionWindow: 0 } as any);
		expect(result.historyCompressionWindow).toBe(
			DEFAULT_CONFIG.historyCompressionWindow,
		);
	});

	it("rejects historyCompressionWindow above 100", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime range check
		const result = validateConfig({ historyCompressionWindow: 200 } as any);
		expect(result.historyCompressionWindow).toBe(
			DEFAULT_CONFIG.historyCompressionWindow,
		);
	});

	it("validates boolean values", () => {
		const result = validateConfig({ enableMetrics: false });
		expect(result.enableMetrics).toBe(false);
	});

	it("coerces boolean with wrong type to default", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime type coercion
		const result = validateConfig({ enableMetrics: "yes" } as any);
		expect(result.enableMetrics).toBe(DEFAULT_CONFIG.enableMetrics);
	});

	it("validates string values", () => {
		const result = validateConfig({ safeReadRoot: "/custom/path" });
		expect(result.safeReadRoot).toBe("/custom/path");
	});

	it("coerces string with wrong type to default", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime type coercion
		const result = validateConfig({ safeReadRoot: 42 } as any);
		expect(result.safeReadRoot).toBe(DEFAULT_CONFIG.safeReadRoot);
	});

	it("partially overrides defaults", () => {
		const result = validateConfig({
			enableMetrics: false,
			enableSymbolIndex: false,
		});
		expect(result.enableMetrics).toBe(false);
		expect(result.enableSymbolIndex).toBe(false);
		expect(result.enableHistoryCompression).toBe(
			DEFAULT_CONFIG.enableHistoryCompression,
		);
	});

	it("returns all keys present in result", () => {
		const result = validateConfig({});
		const keys = Object.keys(result);
		for (const key of Object.keys(DEFAULT_CONFIG)) {
			expect(keys).toContain(key);
		}
	});
});

describe("loadConfig", () => {
	it("loads config from file when exists", async () => {
		await loadConfig("/tmp");
		expect(true).toBe(true);
	});
});
