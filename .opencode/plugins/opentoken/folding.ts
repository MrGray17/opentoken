// Diff Folding + Log Folding — inspired by claw-compactor
// Collapse unchanged diff context lines and repeated log lines

// Diff Folding — collapse unchanged context lines in git diff output
export function foldDiff(content: string): string {
  const lines = content.split("\n")
  const result: string[] = []
  let contextRun = 0
  let inHunk = false

  for (const line of lines) {
    // Detect hunk headers
    if (line.startsWith("@@")) {
      // Flush any pending context run
      if (contextRun > 0) {
        result.push(`  ... ${contextRun} context lines omitted`)
        contextRun = 0
      }
      inHunk = true
      result.push(line)
      continue
    }

    // Detect diff headers
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
      if (contextRun > 0) {
        result.push(`  ... ${contextRun} context lines omitted`)
        contextRun = 0
      }
      inHunk = false
      result.push(line)
      continue
    }

    if (inHunk) {
      // Context lines (start with space)
      if (line.startsWith(" ") && line.length > 1) {
        contextRun++
        continue
      }

      // Added/removed lines — flush context run first
      if (contextRun > 0) {
        if (contextRun <= 3) {
          // Keep short context runs
          for (let i = 0; i < contextRun; i++) {
            result.push("  [context]")
          }
        } else {
          result.push(`  ... ${contextRun} context lines omitted`)
        }
        contextRun = 0
      }

      // Keep added/removed lines
      if (line.startsWith("+") || line.startsWith("-")) {
        // Truncate long lines
        if (line.length > 120) {
          result.push(line.slice(0, 120) + "...")
        } else {
          result.push(line)
        }
      }
    } else {
      // Outside hunks — keep headers
      result.push(line)
    }
  }

  // Flush final context run
  if (contextRun > 0) {
    result.push(`  ... ${contextRun} context lines omitted`)
  }

  return result.join("\n")
}

// Log Folding — collapse repeated consecutive log lines
export function foldLogs(content: string): string {
  const lines = content.split("\n")
  const result: string[] = []
  let currentLine = ""
  let runCount = 0

  for (const line of lines) {
    if (line === currentLine) {
      runCount++
    } else {
      // Flush previous run
      if (runCount > 1) {
        result.push(`  ${runCount} x ${currentLine}`)
      } else if (runCount === 1) {
        result.push(currentLine)
      }
      currentLine = line
      runCount = 1
    }
  }

  // Flush final run
  if (runCount > 1) {
    result.push(`  ${runCount} x ${currentLine}`)
  } else if (runCount === 1) {
    result.push(currentLine)
  }

  return result.join("\n")
}

// Combined diff + log folding
export function foldDiffAndLogs(content: string): string {
  let result = content

  // Detect if content is a diff
  if (content.includes("diff --git") || content.startsWith("@@")) {
    result = foldDiff(result)
  }

  // Detect if content looks like log output
  if (content.includes("[INFO]") || content.includes("[WARN]") || content.includes("[ERROR]") ||
      content.includes("INFO:") || content.includes("WARN:") || content.includes("ERROR:")) {
    result = foldLogs(result)
  }

  return result
}
