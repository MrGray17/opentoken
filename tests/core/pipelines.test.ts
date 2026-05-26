import { describe, expect, it } from "bun:test";
import { applyBashFilter } from "@opentoken/core/pipelines/bash";
import { applyGlobFilter } from "@opentoken/core/pipelines/glob";
import { applyGrepFilter } from "@opentoken/core/pipelines/grep";
import { applyReadFilter } from "@opentoken/core/pipelines/read";
import { redactSecrets } from "@opentoken/core/utils/secrets";

const TEST_SESSION = "pipeline-test-session";

function makeOutput(lines: number, prefix = "line"): string {
	return Array.from({ length: lines }, (_, i) => `${prefix} ${i + 1}`).join(
		"\n",
	);
}

describe("Pipeline: applyBashFilter", () => {
	it("returns non-empty output for non-empty input", async () => {
		const input = makeOutput(100);
		const result = await applyBashFilter(TEST_SESSION, "echo test", input);
		expect(result.length).toBeGreaterThan(0);
	});

	it("output ≤ input size (conservative filter)", async () => {
		const input = makeOutput(50);
		const result = await applyBashFilter(TEST_SESSION, "echo test", input);
		expect(result.length).toBeLessThanOrEqual(input.length);
	});

	it("redacts secrets in output", async () => {
		const input = `some output with AKIAIOSFODNN7EXAMPLE key inside`;
		const result = await applyBashFilter(TEST_SESSION, "echo test", input);
		expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
	});

	it("strips ANSI escape codes", async () => {
		const input = makeOutput(60) + "\n\u001b[31mred\u001b[0m";
		const result = await applyBashFilter(TEST_SESSION, "echo test", input);
		expect(result).not.toContain("\u001b[31m");
	});

	it("removes thinking blocks", async () => {
		const input = `<antThinking>secret</antThinking>\n${makeOutput(60)}`;
		const result = await applyBashFilter(TEST_SESSION, "echo test", input);
		expect(result).not.toContain("<antThinking>");
	});

	it("handles binary output", async () => {
		const binary = "\0\0\0\0\0";
		const result = await applyBashFilter(TEST_SESSION, "cat binary", binary);
		expect(result).toContain("Binary");
	});

	it("returns original on pipeline failure", async () => {
		const input = makeOutput(50);
		const result = await applyBashFilter(TEST_SESSION, "", input);
		expect(result.length).toBeGreaterThan(0);
	});

	it("routes git status through git filter", async () => {
		const input = `On branch main
Changes not staged for commit:
  modified:   src/index.ts
  modified:   src/config.ts

Untracked files:
  src/new.ts`;
		const result = await applyBashFilter(TEST_SESSION, "git status", input);
		expect(result).toContain("modified");
	});

	it("routes npm install through npm filter", async () => {
		// Large enough to bypass shouldSkipFilter (need >40 lines or >20KB)
		const lines = Array.from({ length: 50 }, (_, i) =>
			i === 0
				? "added 150 packages in 5s"
				: i === 1
					? "40 packages are looking for funding"
					: i === 2
						? "up to date, audited 150 packages in 2s"
						: i === 3
							? "found 0 vulnerabilities"
							: `package ${i}: resolved and up-to-date`,
		);
		const input = lines.join("\n");
		const result = await applyBashFilter(TEST_SESSION, "npm install", input);
		expect(result.length).toBeLessThanOrEqual(input.length);
		expect(result).toContain("Added");
	});

	it("handles empty input gracefully", async () => {
		const result = await applyBashFilter(TEST_SESSION, "echo", "");
		expect(result).toBe("");
	});

	it("preserves error information", async () => {
		const input = `Error: something failed
    at foo (bar.js:1:2)
    at baz (qux.js:3:4)
${makeOutput(100)}`;
		const result = await applyBashFilter(TEST_SESSION, "node test", input);
		expect(result).toContain("Error");
	});
});

describe("Pipeline: applyReadFilter", () => {
	it("returns non-empty output for non-empty input", async () => {
		const input = makeOutput(100);
		const result = await applyReadFilter(TEST_SESSION, "test.ts", input);
		expect(result.length).toBeGreaterThan(0);
	});

	it("output ≤ input size (conservative filter)", async () => {
		const input = makeOutput(50);
		const result = await applyReadFilter(TEST_SESSION, "test.ts", input);
		expect(result.length).toBeLessThanOrEqual(input.length);
	});

	it("redacts secrets in content", async () => {
		const input = `const key = "sk-ant-abcdefghijklmnopqrstuvwxyz1234567890";`;
		const result = await applyReadFilter(TEST_SESSION, "test.ts", input);
		expect(result).not.toContain("sk-ant-");
	});

	it("handles path traversal attempts safely", async () => {
		const input = makeOutput(50);
		const result = await applyReadFilter(
			TEST_SESSION,
			"../../etc/passwd",
			input,
		);
		expect(result).toContain("OpenToken");
		expect(result).toContain("blocked");
	});

	it("strips thinking blocks from content", async () => {
		const input = `<thinking>internal</thinking>\n${makeOutput(60)}`;
		const result = await applyReadFilter(TEST_SESSION, "test.ts", input);
		expect(result).not.toContain("<thinking>");
	});

	it("handles binary content", async () => {
		const input = "\0\0\0\0\0";
		const result = await applyReadFilter(TEST_SESSION, "test.bin", input);
		expect(result).toContain("Binary");
	});

	it("handles empty input", async () => {
		const result = await applyReadFilter(TEST_SESSION, "empty.ts", "");
		expect(result).toBe("");
	});

	it("handles oversized content", async () => {
		const input = "x".repeat(11 * 1024 * 1024);
		const result = await applyReadFilter(TEST_SESSION, "big.ts", input);
		expect(result).toContain("suppressed");
	});
});

describe("Pipeline: applyGrepFilter", () => {
	it("returns non-empty output for non-empty input", async () => {
		const input = `foo.ts:1:const x = 1\nbar.ts:2:const y = 2`;
		const result = await applyGrepFilter(TEST_SESSION, input);
		expect(result.length).toBeGreaterThan(0);
	});

	it("output ≤ input size (conservative filter)", async () => {
		const input = makeOutput(50);
		const result = await applyGrepFilter(TEST_SESSION, input);
		expect(result.length).toBeLessThanOrEqual(input.length);
	});

	it("redacts secrets in grep output", async () => {
		const input = `config.ts:10:const apiKey = "AKIAIOSFODNN7EXAMPLE"`;
		const result = await applyGrepFilter(TEST_SESSION, input);
		expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
	});

	it("strips thinking blocks", async () => {
		const input = `<antThinking>secret</antThinking>\nfile.ts:1:content`;
		const result = await applyGrepFilter(TEST_SESSION, input);
		expect(result).not.toContain("<antThinking>");
	});

	it("handles binary output", async () => {
		const input = "\0\0\0\0\0";
		const result = await applyGrepFilter(TEST_SESSION, input);
		expect(result).toContain("Binary");
	});

	it("handles empty input", async () => {
		const result = await applyGrepFilter(TEST_SESSION, "");
		expect(result).toBe("");
	});

	it("returns original on error", async () => {
		const input = makeOutput(50);
		const result = await applyGrepFilter("bad-session", input);
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("Pipeline: applyGlobFilter", () => {
	it("returns non-empty output for non-empty input", async () => {
		const input = `src/index.ts\nsrc/config.ts\nsrc/utils/errors.ts`;
		const result = await applyGlobFilter(TEST_SESSION, input);
		expect(result.length).toBeGreaterThan(0);
	});

	it("output ≤ input size (conservative filter)", async () => {
		const input = makeOutput(50);
		const result = await applyGlobFilter(TEST_SESSION, input);
		expect(result.length).toBeLessThanOrEqual(input.length);
	});

	it("redacts secrets in glob output", async () => {
		const input = `config.ts (contains "sk-abcdefghijklmnopqrstuvwxyz1234567890")`;
		const result = await applyGlobFilter(TEST_SESSION, input);
		expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
	});

	it("strips thinking blocks", async () => {
		const input = `<antThinking>secret</antThinking>\nsrc/index.ts`;
		const result = await applyGlobFilter(TEST_SESSION, input);
		expect(result).not.toContain("<antThinking>");
	});

	it("handles empty input", async () => {
		const result = await applyGlobFilter(TEST_SESSION, "");
		expect(result).toBe("");
	});

	it("handles oversized output", async () => {
		const input = "x".repeat(11 * 1024 * 1024);
		const result = await applyGlobFilter(TEST_SESSION, input);
		expect(result).toContain("suppressed");
	});
});
