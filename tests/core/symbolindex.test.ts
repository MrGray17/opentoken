import { describe, expect, it } from "bun:test";
import {
	indexFile,
	querySymbolIndex,
	querySymbolPrefix,
} from "@opentoken/core/symbolindex";

describe("SymbolIndex — Pure functions", () => {
	it("indexFile parses functions from TypeScript", async () => {
		const code = `export function foo(a: number, b: string): void {
  return;
}

function bar() {}
`;
		const tmp = `/tmp/opentoken-test-sym-fn-${Date.now()}.ts`;
		await Bun.write(tmp, code);
		const content = await Bun.file(tmp).text();
		const count = await indexFile(tmp, content);
		expect(count).toBeGreaterThanOrEqual(2);

		await Bun.file(tmp).delete();
	});

	it("indexFile parses classes from TypeScript", async () => {
		const code = `export class Bar {
  private x: number;
  constructor(x: number) { this.x = x; }
  greet(): string { return "hello"; }
}
`;
		const tmp = `/tmp/opentoken-test-cls-${Date.now()}.ts`;
		await Bun.write(tmp, code);
		const content = await Bun.file(tmp).text();
		const count = await indexFile(tmp, content);
		expect(count).toBeGreaterThanOrEqual(1);

		await Bun.file(tmp).delete();
	});

	it("querySymbolIndex finds indexed symbol by exact name", async () => {
		const code = `export function foo(a: number): number { return a; }
class Bar {}
`;
		const tmp = `/tmp/opentoken-test-qry-${Date.now()}.ts`;
		await Bun.write(tmp, code);
		const content = await Bun.file(tmp).text();
		await indexFile(tmp, content);

		const results = querySymbolIndex("foo");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].name).toBe("foo");

		await Bun.file(tmp).delete();
	});

	it("querySymbolPrefix returns partial matches", async () => {
		const code = `export function fooFunc(a: number): number { return a; }
function fooBar(): void {}
export class FooClass {}
`;
		const tmp = `/tmp/opentoken-test-prfx-${Date.now()}.ts`;
		await Bun.write(tmp, code);
		const content = await Bun.file(tmp).text();
		await indexFile(tmp, content);

		const results = querySymbolPrefix("foo");
		expect(results.length).toBeGreaterThanOrEqual(3);
		const names = results.map((r) => r.name);
		expect(names).toContain("fooFunc");
		expect(names).toContain("fooBar");
		expect(names).toContain("FooClass");

		await Bun.file(tmp).delete();
	});
});
