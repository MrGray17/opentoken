// Cargo filter — build, test, clippy output

const ERROR_PATTERNS = [
  /error\[/i,
  /warning\[/i,
  /failed/i,
  /panicked/i,
  /thread.*panicked/i,
]

export function filterCargoBuild(output: string): string {
  const lines = output.split("\n")
  const errors: string[] = []
  const warnings: string[] = []
  let inBlock = false
  let block: string[] = []

  for (const line of lines) {
    if (line.startsWith("error[")) {
      if (inBlock && block.length > 0) errors.push(block.join("\n"))
      inBlock = true
      block = [line]
    } else if (line.startsWith("warning[")) {
      if (inBlock && block.length > 0) warnings.push(block.join("\n"))
      inBlock = true
      block = [line]
    } else if (inBlock) {
      block.push(line)
      if (line.trim() === "" || line.startsWith("error[") || line.startsWith("warning[")) {
        if (line.startsWith("error[")) {
          errors.push(block.join("\n"))
          block = [line]
        } else if (line.startsWith("warning[")) {
          warnings.push(block.join("\n"))
          block = [line]
        } else {
          inBlock = false
          if (block.join("\n").includes("error[")) errors.push(block.join("\n"))
          else warnings.push(block.join("\n"))
          block = []
        }
      }
    }
    // Summary
    if (/^error: could not compile/.test(line)) {
      errors.push(line)
    }
    if (/^(Finished|Compiling|Downloading)/.test(line)) {
      // Skip compilation progress
    }
  }
  if (inBlock && block.length > 0) {
    if (block.join("\n").includes("error[")) errors.push(block.join("\n"))
    else warnings.push(block.join("\n"))
  }

  let result = ""
  if (errors.length > 0) {
    result += `Errors (${errors.length}):\n${errors.slice(0, 5).join("\n\n")}\n`
    if (errors.length > 5) result += `... and ${errors.length - 5} more\n`
  }
  if (warnings.length > 0 && warnings.length <= 10) {
    result += `Warnings (${warnings.length}):\n${warnings.join("\n")}\n`
  } else if (warnings.length > 10) {
    result += `Warnings: ${warnings.length} (truncated)\n`
  }

  return result || "(compiled successfully)"
}

export function filterCargoTest(output: string): string {
  const lines = output.split("\n")
  const failures: string[] = []
  const summary: string[] = []

  for (const line of lines) {
    if (/^test .* \.\.\. FAILED$/.test(line)) {
      failures.push(line)
    } else if (/^test .* \.\.\. (ok|ignored|failed)$/.test(line)) {
      // Skip individual test results, keep summary
    } else if (/^(test result:|running \d+ test)/.test(line)) {
      summary.push(line)
    } else if (ERROR_PATTERNS.some((p) => p.test(line))) {
      failures.push(line)
    }
  }

  if (failures.length === 0) {
    return summary.join("\n") || "(all tests passed)"
  }

  let result = `FAILURES (${failures.length}):\n`
  result += failures.slice(0, 10).join("\n")
  if (failures.length > 10) result += `\n... and ${failures.length - 10} more`
  result += "\n" + summary.join("\n")

  return result
}

export function filterCargoOutput(command: string, output: string): string {
  if (command.includes("test")) return filterCargoTest(output)
  if (command.includes("clippy")) return filterCargoBuild(output)
  if (command.includes("build") || command.includes("check")) return filterCargoBuild(output)

  // Default: truncate
  if (output.length > 10000) {
    return output.slice(0, 5000) + "\n... (truncated)"
  }
  return output
}
