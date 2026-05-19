// Filesystem commands filter — ls, find, tree, etc.

const NOISE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  "coverage",
  ".turbo",
  ".parcel-cache",
]

export function filterLs(output: string): string {
  const lines = output.split("\n").filter(Boolean)
  const dirs: string[] = []
  const files: string[] = []

  for (const line of lines) {
    // Skip noise directories
    if (NOISE_DIRS.some((d) => line.includes(d))) continue
    if (line.endsWith("/")) dirs.push(line)
    else files.push(line)
  }

  let result = ""
  if (dirs.length > 0) {
    result += `Dirs (${dirs.length}):\n${dirs.slice(0, 30).join("\n")}\n`
    if (dirs.length > 30) result += `... and ${dirs.length - 30} more\n`
  }
  if (files.length > 0) {
    result += `Files (${files.length}):\n${files.slice(0, 50).join("\n")}\n`
    if (files.length > 50) result += `... and ${files.length - 50} more`
  }

  return result || "(empty)"
}

export function filterFind(output: string): string {
  const lines = output.split("\n").filter(Boolean)
  const filtered = lines.filter(
    (l) => !NOISE_DIRS.some((d) => l.includes(`/${d}/`) || l.startsWith(`${d}/`))
  )

  if (filtered.length <= 100) {
    return filtered.join("\n") || "(empty)"
  }

  // Group by top-level directory
  const groups: Record<string, number> = {}
  for (const line of filtered) {
    const top = line.split("/")[0] || "."
    groups[top] = (groups[top] || 0) + 1
  }

  let result = `${filtered.length} files:\n`
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1])
  for (const [dir, count] of sorted.slice(0, 20)) {
    result += `  ${dir}/: ${count}\n`
  }
  if (sorted.length > 20) {
    result += `  ... and ${sorted.length - 20} more directories`
  }

  return result
}

export function filterTree(output: string): string {
  const lines = output.split("\n")
  // Limit depth to 3 levels, collapse empty dirs
  const filtered = lines.filter((l) => {
    // Count indentation level (2 chars per level typically)
    const depth = l.search(/\S/)
    if (depth === -1) return false
    return depth <= 6 // ~3 levels
  })

  // Add summary if truncated
  const summaryLine = lines.find((l) => /^\d+ director/.test(l) || /^\d+ file/.test(l))
  if (summaryLine) {
    filtered.push(summaryLine)
  }

  return filtered.join("\n") || output
}

export function filterFsOutput(command: string, output: string): string {
  if (command.startsWith("ls") || command.includes(" ls ")) return filterLs(output)
  if (command.startsWith("find") || command.includes(" find ")) return filterFind(output)
  if (command.startsWith("tree") || command.includes(" tree ")) return filterTree(output)

  // Default: truncate
  if (output.length > 10000) {
    return output.slice(0, 5000) + "\n... (truncated)"
  }
  return output
}
