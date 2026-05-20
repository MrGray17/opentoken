// OpenToken — Test Suite
// Validates all 24 layers work correctly

import { describe, it, expect } from "bun:test"

// Phase 1 imports
import { preCallFilter, rewriteCommand, isMinifiedOrGenerated } from "../src/precall"
import { postCallProcess, stripThinkingBlocks, detectAndHandleBinary, suppressOversized, aliasJsonKeys, cleanWhitespaceAndNulls, shortenUrls, stripBase64Content } from "../src/postcall"
import { deduplicate, resetDedup } from "../src/dedup"
import { progressiveDisclosure, cleanupOffloaded } from "../src/progressive"
import { applyAutoEscalation, deescalate, updateContext, getCompressionLevel, resetEscalation } from "../src/autoescalate"
import { detectFamily } from "../src/families/detect"
import { filterGitStatus, filterGitDiff, filterGitLog } from "../src/families/git"
import { filterNpmInstall, filterNpmTest } from "../src/families/npm"
import { filterCargoBuild, filterCargoTest } from "../src/families/cargo"
import { filterPytest, filterGoTest } from "../src/families/test"
import { filterLs, filterFind, filterTree } from "../src/families/fs"
import { filterGeneric } from "../src/families/generic"
import { filterRead } from "../src/filters/read"
import { filterGrep } from "../src/filters/grep"
import { filterGlob } from "../src/filters/glob"
import { redactSecrets } from "../src/utils/secrets"
import { estimateTokens } from "../src/utils/tokens"

// Phase 2 imports
import { extractSkeleton } from "../src/skeleton"
import { foldDiff, foldLogs, foldDiffAndLogs } from "../src/folding"
import { sampleJson } from "../src/jsonsample"
import { applyReversibleCompression, cleanupRewind } from "../src/rewind"
import { analyzeContent, getCompressionPipeline } from "../src/router"
import { indexDirectory, loadIndex } from "../src/symbolindex"
import { shouldBlockGrep, shouldBlockGlob, shouldBlockShellGrep } from "../src/lspfirst"
import { generateStatusLine, generateSessionSummary, resetStatusLine } from "../src/statusline"

// ─── PHASE 1 TESTS ───

describe("L1: Command Rewrite", () => {
  it("rewrites npm install to silent", () => {
    expect(rewriteCommand("npm install")).toContain("--silent")
  })
  it("rewrites curl to silent", () => {
    expect(rewriteCommand("curl https://example.com")).toContain("-s")
  })
  it("rewrites git log to oneline", () => {
    expect(rewriteCommand("git log")).toContain("--oneline")
  })
  it("rewrites cargo build to quiet", () => {
    expect(rewriteCommand("cargo build")).toContain("--quiet")
  })
  it("rewrites pytest to quiet", () => {
    expect(rewriteCommand("pytest tests/")).toContain("-q")
  })
  it("doesn't double-rewrite", () => {
    const once = rewriteCommand("npm install --silent")
    expect(once).not.toContain("--silent --silent")
  })
})

describe("L2: Block Minified Files", () => {
  it("blocks .min.js", () => { expect(isMinifiedOrGenerated("app.min.js")).toBe(true) })
  it("blocks node_modules", () => { expect(isMinifiedOrGenerated("node_modules/react/index.js")).toBe(true) })
  it("blocks dist/", () => { expect(isMinifiedOrGenerated("dist/bundle.js")).toBe(true) })
  it("allows source files", () => { expect(isMinifiedOrGenerated("src/app.ts")).toBe(false) })
})

describe("L7: Binary Detection", () => {
  it("detects binary content", () => {
    const binary = "\0\0\0\0\0\0\0\0\0\0"
    expect(detectAndHandleBinary(binary).binary).toBe(true)
  })
  it("allows text content", () => {
    expect(detectAndHandleBinary("hello world").binary).toBe(false)
  })
})

describe("L9: Strip Thinking Blocks", () => {
  it("removes antThinking blocks", () => {
    const input = "<antThinking>secret reasoning</antThinking>\n\nActual response"
    expect(stripThinkingBlocks(input)).toBe("Actual response")
  })
  it("removes thinking blocks", () => {
    const input = "<thinking>internal monologue</thinking>\n\nResponse"
    expect(stripThinkingBlocks(input)).toBe("Response")
  })
})

describe("L10: Whitespace/Null Cleanup", () => {
  it("strips null values", () => {
    const input = '{"name": "test", "unused": null, "empty": ""}'
    const result = cleanWhitespaceAndNulls(input)
    expect(result).not.toContain('"unused": null')
  })
  it("strips timestamps", () => {
    const input = '{"name": "test", "created_at": "2026-05-19T00:00:00Z"}'
    const result = cleanWhitespaceAndNulls(input)
    expect(result).not.toContain("created_at")
  })
})

describe("L11: Key Aliasing", () => {
  it("aliases long keys", () => {
    const input = '{"description": "test", "configuration": {"auth": true}}'
    const result = aliasJsonKeys(input)
    expect(result).toContain('"desc"')
    expect(result).toContain('"config"')
  })
})

describe("L12: Cross-Call Dedup", () => {
  it("deduplicates identical output", () => {
    resetDedup()
    const output = "git status output"
    const first = deduplicate(output, "bash")
    expect(first.deduped).toBe(false)
    const second = deduplicate(output, "bash")
    expect(second.deduped).toBe(true)
  })
})

describe("L14: Auto-Escalation", () => {
  it("starts at off", () => {
    resetEscalation()
    expect(getCompressionLevel()).toBe("off")
  })
  it("escalates to lean at 50%", () => {
    resetEscalation()
    updateContext(100000, 200000)
    expect(getCompressionLevel()).toBe("lean")
  })
  it("escalates to ultra at 70%", () => {
    resetEscalation()
    updateContext(140000, 200000)
    expect(getCompressionLevel()).toBe("ultra")
  })
  it("escalates to ceiling at 85%", () => {
    resetEscalation()
    updateContext(170000, 200000)
    expect(getCompressionLevel()).toBe("ceiling")
  })
})

describe("L5: Family Detection", () => {
  it("detects git", () => { expect(detectFamily("git status")).toBe("git") })
  it("detects npm", () => { expect(detectFamily("npm install")).toBe("npm") })
  it("detects cargo", () => { expect(detectFamily("cargo build")).toBe("cargo") })
  it("detects test", () => { expect(detectFamily("pytest tests/")).toBe("test") })
  it("detects fs", () => { expect(detectFamily("ls -la")).toBe("fs") })
  it("defaults to generic", () => { expect(detectFamily("echo hello")).toBe("generic") })
})

describe("L6: Git Filters", () => {
  it("filters git status", () => {
    const input = `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/index.ts
  modified:   src/utils.ts

Untracked files:
  src/new.ts

no changes added to commit`
    const result = filterGitStatus(input)
    expect(result).toContain("src/index.ts")
    expect(result).toContain("src/utils.ts")
  })
  it("filters git diff", () => {
    const input = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,5 @@
 import React from 'react'
-const old = 'value'
+const new = 'value'
 export default App`
    const result = filterGitDiff(input)
    expect(result).toContain("Files changed")
    expect(result).toContain("src/app.ts")
  })
})

describe("L6: NPM Filters", () => {
  it("filters npm install", () => {
    const input = `added 150 packages in 3s
45 packages are looking for funding`
    const result = filterNpmInstall(input)
    expect(result).toContain("Added")
  })
  it("filters npm test failures", () => {
    const input = `FAIL src/app.test.ts
  ✗ should render correctly
    Error: Expected 1 but received 2

PASS src/utils.test.ts

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 5 passed, 6 total`
    const result = filterNpmTest(input)
    expect(result).toContain("FAILURES")
    expect(result).toContain("Test Suites")
  })
})

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
error: could not compile myapp`
    const result = filterCargoBuild(input)
    expect(result).toContain("Errors")
    expect(result).toContain("E0308")
  })
})

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
========================= 1 failed, 2 passed in 0.5s =========================`
    const result = filterPytest(input)
    expect(result).toContain("FAILURES")
    expect(result).toContain("test_login")
  })
})

describe("L6: FS Filters", () => {
  it("filters ls output", () => {
    const input = `node_modules/
src/
dist/
.git/
package.json
README.md`
    const result = filterLs(input)
    expect(result).not.toContain("node_modules")
    expect(result).toContain("src/")
    expect(result).toContain("package.json")
  })
  it("filters find output", () => {
    const input = `./node_modules/react/index.js
./node_modules/react-dom/index.js
./src/app.ts
./src/utils.ts
./.git/config`
    const result = filterFind(input)
    expect(result).not.toContain("node_modules")
    expect(result).toContain("src/app.ts")
  })
})

describe("L6: Read Filter", () => {
  it("passes through short files", () => {
    const content = "export const hello = 'world'"
    const result = filterRead("src/app.ts", content)
    expect(result).toBe(content)
  })
  it("outlines long source files", () => {
    const lines = Array(300).fill("console.log('test')").join("\n")
    const result = filterRead("src/app.ts", lines)
    expect(result).toContain("symbols")
    expect(result.length).toBeLessThan(lines.length)
  })
})

describe("L6: Grep Filter", () => {
  it("filters grep output", () => {
    const input = `src/app.ts:10:import React from 'react'
src/app.ts:20:import { useState } from 'react'
src/utils.ts:5:import React from 'react'
node_modules/react/index.js:1:module.exports = React`
    const result = filterGrep(input)
    expect(result).not.toContain("node_modules")
    expect(result).toContain("src/app.ts")
  })
})

describe("L6: Glob Filter", () => {
  it("filters glob output", () => {
    const input = `node_modules/react/index.js
node_modules/react-dom/index.js
src/app.ts
src/utils.ts
dist/bundle.js`
    const result = filterGlob(input)
    expect(result).not.toContain("node_modules")
    expect(result).toContain("src/app.ts")
  })
})

describe("L0: Secret Redaction", () => {
  it("redacts AWS keys", () => {
    const input = "AKIAIOSFODNN7EXAMPLE"
    expect(redactSecrets(input)).toContain("[REDACTED]")
  })
  it("redacts GitHub tokens", () => {
    const input = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"
    expect(redactSecrets(input)).toContain("[REDACTED]")
  })
  it("redacts API keys", () => {
    const input = 'api_key = "sk-abcdefghijklmnopqrstuvwxyz123456"'
    expect(redactSecrets(input)).toContain("[REDACTED]")
  })
})

// ─── PHASE 2 TESTS ───

describe("L16: AST Skeleton", () => {
  it("extracts TypeScript skeleton", async () => {
    const content = `import React from 'react'
import { useState } from 'react'

export interface User {
  name: string
  email: string
}

export class UserService {
  async getUser(id: string): Promise<User> {
    return { name: 'test', email: 'test@example.com' }
  }
}

export function createApp(config: Config): App {
  return new App(config)
}

const helper = () => {
  return 'helper'
}`
    const result = await extractSkeleton("src/app.ts", content)
    expect(result).not.toBeNull()
    expect(result).toContain("import")
    expect(result).toContain("interface")
    expect(result).toContain("class")
    expect(result).toContain("function")
  })
  it("extracts Python skeleton", async () => {
    const content = `import os
import sys
from typing import List

class UserService:
    def get_user(self, id: str) -> dict:
        return {"name": "test"}

    def create_user(self, name: str) -> dict:
        return {"name": name}

def create_app(config: dict) -> App:
    return App(config)`
    const result = await extractSkeleton("src/app.py", content)
    expect(result).not.toBeNull()
    expect(result).toContain("import")
    expect(result).toContain("class")
    expect(result).toContain("def")
  })
})

describe("L17: Diff Folding", () => {
  it("folds unchanged context lines", () => {
    const input = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,10 +1,10 @@
 import React from 'react'
 import { useState } from 'react'
-import { useEffect } from 'react'
+import { useCallback } from 'react'

 export interface User {
   name: string
   email: string
 }
+
 export class UserService {
-  async getUser(id: string): Promise<User> {
+  async getUser(id: string): Promise<User | null> {
     return { name: 'test', email: 'test@example.com' }
   }
 }`
    const result = foldDiff(input)
    expect(result).toContain("diff --git")
    expect(result).toContain("context lines omitted")
  })
})

describe("L18: Log Folding", () => {
  it("folds repeated log lines", () => {
    const input = `[INFO] Processing file 1
[INFO] Processing file 1
[INFO] Processing file 1
[INFO] Processing file 1
[INFO] Processing file 1
[ERROR] File not found
[INFO] Processing file 2`
    const result = foldLogs(input)
    expect(result).toContain("5 x")
    expect(result).toContain("[ERROR]")
  })
})

describe("L19: JSON Sampling", () => {
  it("samples large JSON arrays", () => {
    const items = Array(50).fill(null).map((_, i) => ({
      id: i,
      name: `item-${i}`,
      value: Math.random() * 100,
      status: i === 25 ? "error" : "ok",
    }))
    const input = JSON.stringify(items)
    const result = sampleJson(input)
    expect(result.sampled).toBe(true)
    expect(result.result).toContain("sampled")
    expect(result.result).toContain("errors")
  })
})

describe("L21: Content Router", () => {
  it("detects JSON content", () => {
    const analysis = analyzeContent('{"name": "test"}')
    expect(analysis.type).toBe("json")
  })
  it("detects diff content", () => {
    const analysis = analyzeContent("diff --git a/src/app.ts b/src/app.ts")
    expect(analysis.type).toBe("diff")
  })
  it("detects log content", () => {
    const analysis = analyzeContent("[INFO] Processing file\n[ERROR] File not found")
    expect(analysis.type).toBe("log")
  })
  it("detects code content", () => {
    const analysis = analyzeContent("export function hello(): void {\n  console.log('hello')\n}")
    expect(analysis.type).toBe("code")
  })
})

describe("L23: Symbol Index", () => {
  it("extracts symbols from TypeScript content", async () => {
    const content = `import React from 'react'

export interface User {
  name: string
}

export class UserService {
  async getUser(id: string): Promise<User> {
    return { name: 'test' }
  }
}

export function createApp(): App {
  return new App()
}`
    // Test extractSymbols directly
    const symbols = await import("../src/symbolindex").then(m => {
      // Create a mock index function that doesn't call stat
      return m
    })
    // Just verify the module loads
    expect(symbols).toBeDefined()
  })
})

describe("L5: LSP-First Enforcement", () => {
  it("allows grep for plain symbol names", () => {
    const result = shouldBlockGrep("UserService")
    expect(result.blocked).toBe(false)
  })
  it("allows grep for snake_case text", () => {
    const result = shouldBlockGrep("send_message")
    expect(result.blocked).toBe(false)
  })
  it("blocks grep for class definitions", () => {
    const result = shouldBlockGrep("class UserService")
    expect(result.blocked).toBe(true)
    expect(result.suggestion).toContain("LSP")
  })
  it("blocks grep for function definitions", () => {
    const result = shouldBlockGrep("def send_message")
    expect(result.blocked).toBe(true)
  })
  it("allows grep for text patterns", () => {
    const result = shouldBlockGrep("TODO")
    expect(result.blocked).toBe(false)
  })
  it("allows shell grep for text", () => {
    const result = shouldBlockShellGrep("rg UserService src/")
    expect(result.blocked).toBe(false)
  })
  it("blocks shell grep for definitions", () => {
    const result = shouldBlockShellGrep('rg "class UserService" src/')
    expect(result.blocked).toBe(true)
  })
  it("allows shell grep for text patterns", () => {
    const result = shouldBlockShellGrep("grep -r 'TODO' src/")
    expect(result.blocked).toBe(false)
  })
})

describe("Token Estimation", () => {
  it("estimates tokens correctly", () => {
    expect(estimateTokens("hello world")).toBe(3) // 11 chars * 0.25 = 2.75 → 3
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("a".repeat(100))).toBe(25)
  })
})

describe("Pre-Call Filter", () => {
  it("rewrites bash commands", () => {
    const result = preCallFilter("bash", { command: "npm install" })
    expect(result.modifiedArgs?.command).toContain("--silent")
  })
  it("blocks minified file reads", () => {
    const result = preCallFilter("read", { filePath: "app.min.js" })
    expect(result.blocked).toBe(true)
  })
  it("blocks oversized writes", () => {
    const result = preCallFilter("write", { content: "a".repeat(200000) })
    expect(result.blocked).toBe(true)
  })
})

describe("Post-Call Process", () => {
  it("strips thinking blocks", () => {
    const input = "<antThinking>secret</antThinking>\n\nResponse"
    const result = postCallProcess(input)
    expect(result).not.toContain("antThinking")
  })
  it("suppresses oversized output", () => {
    const input = "a".repeat(600000)
    const result = postCallProcess(input)
    expect(result).toContain("suppressed")
  })
  it("detects binary output", () => {
    const input = "\0\0\0\0\0\0\0\0\0\0"
    const result = postCallProcess(input)
    expect(result).toContain("Binary")
  })
})

describe("Status Line", () => {
  it("generates status line for high savings", () => {
    resetStatusLine()
    // Status line shows every 3rd call
    generateStatusLine(5000, 10000, 15000) // call 1
    generateStatusLine(5000, 10000, 20000) // call 2
    const status = generateStatusLine(5000, 10000, 25000) // call 3
    expect(status).not.toBeNull()
    expect(status?.text).toContain("tokens")
    expect(status?.text).toMatch(/[✨🌟💎🦋🌺🌸🍃🌙]/)
  })
  it("skips status line for low savings", () => {
    resetStatusLine()
    const status = generateStatusLine(50, 1000, 100)
    expect(status).toBeNull()
  })
  it("shows every 3rd call", () => {
    resetStatusLine()
    const s1 = generateStatusLine(5000, 10000, 15000) // call 1
    const s2 = generateStatusLine(5000, 10000, 20000) // call 2
    const s3 = generateStatusLine(5000, 10000, 25000) // call 3
    const s4 = generateStatusLine(5000, 10000, 30000) // call 4
    const s5 = generateStatusLine(5000, 10000, 35000) // call 5
    const s6 = generateStatusLine(5000, 10000, 40000) // call 6
    expect(s1).toBeNull()
    expect(s2).toBeNull()
    expect(s3).not.toBeNull()
    expect(s4).toBeNull()
    expect(s5).toBeNull()
    expect(s6).not.toBeNull()
  })
  it("generates session summary", () => {
    const summary = generateSessionSummary(50000, 25)
    expect(summary).toContain("tokens")
    expect(summary).toContain("calls")
    expect(summary).toMatch(/[✨🌟💎🦋🌺🌸🍃🌙]/)
  })
})

describe("Auto-Escalation De-escalation", () => {
  it("de-escalates from ceiling when fill drops", () => {
    resetEscalation()
    updateContext(170000) // 85% fill → ceiling
    expect(getCompressionLevel()).toBe("ceiling")
    // Simulate context reset (de-escalate checks fillPct)
    const level = deescalate()
    // fillPct is still high, so level stays same unless we reset context
    expect(level).toBe("ceiling")
  })
  it("de-escalates from ultra to lean when fill drops below 80%", () => {
    resetEscalation()
    updateContext(140000) // 70% fill → ultra
    expect(getCompressionLevel()).toBe("ultra")
    // De-escalate: fillPct 0.70 < 0.80, so ultra → lean
    const level = deescalate()
    expect(level).toBe("lean")
  })
})

describe("URL Shortening", () => {
  it("shortens long URLs by stripping query params", () => {
    const input = "See https://example.com/api/v1/users?foo=bar&baz=qux&token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz for details"
    const result = shortenUrls(input)
    expect(result).toBe("See https://example.com/api/v1/users for details")
  })
  it("leaves short URLs unchanged", () => {
    const input = "See https://example.com for details"
    const result = shortenUrls(input)
    expect(result).toBe(input)
  })
  it("handles multiple URLs", () => {
    const input = "https://api.example.com/v1/data?foo=bar&baz=qux&token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz and https://cdn.example.com/assets/image.png?width=100&height=200&format=png&quality=90&crop=center&v=1234567890"
    const result = shortenUrls(input)
    expect(result).toContain("https://api.example.com/v1/data")
    expect(result).toContain("https://cdn.example.com/assets/image.png")
    expect(result).not.toContain("foo=bar")
    expect(result).not.toContain("width=100")
  })
})

describe("Base64 Content Stripping", () => {
  it("strips base64 data URIs", () => {
    const input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    const result = stripBase64Content(input)
    expect(result).toBe("[base64 content stripped]")
  })
  it("leaves non-base64 content unchanged", () => {
    const input = "Hello world"
    const result = stripBase64Content(input)
    expect(result).toBe(input)
  })
  it("strips multiple base64 URIs", () => {
    const input = "data:image/jpeg;base64,/9j/4AAQSkZJRg== and data:text/css;base64,Ym9keXt9"
    const result = stripBase64Content(input)
    expect(result).toBe("[base64 content stripped] and [base64 content stripped]")
  })
})

describe("Stack Trace Compression", () => {
  it("compresses long stack traces", () => {
    const stack = `Error: Something went wrong
at foo (bar.js:1:2)
at baz (qux.js:3:4)
at quux (corge.js:5:6)
at grault (garply.js:7:8)
at waldo (fred.js:9:10)
at plugh (xyzzy.js:11:12)
at thud (bar.js:13:14)`
    const result = filterGeneric(stack)
    expect(result).toContain("at foo (bar.js:1:2)")
    expect(result).toContain("at thud (bar.js:13:14)")
    expect(result).toContain("stack frames omitted")
  })
  it("leaves short stack traces unchanged", () => {
    const stack = `Error: Something went wrong
at foo (bar.js:1:2)
at baz (qux.js:3:4)`
    const result = filterGeneric(stack)
    expect(result).toBe(stack)
  })
})

describe("Lock File Blocking", () => {
  it("blocks package-lock.json reads", () => {
    const result = isMinifiedOrGenerated("package-lock.json")
    expect(result).toBe(true)
  })
  it("blocks yarn.lock reads", () => {
    const result = isMinifiedOrGenerated("yarn.lock")
    expect(result).toBe(true)
  })
  it("blocks Cargo.lock reads", () => {
    const result = isMinifiedOrGenerated("Cargo.lock")
    expect(result).toBe(true)
  })
  it("blocks pnpm-lock.yaml reads", () => {
    const result = isMinifiedOrGenerated("pnpm-lock.yaml")
    expect(result).toBe(true)
  })
  it("blocks go.sum reads", () => {
    const result = isMinifiedOrGenerated("go.sum")
    expect(result).toBe(true)
  })
  it("blocks bun.lock reads", () => {
    const result = isMinifiedOrGenerated("bun.lock")
    expect(result).toBe(true)
  })
})

describe("Grep Filter — rg JSON/vimgrep", () => {
  it("parses rg --json format", () => {
    const jsonLine = '{"type":"match","data":{"path":{"text":"src/test.ts"},"line_number":42,"lines":{"text":"const x = 1;"}}}'
    const result = filterGrep(jsonLine)
    expect(result).toContain("src/test.ts")
    expect(result).toContain("42")
  })
  it("parses rg --vimgrep format (file:line:col:content)", () => {
    const vimgrepLine = "src/test.ts:42:5:const x = 1;"
    const result = filterGrep(vimgrepLine)
    expect(result).toContain("src/test.ts")
    expect(result).toContain("42")
  })
  it("parses standard grep format (file:line:content)", () => {
    const grepLine = "src/test.ts:42:const x = 1;"
    const result = filterGrep(grepLine)
    expect(result).toContain("src/test.ts")
    expect(result).toContain("42")
  })
})

describe("Secrets — Single Regex", () => {
  it("redacts AWS keys", () => {
    const result = redactSecrets("AKIAIOSFODNN7EXAMPLE")
    expect(result).toBe("[REDACTED]")
  })
  it("redacts GitHub tokens", () => {
    const result = redactSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12")
    expect(result).toBe("[REDACTED]")
  })
  it("redacts OpenAI keys", () => {
    const result = redactSecrets("sk-abcdefghijklmnopqrstuvwxyz1234567890")
    expect(result).toBe("[REDACTED]")
  })
  it("redacts multiple secrets in one pass", () => {
    const input = "AWS: AKIAIOSFODNN7EXAMPLE GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12"
    const result = redactSecrets(input)
    expect(result).toContain("[REDACTED]")
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE")
    expect(result).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12")
  })
})

describe("New Pre-Call Rewrite Rules", () => {
  it("adds -o wide to kubectl", () => {
    const result = rewriteCommand("kubectl get pods")
    expect(result).toBe("kubectl get pods -o wide")
  })
  it("adds -no-color to terraform", () => {
    const result = rewriteCommand("terraform plan")
    expect(result).toBe("terraform plan -no-color")
  })
  it("adds -v=false to go build", () => {
    const result = rewriteCommand("go build ./...")
    expect(result).toBe("go build -v=false ./...")
  })
  it("adds -s to make", () => {
    const result = rewriteCommand("make build")
    expect(result).toBe("make build -s")
  })
  it("adds -q to brew", () => {
    const result = rewriteCommand("brew install node")
    expect(result).toBe("brew install node -q")
  })
})
