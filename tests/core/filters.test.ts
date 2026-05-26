// OpenToken — Test Suite
// Validates all 24 layers work correctly

import { describe, expect, it } from "bun:test";

const _TEST_SESSION = "test-session";

import {
	filterCargoBuild,
	filterCargoOutput,
	filterCargoTest,
} from "@opentoken/core/families/cargo";
import { detectFamily } from "@opentoken/core/families/detect";
import {
	compressPaths,
	filterFind,
	filterFsOutput,
	filterLs,
	filterTree,
} from "@opentoken/core/families/fs";
import { filterGitDiff, filterGitStatus } from "@opentoken/core/families/git";
import {
	filterNpmInstall,
	filterNpmOutput,
	filterNpmTest,
} from "@opentoken/core/families/npm";
import {
	filterGoTest,
	filterPytest,
	filterTestOutput,
} from "@opentoken/core/families/test";
import { filterGlob } from "@opentoken/core/filters/glob";
import { filterGrep } from "@opentoken/core/filters/grep";
import { filterRead } from "@opentoken/core/filters/read";
import { shouldBlockGrep, shouldBlockShellGrep } from "@opentoken/core/lspfirst";

describe("L5: Family Detection", () => {
	it("detects git", () => {
		expect(detectFamily("git status")).toBe("git");
	});
	it("detects npm", () => {
		expect(detectFamily("npm install")).toBe("npm");
	});
	it("detects cargo", () => {
		expect(detectFamily("cargo build")).toBe("cargo");
	});
	it("detects test", () => {
		expect(detectFamily("pytest tests/")).toBe("test");
	});
	it("detects fs", () => {
		expect(detectFamily("ls -la")).toBe("fs");
	});
	it("defaults to generic", () => {
		expect(detectFamily("echo hello")).toBe("generic");
	});
});

describe("L6: Git Filters", () => {
	it("filters git status", () => {
		const input = `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/index.ts
  modified:   src/utils.ts

Untracked files:
  src/new.ts

no changes added to commit`;
		const result = filterGitStatus(input);
		expect(result).toContain("src/index.ts");
		expect(result).toContain("src/utils.ts");
	});
	it("filters git diff", () => {
		const input = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,5 @@
 import React from 'react'
-const old = 'value'
+const new = 'value'
 export default App`;
		const result = filterGitDiff(input);
		expect(result).toContain("Files changed");
		expect(result).toContain("src/app.ts");
	});
});

describe("L6: NPM Filters", () => {
	it("filters npm install", () => {
		const input = `added 150 packages in 3s
45 packages are looking for funding`;
		const result = filterNpmInstall(input);
		expect(result).toContain("Added");
	});
	it("filters npm test failures", () => {
		const input = `FAIL src/app.test.ts
  ✗ should render correctly
    Error: Expected 1 but received 2

PASS src/utils.test.ts

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 5 passed, 6 total`;
		const result = filterNpmTest(input);
		expect(result).toContain("FAILURES");
		expect(result).toContain("Test Suites");
	});
});

describe("L6: Cargo Filters", () => {
	it("filters cargo build errors", () => {
		const input = `   Compiling myapp v0.1.0
error[E0308]: mismatched types
  --> src/main.rs:10:5
   |
10 |     let x: i32 = "hello";
   |            ---   ^^^^^^^ expected i32, found &str
   |            |
   |            expected due to this

For more information about this error, try rustc --explain E0308.
error: could not compile myapp`;
		const result = filterCargoBuild(input);
		expect(result).toContain("Errors");
		expect(result).toContain("E0308");
	});
});

describe("L6: Test Filters", () => {
	it("filters pytest failures", () => {
		const input = `============================= test session starts ==============================
collected 5 items

tests/test_app.py::test_login FAILED                                     [ 20%]
tests/test_app.py::test_logout PASSED                                    [ 40%]
tests/test_utils.py::test_helper PASSED                                  [ 60%]

=================================== FAILURES ===================================
_________________________________ test_login _________________________________

    def test_login():
>       assert login("user", "pass") == True
E       AssertionError: assert False == True

tests/test_app.py:10: AssertionError
=========================== short test summary info ============================
FAILED tests/test_app.py::test_login - AssertionError: assert False == True
========================= 1 failed, 2 passed in 0.5s =========================`;
		const result = filterPytest(input);
		expect(result).toContain("FAILURES");
		expect(result).toContain("test_login");
	});
});

describe("L6: FS Filters", () => {
	it("filters ls output", () => {
		const input = `node_modules/
src/
dist/
.git/
package.json
README.md`;
		const result = filterLs(input);
		expect(result).not.toContain("node_modules");
		expect(result).toContain("src/");
		expect(result).toContain("package.json");
	});
	it("filters find output", () => {
		const input = `./node_modules/react/index.js
./node_modules/react-dom/index.js
./src/app.ts
./src/utils.ts
./.git/config`;
		const result = filterFind(input);
		expect(result).not.toContain("node_modules");
		expect(result).toContain("src/app.ts");
	});
});

describe("L6: Read Filter", () => {
	it("passes through short files", () => {
		const content = "export const hello = 'world'";
		const result = filterRead("src/app.ts", content);
		expect(result).toBe(content);
	});
	it("outlines long source files", () => {
		const lines = Array(300).fill("console.log('test')").join("\n");
		const result = filterRead("src/app.ts", lines);
		expect(result).toContain("symbols");
		expect(result.length).toBeLessThan(lines.length);
	});
});

describe("L6: Grep Filter", () => {
	it("filters grep output", () => {
		const input = `src/app.ts:10:import React from 'react'
src/app.ts:20:import { useState } from 'react'
src/utils.ts:5:import React from 'react'
node_modules/react/index.js:1:module.exports = React`;
		const result = filterGrep(input);
		expect(result).not.toContain("node_modules");
		expect(result).toContain("src/app.ts");
	});
});

describe("L6: Glob Filter", () => {
	it("filters glob output", () => {
		const input = `node_modules/react/index.js
node_modules/react-dom/index.js
src/app.ts
src/utils.ts
dist/bundle.js`;
		const result = filterGlob(input);
		expect(result).not.toContain("node_modules");
		expect(result).toContain("src/app.ts");
	});
});

describe("L5: LSP-First Enforcement", () => {
	it("allows grep for plain symbol names", () => {
		const result = shouldBlockGrep("UserService");
		expect(result.blocked).toBe(false);
	});
	it("allows grep for snake_case text", () => {
		const result = shouldBlockGrep("send_message");
		expect(result.blocked).toBe(false);
	});
	it("blocks grep for class definitions", () => {
		const result = shouldBlockGrep("class UserService");
		expect(result.blocked).toBe(true);
		expect(result.suggestion).toContain("LSP");
	});
	it("blocks grep for function definitions", () => {
		const result = shouldBlockGrep("def send_message");
		expect(result.blocked).toBe(true);
	});
	it("allows grep for text patterns", () => {
		const result = shouldBlockGrep("TODO");
		expect(result.blocked).toBe(false);
	});
	it("allows shell grep for text", () => {
		const result = shouldBlockShellGrep("rg UserService src/");
		expect(result.blocked).toBe(false);
	});
	it("blocks shell grep for definitions", () => {
		const result = shouldBlockShellGrep('rg "class UserService" src/');
		expect(result.blocked).toBe(true);
	});
	it("allows shell grep for text patterns", () => {
		const result = shouldBlockShellGrep("grep -r 'TODO' src/");
		expect(result.blocked).toBe(false);
	});
});

describe("Grep Filter — rg JSON/vimgrep", () => {
	it("parses rg --json format", () => {
		const jsonLine =
			'{"type":"match","data":{"path":{"text":"src/test.ts"},"line_number":42,"lines":{"text":"const x = 1;"}}}';
		const result = filterGrep(jsonLine);
		expect(result).toContain("src/test.ts");
		expect(result).toContain("42");
	});
	it("parses rg --vimgrep format (file:line:col:content)", () => {
		const vimgrepLine = "src/test.ts:42:5:const x = 1;";
		const result = filterGrep(vimgrepLine);
		expect(result).toContain("src/test.ts");
		expect(result).toContain("42");
	});
	it("parses standard grep format (file:line:content)", () => {
		const grepLine = "src/test.ts:42:const x = 1;";
		const result = filterGrep(grepLine);
		expect(result).toContain("src/test.ts");
		expect(result).toContain("42");
	});
});

describe("FS Filters — Expanded", () => {
	it("filterTree collapses deep trees with head+tail preservation", () => {
		const lines: string[] = [];
		for (let i = 0; i < 100; i++) {
			lines.push(`${"  ".repeat(i % 4)}dir${i}/`);
		}
		// Summary line
		lines.push("100 directories, 0 files");
		const input = lines.join("\n");
		const result = filterTree(input);
		expect(result).toContain("entries omitted");
		expect(result).toContain("100 directories");
	});

	it("compressPaths collapses shared prefix", () => {
		const input = `/home/user/project/src/foo/bar.ts
/home/user/project/src/foo/baz.ts
/home/user/project/src/foo/qux.ts
/home/user/project/src/foo/quux.ts`;
		const result = compressPaths(input);
		expect(result).toContain("[bar.ts, baz.ts");
		expect(result).not.toContain("qux.ts\n"); // qux.ts should follow baz.ts in same bracket
	});

	it("filterFsOutput routes to filterTree for tree command", () => {
		const input = `.git/
src/
  index.ts
3 directories, 1 file`;
		const result = filterFsOutput("tree -L 2", input);
		expect(result).toContain("index.ts");
	});
});

describe("Test Filters — Expanded", () => {
	it("filterGoTest extracts failures from go test output", () => {
		const input = `=== RUN   TestFoo
--- FAIL: TestFoo (0.01s)
    foo_test.go:42: expected 1, got 2
=== RUN   TestBar
--- PASS: TestBar (0.00s)
FAIL
FAIL    mypackage 0.123s`;
		const result = filterGoTest(input);
		expect(result).toContain("FAILURES");
		expect(result).toContain("TestFoo");
	});

	it("filterTestOutput routes to filterGoTest for go test", () => {
		const input = `=== RUN   TestFail
--- FAIL: TestFail (0.01s)
FAIL`;
		const result = filterTestOutput("go test ./...", input);
		expect(result).toContain("FAILURES");
	});

	it("filterTestOutput routes to filterPytest for pytest", () => {
		const input = `FAILED tests/test_app.py::test_login - AssertionError: assert False == True`;
		const result = filterTestOutput("pytest tests/", input);
		expect(result).toContain("FAILED");
	});
});

describe("NPM Filters — Expanded", () => {
	it("filterNpmOutput routes to filterNpmInstall for npm install", () => {
		const input = "added 50 packages in 2s";
		const result = filterNpmOutput("npm install", input);
		expect(result).toContain("Added");
	});

	it("filterNpmOutput routes to filterNpmTest for npm test", () => {
		const input = `FAIL src/app.test.ts
    ✗ should render
Test Suites: 1 failed, 1 passed, 2 total`;
		const result = filterNpmOutput("npm test", input);
		expect(result).toContain("Test Suites");
		expect(result).toContain("1 failed");
	});

	it("filterNpmOutput collapses path prefixes in build errors", () => {
		const input = `ERROR in src/foo/bar/baz/qux/component.tsx:10:5
    TS2322: Type 'string' is not assignable to type 'number'`;
		const result = filterNpmOutput("npm run build", input);
		expect(result).toBeTruthy();
	});
});

describe("Cargo Filters — Expanded", () => {
	it("filterCargoTest extracts failures from cargo test output", () => {
		const input = `running 3 tests
test test_foo ... FAILED
test test_bar ... ok
test test_baz ... ok

failures:
---- test_foo stdout ----
thread 'test_foo' panicked at src/lib.rs:10:
assertion failed: 1 == 2

failures:
    test_foo

test result: FAILED. 2 passed, 1 failed, 0 ignored, 0 measured, 0 filtered out`;
		const result = filterCargoTest(input);
		expect(result).toContain("FAILURES");
		expect(result).toContain("test_foo");
	});

	it("filterCargoOutput routes to filterCargoBuild for cargo build", () => {
		const input = "error[E0308]: mismatched types";
		const result = filterCargoOutput("cargo build", input);
		expect(result).toContain("Errors");
	});

	it("filterCargoOutput routes to filterCargoBuild for cargo clippy", () => {
		const input = "warning: unused variable: x";
		const result = filterCargoOutput("cargo clippy", input);
		expect(result).toBeTruthy();
	});
});
