import { describe, it } from "bun:test";
import { applyBashFilter } from "../src/pipelines/bash";
import { applyReadFilter } from "../src/pipelines/read";
import { applyGrepFilter } from "../src/pipelines/grep";
import { applyGlobFilter } from "../src/pipelines/glob";
import { conservativeFilter } from "../src/wrappers";
import { suppressOversized } from "../src/postcall";
import { compressOutput } from "../src/outputcomp";

const SID = "bench-session";

function genString(size: number, pattern = "x"): string {
	return pattern.repeat(Math.ceil(size / pattern.length)).slice(0, size);
}

describe("Benchmarks", () => {
	it("applyBashFilter on npm install output (~30KB)", async () => {
		const output = genString(30000, "added 1 package\n");
		const t0 = performance.now();
		await applyBashFilter(SID, "npm install express", output);
		const t1 = performance.now();
		console.log(`  applyBashFilter: ${(t1 - t0).toFixed(2)}ms`);
	});

	it("applyReadFilter on TypeScript file (~15KB)", async () => {
		const content = genString(15000, "import { foo } from 'bar';\nexport const x = 1;\n");
		const t0 = performance.now();
		await applyReadFilter(SID, "/tmp/dummy.ts", content);
		const t1 = performance.now();
		console.log(`  applyReadFilter: ${(t1 - t0).toFixed(2)}ms`);
	});

	it("applyGrepFilter on grep result (~10KB)", async () => {
		const output = genString(10000, "src/file.ts:42:  const foo = 1;\n");
		const t0 = performance.now();
		await applyGrepFilter(SID, output);
		const t1 = performance.now();
		console.log(`  applyGrepFilter: ${(t1 - t0).toFixed(2)}ms`);
	});

	it("applyGlobFilter on glob listing (~5KB)", async () => {
		const output = genString(5000, "src/components/Button.tsx\n");
		const t0 = performance.now();
		await applyGlobFilter(SID, output);
		const t1 = performance.now();
		console.log(`  applyGlobFilter: ${(t1 - t0).toFixed(2)}ms`);
	});

	it("conservativeFilter on original+filtered (1KB each)", () => {
		const original = genString(1000, "line of text\n");
		const filtered = genString(600, "line of text\n");
		const t0 = performance.now();
		for (let i = 0; i < 100; i++) conservativeFilter(original, filtered);
		const t1 = performance.now();
		console.log(`  conservativeFilter x100: ${(t1 - t0).toFixed(2)}ms`);
	});

	it("suppressOversized at boundary (10MB+1)", () => {
		const input = genString(10 * 1024 * 1024 + 1);
		const t0 = performance.now();
		suppressOversized(input, 10 * 1024 * 1024);
		const t1 = performance.now();
		console.log(`  suppressOversized (10MB): ${(t1 - t0).toFixed(2)}ms`);
	});

	it("compressOutput on typical model response (5KB)", () => {
		const text = genString(5000, "This is a typical output with some text.\n");
		const t0 = performance.now();
		for (let i = 0; i < 50; i++) compressOutput(text);
		const t1 = performance.now();
		console.log(`  compressOutput x50: ${(t1 - t0).toFixed(2)}ms`);
	});
});
