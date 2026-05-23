// Pip filter — install output compression
// RLE collapse for "Requirement already satisfied" noise
// Errors and version conflicts pass through untouched since they use
// different structural lexemes (ERROR:, WARNING:, FAILED:)

const RLE_PATTERN = /^Requirement already satisfied:/
const COLLECT_PATTERN = /^(Collecting|  Downloading)/

export function filterPipOutput(command: string, output: string): string {
  // Only target install commands — pip list, pip freeze, pip show pass through
  if (!/^\s*pip\s+(install)\b/.test(command)) return output

  const lines = output.split("\n")
  const result: string[] = []
  let rleCount = 0

  for (const line of lines) {
    // Preserve errors, warnings, and success markers verbatim
    if (/^ERROR/i.test(line) || /^WARNING/i.test(line) || /^FAILED/i.test(line)) {
      if (rleCount > 0) {
        result.push(`  ... ${rleCount} requirements already satisfied ...`)
        rleCount = 0
      }
      result.push(line)
      continue
    }
    if (/^Successfully\s+(installed|uninstalled)/i.test(line)) {
      if (rleCount > 0) {
        result.push(`  ... ${rleCount} requirements already satisfied ...`)
        rleCount = 0
      }
      result.push(line)
      continue
    }
    // RLE collapse "Requirement already satisfied" lines
    if (RLE_PATTERN.test(line)) {
      rleCount++
      continue
    }
    // Also fold collection/download lines (low value)
    if (COLLECT_PATTERN.test(line)) {
      continue
    }
    // Flush RLE on any other non-empty line
    if (rleCount > 0) {
      result.push(`  ... ${rleCount} requirements already satisfied ...`)
      rleCount = 0
    }
    if (line.trim()) result.push(line)
  }

  // Flush remaining RLE at end
  if (rleCount > 0) {
    result.push(`  ... ${rleCount} requirements already satisfied ...`)
  }

  if (result.length === 0) {
    return "(pip install output compressed — all requirements already satisfied)"
  }
  return result.join("\n")
}
