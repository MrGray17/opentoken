// Git output filter — extract signal from noise

const ERROR_PATTERNS = [
  /error:/i,
  /fatal:/i,
  /hint:/i,
  /warning:/i,
  /conflict/i,
  /merge conflict/i,
  /cannot/i,
  /failed/i,
  /rejected/i,
  /untracked files/i,
]

export function filterGitStatus(output: string): string {
  const lines = output.split("\n")
  const changed: string[] = []
  const untracked: string[] = []
  let inUntracked = false

  for (const line of lines) {
    if (line.startsWith("Untracked files:")) {
      inUntracked = true
      continue
    }
    if (inUntracked) {
      if (line.trim() && !line.startsWith("\t")) inUntracked = false
      else if (line.trim()) untracked.push(line.trim())
      continue
    }
    // Status lines: " M file.ts", "A  file.ts", "?? file.ts"
    // Also handle "modified:   file.ts" format
    if (/^[AMDRCU?!\s]{2}\s+/.test(line) || /^\s+(modified|added|deleted|renamed|copied):\s+/.test(line)) {
      changed.push(line.trim())
    }
  }

  let result = ""
  if (changed.length > 0) {
    result += changed.join("\n")
  }
  if (untracked.length > 0 && untracked.length <= 20) {
    result += (result ? "\n" : "") + `Untracked: ${untracked.join(", ")}`
  } else if (untracked.length > 20) {
    result += (result ? "\n" : "") + `Untracked: ${untracked.length} files`
  }

  return result || "(clean)"
}

export function filterGitDiff(output: string): string {
  const lines = output.split("\n")
  const files: string[] = []
  const hunks: string[] = []

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      // Extract file name
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/)
      if (match) files.push(match[1])
    } else if (line.startsWith("@@")) {
      hunks.push(line)
    } else if (line.startsWith("+") || line.startsWith("-")) {
      // Keep +/- lines but truncate long ones
      if (line.length > 120) {
        hunks.push(line.slice(0, 120) + "...")
      } else {
        hunks.push(line)
      }
    }
  }

  if (files.length === 0) return "(no changes)"

  let result = `Files changed: ${files.length}\n`
  result += files.map((f) => `  ${f}`).join("\n")
  if (hunks.length > 0 && hunks.length <= 50) {
    result += "\n\n" + hunks.join("\n")
  } else if (hunks.length > 50) {
    result += `\n\n... ${hunks.length} hunk headers (truncated)`
  }

  return result
}

export function filterGitLog(output: string, maxEntries = 10): string {
  const lines = output.split("\n")
  const commits: string[] = []
  let current: string | null = null

  for (const line of lines) {
    if (line.startsWith("commit ")) {
      if (current) commits.push(current)
      if (commits.length >= maxEntries) break
      current = line.slice(0, 12) // short hash
    } else if (line.startsWith("Author:") || line.startsWith("Date:")) {
      continue // skip author/date
    } else if (line.startsWith("Merge:")) {
      current += " (merge)"
    } else if (line.trim()) {
      if (current) current += " " + line.trim()
    }
  }
  if (current && commits.length < maxEntries) commits.push(current)

  return commits.length > 0 ? commits.join("\n") : "(empty)"
}

export function filterGitOutput(command: string, output: string): string {
  // Check for errors first
  if (ERROR_PATTERNS.some((p) => p.test(output))) {
    return output // preserve errors
  }

  if (command.includes("status")) return filterGitStatus(output)
  if (command.includes("diff")) return filterGitDiff(output)
  if (command.includes("log")) return filterGitLog(output)

  // Default: truncate if too long
  if (output.length > 10000) {
    return output.slice(0, 5000) + "\n... (truncated)"
  }
  return output
}
