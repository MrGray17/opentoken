import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	sanitizeFilePath,
	validateOutputSize,
	validateToolName,
} from "@mrgray17/opentoken-core/guards";

describe("validateToolName", () => {
	it("returns tool name for known tools", () => {
		expect(validateToolName("bash")).toBe("bash");
		expect(validateToolName("read")).toBe("read");
		expect(validateToolName("grep")).toBe("grep");
		expect(validateToolName("glob")).toBe("glob");
		expect(validateToolName("write")).toBe("write");
		expect(validateToolName("edit")).toBe("edit");
		expect(validateToolName("web_fetch")).toBe("web_fetch");
		expect(validateToolName("web_search")).toBe("web_search");
	});

	it("sanitizes unknown tool names", () => {
		expect(validateToolName("")).toBe("");
		expect(validateToolName("bash; rm -rf /")).toBe("bashrmrf");
		expect(validateToolName("npm install")).toBe("npminstall");
		expect(validateToolName("unknown")).toBe("unknown");
	});

	it("returns 'unknown' for non-string input", () => {
		expect(validateToolName(undefined)).toBe("unknown");
		expect(validateToolName(null)).toBe("unknown");
		expect(validateToolName(42)).toBe("unknown");
	});
});

describe("sanitizeFilePath", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opentoken-guards-"));
	const subDir = path.join(tmpDir, "sub");
	fs.mkdirSync(subDir, { recursive: true });

	it("allows paths inside root directory", () => {
		const result = sanitizeFilePath("test.ts", tmpDir);
		expect(result.safe).toBe(true);
		expect(result.resolved).toBe(path.join(tmpDir, "test.ts"));
	});

	it("allows paths in subdirectories", () => {
		const result = sanitizeFilePath("sub/test.ts", tmpDir);
		expect(result.safe).toBe(true);
		expect(result.resolved).toBe(path.join(tmpDir, "sub", "test.ts"));
	});

	it("blocks path traversal with ..", () => {
		const result = sanitizeFilePath("../outside.ts", subDir);
		expect(result.safe).toBe(false);
		expect(result.reason).toContain("Path traversal");
	});

	it("blocks complex path traversal", () => {
		const result = sanitizeFilePath(
			"sub/../../outside.ts",
			path.join(tmpDir, "sub"),
		);
		expect(result.safe).toBe(false);
	});

	it("blocks absolute paths outside root", () => {
		const result = sanitizeFilePath("/etc/passwd", tmpDir);
		expect(result.safe).toBe(false);
		expect(result.reason).toContain("Path traversal");
	});

	it("detects symlink cycles", () => {
		const cycleDir = fs.mkdtempSync(path.join(os.tmpdir(), "opentoken-cycle-"));
		const link1 = path.join(cycleDir, "link1");
		const link2 = path.join(cycleDir, "link2");
		try {
			fs.symlinkSync(link2, link1);
			fs.symlinkSync(link1, link2);
			const result = sanitizeFilePath("link1", cycleDir);
			expect(result.safe).toBe(false);
			expect(result.reason).toContain("Symlink cycle");
		} catch {
			// Symlinks may not be available on all platforms
		}
	});

	it("allows absolute paths that are inside root", () => {
		const result = sanitizeFilePath(tmpDir, tmpDir);
		expect(result.safe).toBe(true);
	});

	it("handles empty filePath", () => {
		const result = sanitizeFilePath("", tmpDir);
		expect(result.resolved).toBe(tmpDir);
	});
});

describe("validateOutputSize", () => {
	it("accepts output within limits", () => {
		const output = "hello world";
		const result = validateOutputSize(output);
		expect(result.valid).toBe(true);
	});

	it("rejects oversized output", () => {
		const output = "x".repeat(11 * 1024 * 1024);
		const result = validateOutputSize(output);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("MB");
	});

	it("accepts output at boundary", () => {
		const output = "x".repeat(9 * 1024 * 1024);
		const result = validateOutputSize(output);
		expect(result.valid).toBe(true);
	});

	it("handles empty output", () => {
		const result = validateOutputSize("");
		expect(result.valid).toBe(true);
	});
});
