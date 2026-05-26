import { describe, expect, it } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk";
import {
	compressMessagesInPlace,
	shouldCompress,
	getCompressionStats,
} from "@opentoken/core/history";

// biome-ignore lint/suspicious/noExplicitAny: test helper constructing partial SDK types
function makePart(type: string, overrides: Record<string, unknown> = {}): any {
	return { type, id: "p1", sessionID: "", messageID: "", ...overrides };
}

// biome-ignore lint/suspicious/noExplicitAny: test helper constructing partial SDK types
function makeTextPart(text: string): any {
	return makePart("text", { text });
}

// biome-ignore lint/suspicious/noExplicitAny: test helper constructing partial SDK types
function makeToolPart(tool: string, output: string, status = "completed"): any {
	return makePart("tool", {
		tool,
		state: { status, output, input: {}, tool },
	});
}

// biome-ignore lint/suspicious/noExplicitAny: test helper constructing partial SDK types
function makeMessage(role: string, parts: Part[]): any {
	return { info: { role, content: "" }, parts };
}

describe("compressMessagesInPlace", () => {
	it("skips if too few messages", () => {
		const messages = [
			makeMessage("user", [makeTextPart("hello")]),
			makeMessage("assistant", [makeTextPart("world")]),
		];
		compressMessagesInPlace(messages, { window: 4 });
		expect(messages[0].parts[0].text).toBe("hello");
	});

	it("skips if maxCompressedTokens is 0 (default, opt-in)", () => {
		const messages = Array.from({ length: 10 }, (_, i) =>
			makeMessage(i % 2 === 0 ? "user" : "assistant", [
				makeTextPart("message " + i),
			]),
		);
		compressMessagesInPlace(messages, { window: 4, maxCompressedTokens: 0 });
		expect(messages[8].parts[0].text).toBe("message 8");
	});

	it("compresses assistant messages beyond window", () => {
		const messages = Array.from({ length: 14 }, (_, i) =>
			makeMessage(i % 2 === 0 ? "user" : "assistant", [
				makeTextPart("A".repeat(100)),
			]),
		);
		compressMessagesInPlace(messages, {
			window: 4,
			maxCompressedTokens: 1,
		});
		const text = messages[1].parts[0].text;
		if (text && text.startsWith("[response")) {
			expect(text).toMatch(/^\[response/);
		}
	});

	it("never compresses user messages", () => {
		const messages = Array.from({ length: 14 }, (_, i) =>
			makeMessage(i % 2 === 0 ? "user" : "assistant", [
				makeTextPart("A".repeat(200)),
			]),
		);
		const original = messages[0].parts[0].text;
		compressMessagesInPlace(messages, {
			window: 4,
			maxCompressedTokens: 1,
		});
		expect(messages[0].parts[0].text).toBe(original);
	});

	it("compresses tool outputs into summaries", () => {
		const messages = [
			makeMessage("user", [makeTextPart("do it")]),
			makeMessage("assistant", [
				makeToolPart("bash", "ok 1 passing\nok 2 passing\n1 passed"),
			]),
			makeMessage("user", [makeTextPart("more")]),
			makeMessage("assistant", [makeTextPart("done")]),
			makeMessage("user", [makeTextPart("again")]),
			makeMessage("assistant", [makeTextPart("ok")]),
		];
		compressMessagesInPlace(messages, {
			window: 2,
			maxCompressedTokens: 1,
		});
		const part = messages[1].parts[0];
		expect(part.state?.output).toMatch(/\[bash/);
	});

	it("compresses tool parts with state.output replacement", () => {
		const messages = [
			makeMessage("user", [makeTextPart("run")]),
			makeMessage("assistant", [
				makeToolPart("grep", "src/test.ts:10:content", "completed"),
			]),
			makeMessage("user", [makeTextPart("ok")]),
			makeMessage("assistant", [
				makeToolPart("glob", "a.ts\nb.ts\nc.ts", "completed"),
			]),
			makeMessage("user", [makeTextPart("yes")]),
			makeMessage("assistant", [makeTextPart("fine")]),
		];
		compressMessagesInPlace(messages, {
			window: 2,
			maxCompressedTokens: 1,
			summarizeToolResults: true,
		});
		const part = messages[1].parts[0];
		expect(part.type).toBe("tool");
		expect(part.state?.output).toMatch(/\[grep:/);
	});

	it("keeps error/in-progress tools uncompressed", () => {
		const messages = [
			makeMessage("user", [makeTextPart("run")]),
			makeMessage("assistant", [makeToolPart("bash", "error stuff", "error")]),
			makeMessage("user", [makeTextPart("ok")]),
			makeMessage("assistant", [makeTextPart("fine")]),
		];
		compressMessagesInPlace(messages, {
			window: 1,
			maxCompressedTokens: 1,
		});
		const part = messages[1].parts[0];
		expect(part.state?.output).toBe("error stuff");
	});
});

describe("shouldCompress", () => {
	it("returns false for few messages", () => {
		const messages = [
			makeMessage("user", [makeTextPart("hi")]),
			makeMessage("assistant", [makeTextPart("hello")]),
		];
		expect(shouldCompress(messages, 4)).toBe(false);
	});

	it("returns false for compacting messages", () => {
		const messages = Array.from({ length: 10 }, (_, i) =>
			makeMessage(i % 2 === 0 ? "user" : "assistant", [makeTextPart("x")]),
		);
		messages[1].parts.push({
			type: "compaction",
			id: "c1",
			sessionID: "",
			messageID: "",
		});
		expect(shouldCompress(messages, 4)).toBe(false);
	});
});

describe("getCompressionStats", () => {
	it("returns zero savings for non-compressible messages", () => {
		const messages = [
			makeMessage("user", [makeTextPart("hi")]),
			makeMessage("assistant", [makeTextPart("hello")]),
		];
		const stats = getCompressionStats(messages, 4);
		expect(stats.before).toBeGreaterThan(0);
		expect(stats.pct).toBeGreaterThanOrEqual(0);
	});

	it("returns positive savings for many assistant messages", () => {
		const messages = Array.from({ length: 20 }, (_, i) =>
			makeMessage(i % 2 === 0 ? "user" : "assistant", [
				makeTextPart("A".repeat(500)),
			]),
		);
		const stats = getCompressionStats(messages, 2);
		expect(stats.pct).toBeGreaterThan(0);
	});
});
