import { join } from "path"
import { readdirSync, statSync } from "fs"

// ALWAYS dangerous: nested unbounded quantifiers on overlapping character classes.
// These cause O(2^n) backtracking regardless of input.
const CHECKS: [RegExp, string][] = [
  [/\(\.\+\)[+*]/,           `(.+)+ or (.+)*`],
  [/\(\.\*\)[+*]/,           `(.*)+ or (.*)*`],
  [/\(\\s\+\)[+*]/,          `(\\s+)+ or (\\s+)*`],
  [/\(\\s\*\)[+*]/,          `(\\s*)+ or (\\s*)*`],
  [/\(\\S\+\)[+*]/,          `(\\S+)+ or (\\S+)*`],
  [/\(\\w\+\)[+*]/,          `(\\w+)+ or (\\w+)*`],
  [/\(\\w\*\)[+*]/,          `(\\w*)+ or (\\w*)*`],
  [/\(\\W\+\)[+*]/,          `(\\W+)+ or (\\W+)*`],
  [/\(\\d\+\)[+*]/,          `(\\d+)+ or (\\d+)*`],
  [/\(\\d\*\)[+*]/,          `(\\d*)+ or (\\d*)*`],
  [/\(\\D\+\)[+*]/,          `(\\D+)+ or (\\D+)*`],
  [/\(\[\^\]\+\)[+*]/,       `([^]+)+ or ([^]+)*`],
  [/\(\[\^\]\*\)[+*]/,       `([^]*)+ or ([^]*)*`],
  [/\(\[\\s\\S\]\+\)[+*]/,   `([\\s\\S]+)+ or ([\\s\\S]+)*`],
  [/\(\[\\s\\S\]\*\)[+*]/,   `([\\s\\S]*)+ or ([\\s\\S]*)*`],
  [/\(\[\\d\\D\]\+\)[+*]/,   `([\\d\\D]+)+ or ([\\d\\D]+)*`],
  [/\(\[\\d\\D\]\*\)[+*]/,   `([\\d\\D]*)+ or ([\\d\\D]*)*`],
]

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      yield* walkTs(full)
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield full
    }
  }
}

const walkDirs = [
	join(import.meta.dir!, "..", "packages/core/src"),
	join(import.meta.dir!, "..", "packages/cli/src"),
	join(import.meta.dir!, "..", "packages/mcp/src"),
	join(import.meta.dir!, "..", "packages/opencode/src"),
	join(import.meta.dir!, "..", "tests/core"),
	join(import.meta.dir!, "..", "tests/cli"),
	join(import.meta.dir!, "..", "tests/mcp"),
	join(import.meta.dir!, "..", "tests/opencode"),
]
let found = 0

for (const srcDir of walkDirs) {
	for (const file of walkTs(srcDir)) {
	  const content = require("fs").readFileSync(file, "utf-8")
	  const lines = content.split("\n")

	  for (let i = 0; i < lines.length; i++) {
	    const line = lines[i]
	    for (const [re, label] of CHECKS) {
	      re.lastIndex = 0
	      const match = re.exec(line)
	      if (match) {
	        const idx = match.index
	        const lineTrimmed = line.trim()
	        const ctxStart = Math.max(0, idx - 30)
	        const ctxEnd = Math.min(lineTrimmed.length, idx + (match[0]?.length ?? 0) + 30)
	        const ctx = (ctxStart > 0 ? "..." : "") + lineTrimmed.slice(ctxStart, ctxEnd) + (ctxEnd < lineTrimmed.length ? "..." : "")
	        console.error(`${file}:${i + 1}: ${label}`)
	        console.error(`  ${ctx}`)
	        found++
	      }
	    }
	  }
	}
}

if (found > 0) {
  console.error(`\n❌ Found ${found} potentially dangerous regex pattern(s).`)
  console.error(`   Nested unbounded quantifiers can cause catastrophic backtracking (ReDoS).`)
  console.error(`   Fix: use atomic groups, possessive quantifiers, or rewrite without nesting.`)
  process.exit(1)
} else {
  console.log("✅ No dangerous regex patterns found.")
}
