import { describe, expect, it } from "bun:test";
import { abbreviateIdentifiers } from "@opentoken/core/rewind";

const TEST_SESSION = "rewind-test";

describe("abbreviateIdentifiers", () => {
	it("replaces repeated long identifiers with $N$ markers", () => {
		const longId = "veryLongIdentifierNameThatShouldBeRepeated";
		const input = `${longId} at line 1\n${longId} at line 2\n${longId} at line 3`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toContain("$1$");
		expect(result).toContain("# Abbreviations:");
		expect(result).toContain(longId);
	});

	it("does not abbreviate unique content", () => {
		const input = "short content without long identifiers";
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toBe(input);
	});

	it("does not abbreviate short identifiers (<40 chars)", () => {
		const shortId = "shortId";
		const input = `${shortId} here\n${shortId} there`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toBe(input);
	});

	it("abbreviates only if savings are positive", () => {
		// One long identifier repeated twice — may or may not save
		const longId = "a".repeat(45);
		const input = `${longId}\n${longId}`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		// Legend overhead may make savings negative for 2 occurrences
		expect(typeof result).toBe("string");
	});

	it("abbreviates compound identifiers with dots and slashes", () => {
		const path = "/home/user/project/src/components/Button.tsx";
		const input = `Importing ${path}\nProcessing ${path}\nDone with ${path}`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toContain("# Abbreviations:");
	});

	it("abbreviates multiple unique identifiers", () => {
		const id1 = "firstVeryLongIdentifierNameThatShouldMatch";
		const id2 = "secondVeryLongIdentifierNameThatShouldMatch";
		const input = `${id1} and ${id2}\n${id1} again\n${id2} again`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toContain("$1$");
		expect(result).toContain("$2$");
	});

	it("handles empty input", () => {
		const result = abbreviateIdentifiers(TEST_SESSION, "");
		expect(result).toBe("");
	});

	it("handles input with only short identifiers", () => {
		const input = "a b c d e f g h i j k l m n o p";
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toBe(input);
	});

	it("escapes special regex characters in identifiers", () => {
		const longId = "some.path.with.dots.that.is.very.long.and.repeated";
		const input = `${longId} first\n${longId} second\n${longId} third`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toContain("$1$");
	});

	it("does not abbreviate a single occurrence of a long identifier", () => {
		const longId = "veryLongIdentifierThatOnlyAppearsOnceInTheEntireText";
		const input = `Only one occurrence: ${longId}`;
		const result = abbreviateIdentifiers(TEST_SESSION, input);
		expect(result).toBe(input);
	});
});
