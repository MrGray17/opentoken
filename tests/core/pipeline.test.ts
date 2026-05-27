// OpenToken — Test Suite
// Validates all 24 layers work correctly

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const _TEST_SESSION = "test-session";

import {
	getFamilyEffectiveness,
	isStageWorthwhile,
	resetCache,
} from "@opentoken/core/autotune";
import { filterGeneric } from "@opentoken/core/families/generic";
import { validateOutputSize } from "@opentoken/core/guards";
import {
	buildMemoryPrompt,
	clearMemory,
	extractContextKeywords,
	getMemoryStats,
	writeSessionSummary,
} from "@opentoken/core/memory";
import {
	aliasJsonKeys,
	cleanWhitespaceAndNulls,
	detectAndHandleBinary,
	minifyJSON,
	minimizeTableWhitespace,
	normalizeLogNoise,
	shortenUrls,
	stripBase64Content,
	stripThinkingBlocks,
	suppressOversized,
} from "@opentoken/core/postcall";
// Phase 1 imports
import {
	isMinifiedOrGenerated,
	preCallFilter,
	rewriteCommand,
} from "@opentoken/core/precall";
import { redactSecrets } from "@opentoken/core/utils/secrets";
import { estimateTokens } from "@opentoken/core/utils/tokens";

describe("L1: Command Rewrite", () => {
	it("rewrites npm install to silent", () => {
		expect(rewriteCommand("npm install")).toContain("--silent");
	});
	it("rewrites curl to silent", () => {
		expect(rewriteCommand("curl https://example.com")).toContain("-s");
	});
	it("rewrites git log to oneline", () => {
		expect(rewriteCommand("git log")).toContain("--oneline");
	});
	it("rewrites cargo build to quiet", () => {
		expect(rewriteCommand("cargo build")).toContain("--quiet");
	});
	it("rewrites pytest to quiet", () => {
		expect(rewriteCommand("pytest tests/")).toContain("-q");
	});
	it("doesn't double-rewrite", () => {
		const once = rewriteCommand("npm install --silent");
		expect(once).not.toContain("--silent --silent");
	});
});

describe("L2: Block Minified Files", () => {
	it("blocks .min.js", () => {
		expect(isMinifiedOrGenerated("app.min.js")).toBe(true);
	});
	it("blocks node_modules", () => {
		expect(isMinifiedOrGenerated("node_modules/react/index.js")).toBe(true);
	});
	it("blocks dist/", () => {
		expect(isMinifiedOrGenerated("dist/bundle.js")).toBe(true);
	});
	it("allows source files", () => {
		expect(isMinifiedOrGenerated("src/app.ts")).toBe(false);
	});
});

describe("L7: Binary Detection", () => {
	it("detects binary content", () => {
		const binary = "\0\0\0\0\0\0\0\0\0\0";
		expect(detectAndHandleBinary(binary).binary).toBe(true);
	});
	it("allows text content", () => {
		expect(detectAndHandleBinary("hello world").binary).toBe(false);
	});
});

describe("L9: Strip Thinking Blocks", () => {
	it("removes antThinking blocks", () => {
		const input =
			"<antThinking>secret reasoning</antThinking>\n\nActual response";
		expect(stripThinkingBlocks(input)).toBe("Actual response");
	});
	it("removes thinking blocks", () => {
		const input = "<thinking>internal monologue</thinking>\n\nResponse";
		expect(stripThinkingBlocks(input)).toBe("Response");
	});
});

describe("L10: Whitespace/Null Cleanup", () => {
	it("strips null values", () => {
		const input = '{"name": "test", "unused": null, "empty": ""}';
		const result = cleanWhitespaceAndNulls(input);
		expect(result).not.toContain('"unused": null');
	});
	it("strips timestamps", () => {
		const input = '{"name": "test", "created_at": "2026-05-19T00:00:00Z"}';
		const result = cleanWhitespaceAndNulls(input);
		expect(result).not.toContain("created_at");
	});
});

describe("L11: Key Aliasing", () => {
	it("aliases long keys", () => {
		const input = '{"description": "test", "configuration": {"auth": true}}';
		const result = aliasJsonKeys(input);
		expect(result).toContain('"desc"');
		expect(result).toContain('"config"');
	});
});

describe("L0: Secret Redaction", () => {
	it("redacts AWS keys", () => {
		const input = "AKIAIOSFODNN7EXAMPLE";
		expect(redactSecrets(input)).toContain("[REDACTED]");
	});
	it("redacts GitHub tokens", () => {
		const input = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12";
		expect(redactSecrets(input)).toContain("[REDACTED]");
	});
	it("redacts API keys", () => {
		const input = 'api_key = "sk-abcdefghijklmnopqrstuvwxyz123456"';
		expect(redactSecrets(input)).toContain("[REDACTED]");
	});
});

// ─── PHASE 2 TESTS ───

describe("Token Estimation", () => {
	it("estimates tokens correctly", () => {
		expect(estimateTokens("hello world")).toBe(3); // 11 chars * 0.25 = 2.75 → 3
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("a".repeat(100))).toBe(25);
	});
});

describe("Pre-Call Filter", () => {
	it("rewrites bash commands", () => {
		const result = preCallFilter("bash", { command: "npm install" });
		expect(result.modifiedArgs?.command).toContain("--silent");
	});
	it("blocks minified file reads", () => {
		const result = preCallFilter("read", { filePath: "app.min.js" });
		expect(result.blocked).toBe(true);
	});
	it("blocks oversized writes", () => {
		const result = preCallFilter("write", { content: "a".repeat(200000) });
		expect(result.blocked).toBe(true);
	});
});

describe("Post-Call Process", () => {
	it("strips thinking blocks", () => {
		const input = "\n\nResponse";
		const result = stripThinkingBlocks(input);
		expect(result).not.toContain("antThinking");
	});
	it("suppresses oversized output", () => {
		const input = "a".repeat(600000);
		const result = suppressOversized(input, 500 * 1024);
		expect(result.result).toContain("suppressed");
	});
	it("detects binary output", () => {
		const input = "\0\0\0\0\0\0\0\0\0\0";
		const result = detectAndHandleBinary(input);
		expect(result.result).toContain("Binary");
	});
});

describe("L29: Log Normalization", () => {
	it("normalizes timestamps", () => {
		const input = "[2026-05-21 15:53:32.412] Starting build";
		const result = normalizeLogNoise(input);
		expect(result).toBe("[TIMESTAMP] Starting build");
	});
	it("normalizes ISO timestamps", () => {
		const input = "Error at 2026-05-21T15:53:32.412Z in module";
		const result = normalizeLogNoise(input);
		expect(result).toBe("Error at [TIMESTAMP] in module");
	});
	it("normalizes PIDs", () => {
		const input = "PID 29482 started";
		const result = normalizeLogNoise(input);
		expect(result).toBe("[PID] started");
	});
	it("normalizes elapsed milliseconds", () => {
		const input = "Test passed in 42ms";
		const result = normalizeLogNoise(input);
		expect(result).toBe("Test passed in [X]ms");
	});
	it("normalizes elapsed seconds", () => {
		const input = "Build completed in 4.234s";
		const result = normalizeLogNoise(input);
		expect(result).toBe("Build completed in [X]s");
	});
	it("preserves non-log content", () => {
		const input = "function hello() { return 'world' }";
		const result = normalizeLogNoise(input);
		expect(result).toBe(input);
	});
});

describe("L30: Table Whitespace Minimization", () => {
	it("minimizes table padding", () => {
		const input = "|  id  |  name  |  status  |";
		const result = minimizeTableWhitespace(input);
		expect(result).toBe("|id|name|status|");
	});
	it("minimizes multi-line tables", () => {
		const input = "|  id  |  name  |\n|  1   |  foo   |\n|  2   |  bar   |";
		const result = minimizeTableWhitespace(input);
		expect(result).toBe("|id|name|\n|1|foo|\n|2|bar|");
	});
	it("preserves non-table lines", () => {
		const input = "Header\n|  id  |  name  |\nFooter";
		const result = minimizeTableWhitespace(input);
		expect(result).toBe("Header\n|id|name|\nFooter");
	});
});

describe("L31: JSON Minification", () => {
	it("minifies single JSON object", () => {
		const input = '{ "name": "test", "version": "1.0.0" }';
		const result = minifyJSON(input);
		expect(result).toBe('{"name":"test","version":"1.0.0"}');
	});
	it("minifies JSON array", () => {
		const input = '[ { "a": 1 }, { "b": 2 } ]';
		const result = minifyJSON(input);
		expect(result).toBe('[{"a":1},{"b":2}]');
	});
	it("preserves non-JSON content", () => {
		const input = "Hello world, this is not JSON";
		const result = minifyJSON(input);
		expect(result).toBe(input);
	});
	it("minifies nested JSON objects", () => {
		const input = '{ "outer": { "inner": { "value": 42 } } }';
		const result = minifyJSON(input);
		expect(result).toBe('{"outer":{"inner":{"value":42}}}');
	});
});

describe("URL Shortening", () => {
	it("shortens long URLs by stripping query params", () => {
		const input =
			"See https://example.com/api/v1/users?foo=bar&baz=qux&token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz for details";
		const result = shortenUrls(input);
		expect(result).toBe("See https://example.com/api/v1/users for details");
	});
	it("leaves short URLs unchanged", () => {
		const input = "See https://example.com for details";
		const result = shortenUrls(input);
		expect(result).toBe(input);
	});
	it("handles multiple URLs", () => {
		const input =
			"https://api.example.com/v1/data?foo=bar&baz=qux&token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz and https://cdn.example.com/assets/image.png?width=100&height=200&format=png&quality=90&crop=center&v=1234567890";
		const result = shortenUrls(input);
		expect(result).toContain("https://api.example.com/v1/data");
		expect(result).toContain("https://cdn.example.com/assets/image.png");
		expect(result).not.toContain("foo=bar");
		expect(result).not.toContain("width=100");
	});
});

describe("Base64 Content Stripping", () => {
	it("strips base64 data URIs", () => {
		const input =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
		const result = stripBase64Content(input);
		expect(result).toBe("[base64 content stripped]");
	});
	it("leaves non-base64 content unchanged", () => {
		const input = "Hello world";
		const result = stripBase64Content(input);
		expect(result).toBe(input);
	});
	it("strips multiple base64 URIs", () => {
		const input =
			"data:image/jpeg;base64,/9j/4AAQSkZJRg== and data:text/css;base64,Ym9keXt9";
		const result = stripBase64Content(input);
		expect(result).toBe(
			"[base64 content stripped] and [base64 content stripped]",
		);
	});
});

describe("Stack Trace Compression", () => {
	it("compresses long stack traces", () => {
		const stack = `Error: Something went wrong
at foo (bar.js:1:2)
at baz (qux.js:3:4)
at quux (corge.js:5:6)
at grault (garply.js:7:8)
at waldo (fred.js:9:10)
at plugh (xyzzy.js:11:12)
at thud (bar.js:13:14)`;
		const result = filterGeneric(stack);
		expect(result).toContain("at foo (bar.js:1:2)");
		expect(result).toContain("at thud (bar.js:13:14)");
		expect(result).toContain("stack frames omitted");
	});
	it("leaves short stack traces unchanged", () => {
		const stack = `Error: Something went wrong
at foo (bar.js:1:2)
at baz (qux.js:3:4)`;
		const result = filterGeneric(stack);
		expect(result).toBe(stack);
	});
});

describe("Lock File Blocking", () => {
	it("blocks package-lock.json reads", () => {
		const result = isMinifiedOrGenerated("package-lock.json");
		expect(result).toBe(true);
	});
	it("blocks yarn.lock reads", () => {
		const result = isMinifiedOrGenerated("yarn.lock");
		expect(result).toBe(true);
	});
	it("blocks Cargo.lock reads", () => {
		const result = isMinifiedOrGenerated("Cargo.lock");
		expect(result).toBe(true);
	});
	it("blocks pnpm-lock.yaml reads", () => {
		const result = isMinifiedOrGenerated("pnpm-lock.yaml");
		expect(result).toBe(true);
	});
	it("blocks go.sum reads", () => {
		const result = isMinifiedOrGenerated("go.sum");
		expect(result).toBe(true);
	});
	it("blocks bun.lock reads", () => {
		const result = isMinifiedOrGenerated("bun.lock");
		expect(result).toBe(true);
	});
});

describe("Secrets — Single Regex", () => {
	it("redacts AWS keys", () => {
		const result = redactSecrets("AKIAIOSFODNN7EXAMPLE");
		expect(result).toBe("[REDACTED]");
	});
	it("redacts GitHub tokens", () => {
		const result = redactSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12");
		expect(result).toBe("[REDACTED]");
	});
	it("redacts OpenAI keys", () => {
		const result = redactSecrets("sk-abcdefghijklmnopqrstuvwxyz1234567890");
		expect(result).toBe("[REDACTED]");
	});
	it("redacts multiple secrets in one pass", () => {
		const input =
			"AWS: AKIAIOSFODNN7EXAMPLE GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12";
		const result = redactSecrets(input);
		expect(result).toContain("[REDACTED]");
		expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
		expect(result).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12");
	});
});

describe("New Pre-Call Rewrite Rules", () => {
	it("adds -o wide to kubectl", () => {
		const result = rewriteCommand("kubectl get pods");
		expect(result).toBe("kubectl get pods -o wide");
	});
	it("adds -no-color to terraform", () => {
		const result = rewriteCommand("terraform plan");
		expect(result).toBe("terraform plan -no-color");
	});
	it("adds -v=false to go build", () => {
		const result = rewriteCommand("go build ./...");
		expect(result).toBe("go build -v=false ./...");
	});
	it("adds -s to make", () => {
		const result = rewriteCommand("make build");
		expect(result).toBe("make build -s");
	});
	it("adds -q to brew", () => {
		const result = rewriteCommand("brew install node");
		expect(result).toBe("brew install node -q");
	});
});

// ─── PHASE 5 TESTS — Telemetry & Observability ───

import { getErrorSummary, logError } from "@opentoken/core/utils/errors";
import {
	formatStatsSummary,
	getStatsSummary,
	saveStatsSummary,
} from "@opentoken/core/utils/stats";

describe("Metrics Aggregation", () => {
	it("returns stats summary structure", () => {
		const stats = getStatsSummary();
		expect(stats).toHaveProperty("generatedAt");
		expect(stats).toHaveProperty("session");
		expect(stats.session).toHaveProperty("totalCalls");
		expect(stats.session).toHaveProperty("totalSavedTokens");
		expect(stats.session).toHaveProperty("avgSavedPct");
	});
	it("formats stats summary with correct structure", () => {
		const summary = formatStatsSummary();
		expect(summary).toContain("opentoken stats");
		expect(summary).toContain("Calls:");
		expect(summary).toContain("Tokens saved:");
	});
	it("saves stats summary to disk", () => {
		saveStatsSummary();
		// Should not throw
		expect(true).toBe(true);
	});
});

describe("Error Logging", () => {
	const ERROR_FILE = path.join(
		os.homedir(),
		".config",
		"opentoken",
		"error.jsonl",
	);
	afterEach(() => {
		try {
			fs.writeFileSync(ERROR_FILE, "");
		} catch {}
	});
	it("logs an error entry without throwing", () => {
		logError({
			ts: new Date().toISOString(),
			stage: "testStage",
			tool: "bash",
			error: "Test error message",
			recoverable: true,
		});
		const summary = getErrorSummary();
		expect(summary.total).toBeGreaterThan(0);
	});
	it("returns error summary", () => {
		logError({
			ts: new Date().toISOString(),
			stage: "testStage",
			tool: "bash",
			error: "Test error message",
			recoverable: true,
		});
		const summary = getErrorSummary();
		expect(summary).toHaveProperty("total");
		expect(summary).toHaveProperty("byStage");
		expect(summary).toHaveProperty("recent");
	});
});

describe("Autotune — Metrics-Driven Gating", () => {
	beforeEach(() => {
		resetCache();
	});

	it("returns 1.0 when no metrics file exists", () => {
		expect(getFamilyEffectiveness("nonexistent")).toBe(1.0);
	});

	it("gates correctly for neutral families with no data", () => {
		expect(isStageWorthwhile("git")).toBe(true);
		expect(isStageWorthwhile("npm")).toBe(true);
		expect(isStageWorthwhile("cargo")).toBe(true);
	});

	it("gates by threshold — no data returns true for standard threshold", () => {
		expect(isStageWorthwhile("generic")).toBe(true);
		expect(isStageWorthwhile("generic", 0.5)).toBe(true);
	});

	it("returns false for impossible threshold even with no data", () => {
		expect(isStageWorthwhile("generic", 2.0)).toBe(false);
	});
});

describe("Memory — Cross-Session Facts", () => {
	beforeEach(() => {
		clearMemory();
	});

	afterEach(() => {
		clearMemory();
	});

	it("extractContextKeywords filters stop words and limits to 10", () => {
		const result = extractContextKeywords(
			"the quick brown fox jumps over lazy dog about testing compression",
		);
		expect(result.length).toBeLessThanOrEqual(10);
		expect(result).not.toContain("the");
		expect(result).not.toContain("about");
		expect(result).toContain("quick");
		expect(result).toContain("compression");
	});

	it("extractContextKeywords returns empty for stop-word-only input", () => {
		const result = extractContextKeywords("the and for are but not");
		expect(result.length).toBe(0);
	});

	it("getMemoryStats returns zero when no memory file exists", () => {
		const stats = getMemoryStats();
		expect(stats.total).toBe(0);
		expect(stats.oldest).toBe("none");
	});

	it("writeSessionSummary creates a fact and getMemoryStats reflects it", () => {
		writeSessionSummary(
			"s1",
			"/projects/opentoken",
			"Fixed compression bug in src/ltsc.ts with new algorithm",
		);
		const stats = getMemoryStats();
		expect(stats.total).toBeGreaterThan(0);
		expect(stats.byProject).toHaveProperty("opentoken");
	});

	it("clearMemory removes the memory file", () => {
		writeSessionSummary("s1", "/projects/test", "Some test summary");
		expect(getMemoryStats().total).toBeGreaterThan(0);
		clearMemory();
		const stats = getMemoryStats();
		expect(stats.total).toBe(0);
	});

	it("buildMemoryPrompt returns prompt for matching project", () => {
		writeSessionSummary("s1", "/projects/foo", "Added feature in src/bar.ts");
		writeSessionSummary("s2", "/projects/foo", "Fixed bug in src/baz.ts");
		const prompt = buildMemoryPrompt("/projects/foo");
		expect(prompt).toContain("Previous context:");
		expect(prompt).toContain("foo:");
	});

	it("buildMemoryPrompt returns empty for unknown project", () => {
		const prompt = buildMemoryPrompt("/projects/nonexistent");
		expect(prompt).toBe("");
	});

	it("writeSessionSummary keeps distinct facts as separate entries", () => {
		writeSessionSummary(
			"s1",
			"/projects/dedup",
			"Added new feature and fixed authentication module bug",
		);
		writeSessionSummary(
			"s2",
			"/projects/dedup",
			"Fixed rendering bug in frontend component",
		);
		const stats = getMemoryStats();
		expect(stats.total).toBe(2);
	});

	it("writeSessionSummary deduplicates nearly identical facts", () => {
		writeSessionSummary(
			"s1",
			"/projects/neardup",
			"fixed authentication module feature",
		);
		writeSessionSummary(
			"s2",
			"/projects/neardup",
			"fixed authentication module feature bug",
		);
		const stats = getMemoryStats();
		expect(stats.total).toBe(1);
	});

	it("buildMemoryPrompt with keywords prioritizes matching facts", () => {
		writeSessionSummary(
			"s1",
			"/projects/test",
			"Working on compression algorithm in src/ltsc.ts",
		);
		writeSessionSummary(
			"s2",
			"/projects/test",
			"Fixed rendering bug in src/tui.tsx",
		);
		const prompt = buildMemoryPrompt("/projects/test", ["compression", "ltsc"]);
		const compressionIdx = prompt.indexOf("compression");
		const renderingIdx = prompt.indexOf("rendering");
		expect(compressionIdx).toBeGreaterThan(0);
		expect(compressionIdx).toBeLessThan(renderingIdx);
	});
});

describe("L13: 50MB Stress Test", () => {
	it("rejects 50MB output", () => {
		const big = "x".repeat(50 * 1024 * 1024);
		const result = validateOutputSize(big);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("MB");
	});

	it("accepts 9.9MB output", () => {
		const medium = "x".repeat(Math.floor(9.9 * 1024 * 1024));
		const result = validateOutputSize(medium);
		expect(result.valid).toBe(true);
	});

	it("suppressOversized at boundary", () => {
		const input = "a".repeat(10 * 1024 * 1024 + 1);
		const result = suppressOversized(input, 10 * 1024 * 1024);
		expect(result.suppressed).toBe(true);
	});
});
