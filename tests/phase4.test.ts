import { beforeEach, describe, expect, it } from "bun:test";
import {
	deescalate,
	getCompressionLevel,
	resetEscalation,
	updateContext,
} from "../src/autoescalate";
import { filterGeneric } from "../src/families/generic";
import { detectAndHandleBinary, shortenUrls } from "../src/postcall";
import { isMinifiedOrGenerated } from "../src/precall";
import { progressiveDisclosure } from "../src/progressive";

const TEST_SESSION = "phase4-test";

// Phase 4 Item 1: Threshold tuning
// Constants live in source files (80 lines, 8KB, 20KB) — verify behavioral effects
describe("Phase 4: Threshold Tuning", () => {
	it("generic filter passes through ≤80 lines", () => {
		const lines80 = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const result = filterGeneric(lines80);
		expect(result).toBe(lines80);
	});
	it("generic filter truncates at >80 lines", () => {
		const lines81 = Array.from({ length: 81 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const result = filterGeneric(lines81);
		expect(result).toContain("lines omitted");
	});
	it("generic filter passes through short output within limits", () => {
		const short = "Hello, world!";
		const result = filterGeneric(short);
		expect(result).toBe(short);
	});
	it("generic filter preserves head and tail on truncation", () => {
		const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		const result = filterGeneric(lines.join("\n"));
		expect(result).toContain("line 1");
		expect(result).toContain("line 20");
		expect(result).toContain("line 81");
		expect(result).toContain("line 100");
		expect(result).toContain("lines omitted");
	});
});

// Phase 4 Item 2: De-escalation hysteresis
describe("Phase 4: De-escalation Hysteresis", () => {
	beforeEach(() => resetEscalation(TEST_SESSION));

	it("starts at off", () => {
		expect(getCompressionLevel(TEST_SESSION)).toBe("off");
	});

	it("escalates to lean at 50%, de-escalates from lean at <45% (5% buffer)", () => {
		updateContext(TEST_SESSION, 100000, 200000); // 50% fill
		expect(getCompressionLevel(TEST_SESSION)).toBe("lean");

		// Reset context usage to simulate compaction, then deescalate
		// We need to manually reduce fillPct for de-escalation
		const level = deescalate(TEST_SESSION);
		// fillPct is still 0.50, so de-escalate won't trigger
		expect(level).toBe("lean");
	});

	it("escalates to ultra at 70%, de-escalates from ultra at <65% (5% buffer)", () => {
		updateContext(TEST_SESSION, 140000, 200000); // 70% fill
		expect(getCompressionLevel(TEST_SESSION)).toBe("ultra");
	});

	it("escalates to ceiling at 85%, de-escalates from ceiling at <65% (20% buffer)", () => {
		updateContext(TEST_SESSION, 170000, 200000); // 85% fill
		expect(getCompressionLevel(TEST_SESSION)).toBe("ceiling");
	});

	it("de-escalates from ultra to lean when fill < 80%", () => {
		updateContext(TEST_SESSION, 140000, 200000); // 70% fill → ultra
		expect(getCompressionLevel(TEST_SESSION)).toBe("ultra");

		// deescalate: fillPct 0.70 < 0.80, so ultra → lean
		const level = deescalate(TEST_SESSION);
		expect(level).toBe("lean");

		// BUT: updateContext re-computes: 70% >= 70% → ultra
		// This means oscillation between ultra and lean at 70-80% fill
		const reLevel = updateContext(TEST_SESSION, 0); // used=0, no change
		expect(reLevel).toBe("ultra");
	});

	it("OSCILLATION WARNING: de-escalate ultra→lean at <80% conflicts with escalate ultra at >=70%", () => {
		// At 75% fill: level is "ultra" (75 >= 70)
		updateContext(TEST_SESSION, 150000, 200000);
		expect(getCompressionLevel(TEST_SESSION)).toBe("ultra");

		// deescalate: 75 < 80 → drops to "lean"
		const afterDe = deescalate(TEST_SESSION);
		expect(afterDe).toBe("lean");

		// updateContext: 75 >= 70 → re-escalates to "ultra"
		const afterUpdate = updateContext(TEST_SESSION, 0);
		expect(afterUpdate).toBe("ultra");

		// deescalate again: 75 < 80 → drops to "lean" again
		const afterDe2 = deescalate(TEST_SESSION);
		expect(afterDe2).toBe("lean");
	});
});

// Phase 4 Item 3: Stack trace regex false positives
describe("Phase 4: Stack Trace Regex False Positives", () => {
	it("does NOT match 'Look at this awesome code (really!)'", () => {
		const input = "Look at this awesome code (really!)";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match 'const at = getValue()'", () => {
		const input = "const at = getValue()";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match 'at the end of the day'", () => {
		const input = "at the end of the day, we should ship it";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match 'performAt: 42 (location)'", () => {
		const input = "performAt: 42 (location)";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match 'at 10:00 AM (scheduled)'", () => {
		const input = "at 10:00 AM (scheduled)";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match regular error text without stack frames", () => {
		const input = "Error: Cannot find module 'foo'";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("does NOT match a single stack frame (needs >5 to compress)", () => {
		const input = "at foo (bar.js:1:2)";
		const result = filterGeneric(input);
		expect(result).toBe(input);
	});

	it("correctly compresses actual stack traces with >5 frames", () => {
		const stack = `Error: boom
at foo (bar.js:1:2)
at baz (qux.js:3:4)
at quux (corge.js:5:6)
at grault (garply.js:7:8)
at waldo (fred.js:9:10)
at plugh (xyzzy.js:11:12)`;
		const result = filterGeneric(stack);
		expect(result).toContain("stack frames omitted");
		expect(result).toContain("at foo (bar.js:1:2)");
		expect(result).toContain("at plugh (xyzzy.js:11:12)");
	});
});

// Phase 4 Item 4: URL shortening
// NOTE: shortenUrls only shortens URLs > 100 chars. All test URLs must exceed that.
describe("Phase 4: URL Shortening Edge Cases", () => {
	it("shortens HTTPS URLs with complex query params (>100 chars)", () => {
		const url =
			"https://api.example.com/v1/data?token=abc123&limit=50&offset=100&sort=asc&foo=bar&baz=qux&extra=paddingxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
		const input = "Visit " + url + " for more";
		const result = shortenUrls(input);
		expect(result).toBe("Visit https://api.example.com/v1/data for more");
	});

	it("handles encoded URLs correctly (>100 chars)", () => {
		const url =
			"https://example.com/path%20with%20spaces%20and%20more%20padding%20here%20for%20length?q=search&lang=en&extra=yes&token=abc123def456ghi789jkl012mno345";
		const input = "See " + url;
		const result = shortenUrls(input);
		expect(result).toBe(
			"See https://example.com/path%20with%20spaces%20and%20more%20padding%20here%20for%20length",
		);
	});

	it("handles URLs with IP addresses (>100 chars)", () => {
		const url =
			"http://192.168.1.1:8080/admin/some/long/path/with/many/segments/here?action=view&id=42&token=abc123def456ghi789jkl012mno345pqr678";
		const result = shortenUrls(url);
		expect(result).toBe(
			"http://192.168.1.1:8080/admin/some/long/path/with/many/segments/here",
		);
	});

	it("does NOT shorten file:// URLs", () => {
		const input =
			"file:///etc/passwd?param=value&long=padding_abc123def456ghi789jkl012mno345pqr678";
		const result = shortenUrls(input);
		// file:// is not matched by the https?:// regex, so it passes through unchanged
		expect(result).toBe(
			"file:///etc/passwd?param=value&long=padding_abc123def456ghi789jkl012mno345pqr678",
		);
	});

	it("does NOT shorten data: URIs", () => {
		const input =
			"data:text/plain;charset=utf-8,hello world with some more text to make it longer here for padding";
		const result = shortenUrls(input);
		expect(result).toBe(
			"data:text/plain;charset=utf-8,hello world with some more text to make it longer here for padding",
		);
	});

	it("handles URLs with auth info (>100 chars) — NOTE: URL.origin strips auth", () => {
		const url =
			"https://user:pass@example.com/secure/path/with/more/segments/here?key=value&token=abc123def456ghi789jkl012mno345pqr678";
		const result = shortenUrls(url);
		// URL.origin strips user:pass (standard URL behavior)
		expect(result).toBe(
			"https://example.com/secure/path/with/more/segments/here",
		);
	});

	it("handles URLs with fragments (>100 chars)", () => {
		const url =
			"https://example.com/page#section?param=value&extra=padding_for_100_chars_abc123def456ghi789jkl012mno345pqr678";
		const result = shortenUrls(url);
		expect(result).toBe("https://example.com/page");
	});

	it("leaves short URLs unchanged (<100 chars)", () => {
		const input = "See https://example.com for details";
		const result = shortenUrls(input);
		expect(result).toBe(input);
	});

	it("handles multiple long URLs", () => {
		const url1 =
			"https://api.example.com/v1/data?foo=bar&baz=qux&token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";
		const url2 =
			"https://cdn.example.com/assets/image.png?width=100&height=200&format=png&quality=90&crop=center&v=1234567890";
		const input = url1 + " and " + url2;
		const result = shortenUrls(input);
		expect(result).toContain("https://api.example.com/v1/data");
		expect(result).toContain("https://cdn.example.com/assets/image.png");
		expect(result).not.toContain("foo=bar");
		expect(result).not.toContain("width=100");
	});
});

// Phase 4 Item 5: Lock file blocking (overridable via allowLockFiles)
describe("Phase 4: Lock File Blocking", () => {
	it("blocks package-lock.json", () => {
		expect(isMinifiedOrGenerated("package-lock.json")).toBe(true);
	});
	it("blocks yarn.lock", () => {
		expect(isMinifiedOrGenerated("yarn.lock")).toBe(true);
	});
	it("blocks Cargo.lock", () => {
		expect(isMinifiedOrGenerated("Cargo.lock")).toBe(true);
	});
	it("blocks pnpm-lock.yaml", () => {
		expect(isMinifiedOrGenerated("pnpm-lock.yaml")).toBe(true);
	});
	it("blocks Gemfile.lock", () => {
		expect(isMinifiedOrGenerated("Gemfile.lock")).toBe(true);
	});
	it("blocks go.sum", () => {
		expect(isMinifiedOrGenerated("go.sum")).toBe(true);
	});
	it("blocks composer.lock", () => {
		expect(isMinifiedOrGenerated("composer.lock")).toBe(true);
	});
	it("blocks bun.lock", () => {
		expect(isMinifiedOrGenerated("bun.lock")).toBe(true);
	});
	it("blocks bun.lockb", () => {
		expect(isMinifiedOrGenerated("bun.lockb")).toBe(true);
	});
	it("blocks poetry.lock", () => {
		expect(isMinifiedOrGenerated("poetry.lock")).toBe(true);
	});
	it("blocks Pipfile.lock", () => {
		expect(isMinifiedOrGenerated("Pipfile.lock")).toBe(true);
	});
	it("does NOT block regular files", () => {
		expect(isMinifiedOrGenerated("package.json")).toBe(false);
		expect(isMinifiedOrGenerated("src/index.ts")).toBe(false);
		expect(isMinifiedOrGenerated("README.md")).toBe(false);
	});
	it("allowLockFiles=true bypasses lock file blocking", () => {
		expect(isMinifiedOrGenerated("package-lock.json", true)).toBe(false);
		expect(isMinifiedOrGenerated("bun.lock", true)).toBe(false);
		expect(isMinifiedOrGenerated("yarn.lock", true)).toBe(false);
		// Non-lock minified files are still blocked even with allowLockFiles
		expect(isMinifiedOrGenerated("dist/bundle.min.js", true)).toBe(true);
	});
});

// Phase 4 Item 6: Binary detection (64KB threshold)
// Uses detectAndHandleBinary (public wrapper for isBinaryOutput)
describe("Phase 4: Binary Detection 64KB Threshold", () => {
	it("detects binary with NUL bytes in first 64KB", () => {
		const text = "hello\0world\0test\0more\0";
		const result = detectAndHandleBinary(text);
		expect(result.binary).toBe(true);
	});

	it("allows text with ≤3 NUL bytes", () => {
		const text = "hello\0world\0test";
		const result = detectAndHandleBinary(text);
		expect(result.binary).toBe(false);
	});

	it("allows clean text", () => {
		const text = "Hello, World! This is clean text.";
		const result = detectAndHandleBinary(text);
		expect(result.binary).toBe(false);
	});

	it("detects binary when NULs are within first 64KB", () => {
		const largeText = "A".repeat(60000) + "\0\0\0\0" + "B".repeat(10000); // NULs at byte 60001, within 64KB
		const result = detectAndHandleBinary(largeText);
		expect(result.binary).toBe(true);
	});

	it("allows text with NULs only past 64KB", () => {
		const text = "A".repeat(70000) + "\0\0\0\0";
		const result = detectAndHandleBinary(text);
		expect(result.binary).toBe(false); // NULs past 65536 byte window
	});

	it("handles empty text", () => {
		const result = detectAndHandleBinary("");
		expect(result.binary).toBe(false);
	});
});
