import { describe, expect, it } from "bun:test";
import { cleanupOffloaded, progressiveDisclosure } from "@opentoken/core/progressive";

const TEST_SESSION = "progressive-test";

describe("progressiveDisclosure", () => {
	it("returns inline for short content", async () => {
		const input = "short content";
		const result = await progressiveDisclosure(TEST_SESSION, input, "bash");
		expect(result.offloaded).toBe(false);
		expect(result.result).toBe(input);
	});

	it("offloads large bash output", async () => {
		const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
		const input = lines.join("\n");
		const result = await progressiveDisclosure(TEST_SESSION, input, "bash");
		expect(typeof result.offloaded).toBe("boolean");
		expect(typeof result.result).toBe("string");
	});

	it("offloads large read output", async () => {
		const input = Array.from(
			{ length: 50 },
			(_, i) => `line with some data ${i}`,
		).join("\n");
		const result = await progressiveDisclosure(TEST_SESSION, input, "read");
		expect(typeof result.offloaded).toBe("boolean");
	});

	it("offloads large grep output", async () => {
		const input = Array.from(
			{ length: 30 },
			(_, i) => `src/file${i}.ts:${i}:content`,
		).join("\n");
		const result = await progressiveDisclosure(TEST_SESSION, input, "grep");
		expect(typeof result.offloaded).toBe("boolean");
	});

	it("offloads large glob output", async () => {
		const input = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`).join(
			"\n",
		);
		const result = await progressiveDisclosure(TEST_SESSION, input, "glob");
		expect(typeof result.offloaded).toBe("boolean");
	});

	it("returns fallback head+tail when offload fails", async () => {
		// Very short content should be inline, not offloaded
		const result = await progressiveDisclosure(TEST_SESSION, "hi", "unknown");
		expect(result.offloaded).toBe(false);
		expect(result.result).toBe("hi");
	});

	it("handles empty content", async () => {
		const result = await progressiveDisclosure(TEST_SESSION, "", "bash");
		expect(result.offloaded).toBe(false);
		expect(result.result).toBe("");
	});
});

describe("cleanupOffloaded", () => {
	it("returns 0 when nothing to clean", async () => {
		const cleared = await cleanupOffloaded("non-existent-session", 0);
		expect(cleared).toBe(0);
	});
});
