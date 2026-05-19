// Grep result filter — collapse duplicates, trim to match + context

const NOISE_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.cache\//,
  /__pycache__\//,
  /\.venv\//,
  /coverage\//,
  /\.next\//,
  /\.nuxt\//,
  /\.svelte-kit\//,
  /\.turbo\//,
  /vendor\//,
  /\.min\./,
]

const MAX_MATCHES_PER_FILE = 10
const CONTEXT_LINES = 3

export function filterGrep(output: string): string {
  const lines = output.split("\n")
  const matches: Map<string, string[]> = new Map()
  const noiseCount = 0

  for (const line of lines) {
    // Skip noise directories
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue

    // Parse grep output: "file:line:content" or "file:line-content"
    const match = line.match(/^(.+?):(\d+):(.*)$/)
    if (!match) continue

    const [, file, lineNum, content] = match
    if (!matches.has(file)) matches.set(file, [])

    const fileMatches = matches.get(file)!
    if (fileMatches.length < MAX_MATCHES_PER_FILE) {
      fileMatches.push(`${lineNum}: ${content}`)
    }
  }

  if (matches.size === 0) {
    return "(no matches)"
  }

  let result = `${matches.size} files, ${[...matches.values()].reduce((a, b) => a + b.length, 0)} matches:\n\n`
  for (const [file, fileMatches] of matches) {
    result += `${file}:\n`
    for (const m of fileMatches) {
      result += `  ${m}\n`
    }
    if (fileMatches.length >= MAX_MATCHES_PER_FILE) {
      result += `  ... more matches\n`
    }
    result += "\n"
  }

  return result.trim()
}
