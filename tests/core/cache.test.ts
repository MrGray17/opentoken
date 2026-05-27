import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCachedRead, setCachedRead } from "@mrgray17/opentoken-core/utils/cache";

const TEST_SESSION = "cache-test";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opentoken-cache-"));

describe("getCachedRead / setCachedRead", () => {
	it("returns null for nonexistent file", () => {
		const filePath = path.join(tmpDir, "/nonexistent/file.ts");
		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});

	it("caches and retrieves file content", () => {
		const filePath = path.join(tmpDir, "test.ts");
		fs.writeFileSync(filePath, "export const x = 1;");
		setCachedRead(TEST_SESSION, filePath, "export const x = 1;");

		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBe("export const x = 1;");
	});

	it("returns null after file modification", () => {
		const filePath = path.join(tmpDir, "modified.ts");
		fs.writeFileSync(filePath, "original");
		setCachedRead(TEST_SESSION, filePath, "original");

		const mtimeBefore = fs.statSync(filePath).mtimeMs;
		let mtimeAfter = mtimeBefore;
		let attempts = 0;
		while (mtimeAfter <= mtimeBefore && attempts < 100) {
			fs.writeFileSync(filePath, "modified content");
			mtimeAfter = fs.statSync(filePath).mtimeMs;
			attempts++;
		}

		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});

	it("returns null for deleted file", () => {
		const filePath = path.join(tmpDir, "deleted.ts");
		fs.writeFileSync(filePath, "temp");
		setCachedRead(TEST_SESSION, filePath, "temp");
		fs.unlinkSync(filePath);

		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});

	it("uses session-isolated cache", () => {
		const filePath = path.join(tmpDir, "isolated.ts");
		fs.writeFileSync(filePath, "session specific");
		setCachedRead("session-a", filePath, "session specific");

		const result = getCachedRead("session-b", filePath);
		expect(result).toBeNull();
	});

	it("setCachedRead does not throw on nonexistent file", () => {
		expect(() =>
			setCachedRead(TEST_SESSION, "/nonexistent/cannot/stat.ts", "content"),
		).not.toThrow();
	});

	it("getCachedRead returns null for unreadable file", () => {
		const filePath = path.join(tmpDir, "/nonexistent/file.ts");
		const result = getCachedRead(TEST_SESSION, filePath);
		expect(result).toBeNull();
	});
});
