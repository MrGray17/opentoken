// OpenToken — Output Compression Tests
// Validates compressOutput, getConcisenessDirective, getOutputBudget

import { describe, expect, it } from "bun:test";

import {
	compressOutput,
	getConcisenessDirective,
	getOutputBudget,
} from "@mrgray17/opentoken-core/outputcomp";

describe("getConcisenessDirective", () => {
	it("returns a non-empty string", () => {
		const d = getConcisenessDirective();
		expect(typeof d).toBe("string");
		expect(d.length).toBeGreaterThan(0);
	});

	it("starts with a space (appends to system prompt)", () => {
		expect(getConcisenessDirective().startsWith(" ")).toBe(true);
	});
});

describe("getOutputBudget", () => {
	it("returns a positive number", () => {
		expect(getOutputBudget()).toBeGreaterThan(0);
	});

	it("returns 2048", () => {
		expect(getOutputBudget()).toBe(2048);
	});
});

describe("compressOutput", () => {
	it("returns empty string unchanged", () => {
		expect(compressOutput("")).toBe("");
	});

	it("returns short text unchanged (< 100 chars)", () => {
		expect(compressOutput("short")).toBe("short");
	});

	it("returns 99-char text unchanged", () => {
		const text = "a".repeat(99);
		expect(compressOutput(text)).toBe(text);
	});

	it("returns JSON-like text unchanged (starts with {)", () => {
		const text = '{"key": "value"}'.repeat(20); // > 100 chars
		expect(compressOutput(text)).toBe(text);
	});

	it("returns array-like text unchanged (starts with [)", () => {
		const text = '["item1", "item2", "item3"] '.repeat(20); // > 100 chars
		expect(compressOutput(text)).toBe(text);
	});

	it("strips start-anchored greeting (Sure)", () => {
		const text = "Sure! Here is the code you asked for. ".repeat(5);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips start-anchored greeting (Certainly)", () => {
		const text = "Certainly, I can help with that. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips start-anchored (Here's)", () => {
		const text = "Here's the implementation you need. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips start-anchored (Let me explain)", () => {
		const text = "Let me explain how this works. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips end-anchored closing (Let me know)", () => {
		const text = "The answer is 42. Let me know if you have questions. ".repeat(
			4,
		);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips end-anchored closing (Happy to help)", () => {
		const text = "Just use the function. Happy to help! ".repeat(4);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips restatement (So you're)", () => {
		const text = "So you're looking for a way to sort. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips restatement (In short)", () => {
		const text = "In short, the algorithm is O(n log n). ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips filler (Now let's)", () => {
		const text = "Now let's implement the function. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("strips filler (Moving on)", () => {
		const text = "Moving on to the next topic. ".repeat(10);
		const result = compressOutput(text);
		expect(result.length).toBeLessThan(text.length);
	});

	it("never returns text longer than input (conservative filter)", () => {
		const inputs = [
			"",
			"hello world",
			"a".repeat(99),
			"Sure! Here is the code. ".repeat(10),
			"Certainly! ".repeat(20),
			"Let me explain the architecture. ".repeat(15),
			"Here's a detailed breakdown. ".repeat(12),
			"The answer is 42. Let me know if you need anything else.",
			"So you're building a web app. ".repeat(10),
			"In short, use the library. ".repeat(10),
			"Now let's review the tests. ".repeat(10),
			"Moving on to deployment. ".repeat(10),
			'{"data": "value"}'.repeat(50),
			"Normal text without any boilerplate. This should remain as-is. ".repeat(
				5,
			),
		];

		for (const input of inputs) {
			const result = compressOutput(input);
			expect(result.length).toBeLessThanOrEqual(input.length);
		}
	});

	it("preserves substantive content after stripping boilerplate", () => {
		const text =
			"Sure! Here is the answer. The function returns a Promise. Let me know if you need clarification. ".repeat(
				3,
			);
		const result = compressOutput(text);
		expect(result).toContain("function returns a Promise");
	});
});
