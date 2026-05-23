// Read result filter — outline source files, pass through short files

export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".rb", ".swift", ".kt", ".scala"]
const CONFIG_EXTENSIONS = [".json", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg", ".env", ".conf"]
const DOC_EXTENSIONS = [".md", ".mdx", ".rst", ".txt"]

const MAX_LINES_PASS = 80

// Simple symbol extraction via regex (no tree-sitter dependency for v1)
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  ".ts,.tsx,.js,.jsx": [
    /^(export\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var)\s+(\w+)/gm,
    /^\s*(export\s+)?(default\s+)?(function|class)\s+(\w+)/gm,
  ],
  ".py": [
    /^(async\s+)?(def|class)\s+(\w+)/gm,
  ],
  ".rs": [
    /^(pub\s+)?(async\s+)?(fn|struct|enum|trait|impl|mod|use|type|const|static)\s+(\w+)/gm,
  ],
  ".go": [
    /^(func|type|var|const)\s+(\w+)/gm,
  ],
  ".java": [
    /^(public|private|protected)?\s*(static\s+)?(class|interface|enum|void|[\w<>[\]]+)\s+(\w+)/gm,
  ],
}

export function filterRead(filePath: string, content: string): string {
  const lines = content.split("\n")

  // Short files pass through
  if (lines.length <= MAX_LINES_PASS) {
    return content
  }

  const ext = "." + filePath.split(".").pop()?.toLowerCase()

  // Config files — usually small, pass through
  if (CONFIG_EXTENSIONS.includes(ext)) {
    return content
  }

  // Markdown — headings + code block summaries
  if (DOC_EXTENSIONS.includes(ext)) {
    return filterMarkdown(content)
  }

  // Source files — outline only
  if (SOURCE_EXTENSIONS.includes(ext)) {
    return outlineSource(filePath, content)
  }

  // Unknown large files — head + tail
  return genericOutline(content)
}

function filterMarkdown(content: string): string {
  const lines = content.split("\n")
  const result: string[] = []
  let inCodeBlock = false
  let codeBlockLines = 0

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        result.push(`\`\`\` [${codeBlockLines} lines]`)
        codeBlockLines = 0
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeBlockLines = 0
      }
      continue
    }
    if (inCodeBlock) {
      codeBlockLines++
      continue
    }
    if (line.startsWith("#")) {
      result.push(line)
    }
  }

  return result.join("\n") || content
}

function outlineSource(filePath: string, content: string): string {
  const ext = "." + filePath.split(".").pop()?.toLowerCase()
  const lines = content.split("\n")

  // Find patterns for this extension
  const patterns = SYMBOL_PATTERNS[Object.keys(SYMBOL_PATTERNS).find((k) => k.includes(ext)) || ""] || []

  const symbols: { line: number; text: string }[] = []
  for (const pattern of patterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split("\n").length
      symbols.push({ line: lineNum, text: match[0].trim() })
    }
  }

  // Deduplicate and sort
  const seen = new Set<number>()
  const unique = symbols.filter((s) => {
    if (seen.has(s.line)) return false
    seen.add(s.line)
    return true
  }).sort((a, b) => a.line - b.line)

  let result = `// ${filePath} (${lines.length} lines, ${unique.length} symbols)\n`
  for (const sym of unique.slice(0, 50)) {
    result += `  L${sym.line}: ${sym.text}\n`
  }
  if (unique.length > 50) {
    result += `  ... and ${unique.length - 50} more symbols\n`
  }
  result += `\n// Use read with line range to see specific sections`

  return result
}

function genericOutline(content: string): string {
  const lines = content.split("\n")
  const head = lines.slice(0, 20)
  const tail = lines.slice(-10)

  let result = head.join("\n")
  result += `\n\n... ${lines.length - 30} lines omitted ...\n\n`
  result += tail.join("\n")

  return result
}
