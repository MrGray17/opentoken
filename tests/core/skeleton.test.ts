import { describe, expect, it } from "bun:test";
import { extractSkeleton } from "@opentoken/core/skeleton";

describe("extractSkeleton", () => {
	it("extracts TypeScript symbols", async () => {
		const content = `import { foo } from "./bar";
export function hello() {
  return 1;
}
export class MyClass {
  method() {}
}
interface MyInterface {
  name: string;
}
type MyType = string;
enum MyEnum { A, B }
const x = 1;
export const y = 2;
`;
		const result = await extractSkeleton("test.ts", content);
		expect(result).not.toBeNull();
		expect(result).toContain("Skeleton:");
		expect(result).toContain("import { foo } from");
		expect(result).toContain("export function hello");
		expect(result).toContain("export class MyClass");
		expect(result).toContain("interface MyInterface");
		expect(result).toContain("type MyType");
	});

	it("returns null for unknown file extension", async () => {
		const result = await extractSkeleton("file.unknown", "content");
		expect(result).toBeNull();
	});

	it("extracts Python symbols", async () => {
		const content = `import os
from pathlib import Path
def my_function():
    pass
class MyClass:
    def method(self):
        pass
`;
		const result = await extractSkeleton("test.py", content);
		expect(result).not.toBeNull();
		expect(result).toContain("Skeleton:");
		expect(result).toContain("import os");
		expect(result).toContain("def my_function");
		expect(result).toContain("class MyClass");
	});

	it("extracts Rust symbols", async () => {
		const content = `use std::collections::HashMap;
mod my_module;
pub fn do_something() -> i32 {
    42
}
pub struct MyStruct {
    field: i32,
}
pub enum MyEnum { A, B }
pub trait MyTrait {
    fn method(&self);
}
`;
		const result = await extractSkeleton("test.rs", content);
		expect(result).not.toBeNull();
		expect(result).toContain("Skeleton:");
		expect(result).toContain("use std");
		expect(result).toContain("pub fn do_something");
		expect(result).toContain("pub struct MyStruct");
	});

	it("annotates each symbol with line number (L{num}:)", async () => {
		const content = `import { a } from "b";
export function foo() {}
export class Bar {}
`;
		const result = await extractSkeleton("test.ts", content);
		expect(result).toContain("L   1:");
		expect(result).toContain("L   2:");
		expect(result).toContain("L   3:");
	});

	it("truncates at MAX_SKELETON_LINES (100)", async () => {
		const lines: string[] = [];
		for (let i = 0; i < 150; i++) {
			lines.push(`export function func${i}() {}`);
		}
		const content = lines.join("\n");
		const result = await extractSkeleton("test.ts", content);
		expect(result).toContain("more symbols");
	});

	it("handles content with no matching symbols", async () => {
		const content = "just some text\nwith no\nsymbols at all";
		const result = await extractSkeleton("test.ts", content);
		expect(result).not.toBeNull();
		expect(result).toContain("0 symbols");
	});

	it("handles empty content", async () => {
		const result = await extractSkeleton("test.ts", "");
		expect(result).not.toBeNull();
		expect(result).toContain("0 symbols");
	});
});
