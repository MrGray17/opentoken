// Test framework filter — pytest, jest, mocha, vitest, go test

const ERROR_PATTERNS = [
  /FAILED/i,
  /error/i,
  /traceback/i,
  /AssertionError/i,
  /TypeError/i,
  /SyntaxError/i,
  /panic:/i,
  /fatal:/i,
]

export function filterPytest(output: string): string {
  const lines = output.split("\n")
  const failures: string[] = []
  const summary: string[] = []
  let inFailure = false
  let failureLines: string[] = []

  for (const line of lines) {
    // Pytest failure header: "___ test_name ___"
    if (/^_{3,}\s+\w+/.test(line)) {
      if (inFailure && failureLines.length > 0) {
        failures.push(failureLines.join("\n"))
      }
      inFailure = true
      failureLines = [line]
    } else if (inFailure) {
      failureLines.push(line)
      // End of failure block
      if (line.startsWith("=") || line.trim() === "") {
        inFailure = false
        failures.push(failureLines.join("\n"))
        failureLines = []
      }
    }
    // Summary line
    if (/^\d+ (passed|failed|error|skipped|warning)/.test(line)) {
      summary.push(line)
    }
    // Short summary table
    if (/^FAILED\s+/.test(line) || /^ERROR\s+/.test(line)) {
      summary.push(line)
    }
  }
  if (inFailure && failureLines.length > 0) {
    failures.push(failureLines.join("\n"))
  }

  if (failures.length === 0) {
    return summary.join("\n") || "(all tests passed)"
  }

  let result = `FAILURES (${failures.length}):\n\n`
  result += failures.slice(0, 5).join("\n\n")
  if (failures.length > 5) {
    result += `\n\n... and ${failures.length - 5} more`
  }
  result += "\n\n" + summary.join("\n")

  return result
}

export function filterGoTest(output: string): string {
  const lines = output.split("\n")
  const failures: string[] = []
  const summary: string[] = []

  for (const line of lines) {
    if (/^--- FAIL:/.test(line)) {
      failures.push(line)
    } else if (/^(ok|FAIL)\s+/.test(line)) {
      summary.push(line)
    } else if (/^panic:/.test(line)) {
      failures.push(line)
    }
  }

  if (failures.length === 0) {
    return summary.join("\n") || "(all tests passed)"
  }

  let result = `FAILURES (${failures.length}):\n`
  result += failures.slice(0, 10).join("\n")
  if (failures.length > 10) {
    result += `\n... and ${failures.length - 10} more`
  }
  result += "\n" + summary.join("\n")

  return result
}

export function filterTestOutput(command: string, output: string): string {
  // Check for errors first
  if (ERROR_PATTERNS.some((p) => p.test(output))) {
    // Keep error context
  }

  if (command.includes("pytest") || command.includes("py.test")) {
    return filterPytest(output)
  }
  if (command.includes("go test")) {
    return filterGoTest(output)
  }

  // Generic test filter
  const lines = output.split("\n")
  const errorLines = lines.filter((l) => ERROR_PATTERNS.some((p) => p.test(l)))
  const summaryLines = lines.filter((l) =>
    /(passed|failed|error|skipped|test suites|tests:|time:)/i.test(l)
  )

  if (errorLines.length === 0) {
    return summaryLines.join("\n") || "(all tests passed)"
  }

  return [...errorLines.slice(0, 30), ...summaryLines].join("\n")
}
