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

interface GrepMatch {
  file: string
  lineNum: string
  content: string
}

// Parse rg --json line format
function parseRgJsonLine(line: string): GrepMatch | null {
  try {
    const parsed = JSON.parse(line)
    if (parsed.type === "match" && parsed.data?.path?.text && parsed.data?.line_number != null) {
      return {
        file: parsed.data.path.text,
        lineNum: String(parsed.data.line_number),
        content: parsed.data.lines?.text?.trim() ?? parsed.data.submatches?.map((s: { match: { text: string } }) => s.match.text).join(" ") ?? "",
      }
    }
  } catch {
    // Not valid JSON
  }
  return null
}

export function filterGrep(output: string): string {
  const lines = output.split("\n")
  const matches: Map<string, string[]> = new Map()

  // Detect rg --json format (first line is valid JSON with type field)
  const isRgJson = lines.length > 0 && parseRgJsonLine(lines[0]) !== null

  if (isRgJson) {
    // Parse rg --json format
    for (const line of lines) {
      const parsed = parseRgJsonLine(line)
      if (!parsed) continue
      if (NOISE_PATTERNS.some((p) => p.test(parsed.file))) continue

      if (!matches.has(parsed.file)) matches.set(parsed.file, [])
      const fileMatches = matches.get(parsed.file)!
      if (fileMatches.length < MAX_MATCHES_PER_FILE) {
        fileMatches.push(`${parsed.lineNum}: ${parsed.content}`)
      }
    }
  } else {
    // Parse standard grep output or rg --vimgrep format: "file:line:content" or "file:line-col:content"
    for (const line of lines) {
      // Skip noise directories
      if (NOISE_PATTERNS.some((p) => p.test(line))) continue

      // Parse: "file:line:content" or "file:line:col:content" (vimgrep)
      const match = line.match(/^(.+?):(\d+)(?::(\d+))?:?(.*)$/)
      if (!match) continue

      const [, file, lineNum, , content] = match
      if (!matches.has(file)) matches.set(file, [])

      const fileMatches = matches.get(file)!
      if (fileMatches.length < MAX_MATCHES_PER_FILE) {
        fileMatches.push(`${lineNum}: ${content}`)
      }
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
