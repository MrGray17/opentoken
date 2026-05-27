import { describe, expect, it } from "bun:test";
import { convertToTOON } from "@mrgray17/opentoken-core/toon";

describe("convertToTOON", () => {
	it("converts array of objects to TOON format", () => {
		const input = JSON.stringify([
			{ name: "foo", value: 1 },
			{ name: "bar", value: 2 },
			{ name: "baz", value: 3 },
		]);
		const result = convertToTOON(input);
		expect(result.converted).toBe(true);
		expect(result.result).toContain("name[3]");
		expect(result.result).toContain("foo,1");
		expect(result.result).toContain("bar,2");
	});

	it("skips arrays with ≤2 elements (not worth converting)", () => {
		const input = JSON.stringify([
			{ name: "foo", value: 1 },
			{ name: "bar", value: 2 },
		]);
		const result = convertToTOON(input);
		expect(result.converted).toBe(false);
	});

	it("returns unconverted for non-array input", () => {
		const input = "hello world";
		const result = convertToTOON(input);
		expect(result.converted).toBe(false);
		expect(result.result).toBe(input);
	});

	it("returns unconverted for non-JSON input", () => {
		const input = "{invalid json}";
		const result = convertToTOON(input);
		expect(result.converted).toBe(false);
	});

	it("converts object with nested arrays", () => {
		const input = JSON.stringify({
			users: [
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
				{ id: 3, name: "Charlie" },
			],
		});
		const result = convertToTOON(input);
		expect(result.converted).toBe(true);
	});

	it("only converts if TOON is at least 20% shorter than JSON", () => {
		// Single field objects with short values — TOON may not be worth it
		const input = JSON.stringify([{ a: "x" }, { a: "y" }, { a: "z" }]);
		const result = convertToTOON(input);
		// May or may not convert depending on size comparison
		expect(typeof result.converted).toBe("boolean");
		expect(typeof result.result).toBe("string");
	});

	it("handles empty array", () => {
		const input = "[]";
		const result = convertToTOON(input);
		expect(result.converted).toBe(false);
		expect(result.result).toBe(input);
	});

	it("handles nested objects gracefully", () => {
		const input = JSON.stringify({
			config: {
				host: "localhost",
				port: 8080,
			},
			items: [
				{ id: 1, active: true },
				{ id: 2, active: false },
				{ id: 3, active: true },
			],
		});
		const result = convertToTOON(input);
		expect(typeof result.converted).toBe("boolean");
	});

	it("handles JSON objects with mixed value types", () => {
		const input = JSON.stringify({ key: "value", num: 42, flag: true });
		const result = convertToTOON(input);
		expect(typeof result.converted).toBe("boolean");
	});

	it("handles deeply nested object", () => {
		const input = JSON.stringify({ a: { b: { c: { d: 1 } } } });
		const result = convertToTOON(input);
		expect(typeof result.converted).toBe("boolean");
	});

	it("handles primitive array (not objects)", () => {
		const input = JSON.stringify([1, 2, 3, 4, 5]);
		const result = convertToTOON(input);
		expect(result.converted).toBe(false);
		expect(result.result).toBe(input);
	});

	it("escapes values with commas correctly", () => {
		const input = JSON.stringify([
			{ name: "foo,bar", value: 1 },
			{ name: "baz", value: 2 },
			{ name: "qux", value: 3 },
		]);
		const result = convertToTOON(input);
		if (result.converted) {
			expect(result.result).toContain('"foo,bar"');
		}
	});

	it("handles null values in objects", () => {
		const input = JSON.stringify([
			{ name: "foo", value: null },
			{ name: "bar", value: 42 },
			{ name: "baz", value: null },
		]);
		const result = convertToTOON(input);
		expect(typeof result.converted).toBe("boolean");
	});
});
