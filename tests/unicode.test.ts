import { describe, expect, it } from "bun:test";

describe("Unicode/Multibyte — Post-Call Filters", () => {
	it("emoji passthrough in stripAnsi", async () => {
		const { stripAnsi } = await import("../src/postcall");
		const input = "Result: 🦀🚀✨";
		const result = stripAnsi(input);
		expect(result).toBe(input);
	});

	it("CJK passthrough in stripAnsi", async () => {
		const { stripAnsi } = await import("../src/postcall");
		const input = "エラー: ファイルが見つかりません";
		const result = stripAnsi(input);
		expect(result).toBe(input);
	});

	it("RTL text passthrough in stripAnsi", async () => {
		const { stripAnsi } = await import("../src/postcall");
		const input = "مرحباً بالعالم";
		const result = stripAnsi(input);
		expect(result).toBe(input);
	});

	it("combining chars passthrough in stripAnsi", async () => {
		const { stripAnsi } = await import("../src/postcall");
		const input = "café résumé naïve";
		const result = stripAnsi(input);
		expect(result).toBe(input);
	});

	it("zero-width joiners not stripped", async () => {
		const { stripAnsi } = await import("../src/postcall");
		const input = "Family: 👨‍👩‍👧";
		const result = stripAnsi(input);
		expect(result).toBe(input);
	});

	it("mixed binary+text with multiple null bytes detected as binary", async () => {
		const { detectAndHandleBinary } = await import("../src/postcall");
		const input = "hello\x00\x00\x00\x00world";
		const result = detectAndHandleBinary(input);
		expect(result.binary).toBe(true);
	});

	it("multibyte length measured correctly by suppressOversized", async () => {
		const { suppressOversized } = await import("../src/postcall");
		// 50000 'a' chars + 1 emoji (4 bytes in UTF-8)
		const input = "a".repeat(50000) + "🦀";
		const result = suppressOversized(input, 100 * 1024);
		expect(result.suppressed).toBe(false);
		expect(result.result).toContain("🦀");
	});

	it("emoji passthrough in filterGeneric", async () => {
		const { filterGeneric } = await import("../src/families/generic");
		const input = "Success: 🎉 Everything passed ✅";
		const result = filterGeneric(input);
		expect(result).toContain("🎉");
		expect(result).toContain("✅");
	});

	it("stripThinkingBlocks preserves CJK content", async () => {
		const { stripThinkingBlocks } = await import("../src/postcall");
		const input = "结果：成功";
		const result = stripThinkingBlocks(input);
		expect(result).toBe(input);
	});

	it("shortenUrls preserves unicode query params", async () => {
		const { shortenUrls } = await import("../src/postcall");
		const input = "Visit https://example.com/search?q=café+résumé";
		const result = shortenUrls(input);
		expect(result).toContain("example.com");
	});

	it("minifyJSON handles unicode strings", async () => {
		const { minifyJSON } = await import("../src/postcall");
		const input = JSON.stringify({ message: "Hello 🦀 World", user: "用户" });
		const result = minifyJSON(input);
		expect(result).toContain("🦀");
		expect(result).toContain("用户");
	});
});
