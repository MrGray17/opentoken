import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCachedRead, setCachedRead } from "@opentoken/core/utils/cache";

const TEST_SESSION = "cache-test";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opentoken-cache-"));

describe("getCachedRead / setCachedRead", () => {
	it("returns null for uncached file", () => {
		const result = getCachedRead(TEST_SESSION, "/nonexistent/file.ts");
		expect(result).toBeNull();
	});

	it("caches and retrieves file content", () => {
		const filePath = path.join(tmpDir, "test.ts");
		fs.writeFileSync(filePath, "export const x = 1;", "utf-8");
		setCachedRead(TEST_SESSION, filePath, "export const x = 1;");
		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBe("export const x = 1;");
	});

	it("returns null after file modification", () => {
		const filePath = path.join(tmpDir, "modified.ts");
		fs.writeFileSync(filePath, "original", "utf-8");
		setCachedRead(TEST_SESSION, filePath, "original");
		// Modify file
		fs.writeFileSync(filePath, "modified content", "utf-8");
		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});

	it("returns null for deleted file", () => {
		const filePath = path.join(tmpDir, "deleted.ts");
		fs.writeFileSync(filePath, "temp", "utf-8");
		setCachedRead(TEST_SESSION, filePath, "temp");
		fs.unlinkSync(filePath);
		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});

	it("uses session-isolated cache", () => {
		const filePath = path.join(tmpDir, "isolated.ts");
		fs.writeFileSync(filePath, "session specific", "utf-8");
		setCachedRead("session-a", filePath, "session specific");

		// Different session should not have it cached
		const result = getCachedRead("session-b", filePath);
		expect(result).toBeNull();
	});

	it("setCachedRead does not throw on nonexistent file", () => {
		expect(() =>
			setCachedRead(TEST_SESSION, "/nonexistent/cannot/stat.ts", "content"),
		).not.toThrow();
	});

	it("getCachedRead returns null for unreadable file", () => {
		const result = getCachedRead(TEST_SESSION, "/nonexistent/file.ts");
		expect(result).toBeNull();
	});
});
