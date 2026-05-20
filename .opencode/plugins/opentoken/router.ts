// Content-Aware Router — inspired by claw-compactor's Cortex stage
// Auto-detect content type and language, then fire only relevant compression stages

export type ContentType =
  | "code"
  | "json"
  | "diff"
  | "log"
  | "markdown"
  | "csv"
  | "xml"
  | "yaml"
  | "html"
  | "sql"
  | "shell"
  | "config"
  | "text"
  | "binary"

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp"
  | "ruby"
  | "swift"
  | "kotlin"
  | "scala"
  | "php"
  | "csharp"
  | "unknown"

interface ContentAnalysis {
  type: ContentType
  language: Language
  size: number
  lines: number
  isStructured: boolean
  hasErrors: boolean
  isRepetitive: boolean
  compressionCandidates: string[]
}

// File extension to language mapping
const EXT_TO_LANG: Record<string, Language> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  php: "php",
  cs: "csharp",
}

// Content type detection patterns — scored, not first-match-wins
// Each pattern contributes a score; highest score wins
const TYPE_PATTERNS: { type: ContentType; pattern: RegExp; weight: number }[] = [
  { type: "diff", pattern: /^diff --git/m, weight: 3 },
  { type: "log", pattern: /^\d{4}-\d{2}-\d{2}/m, weight: 2 },
  { type: "log", pattern: /^(?:\[INFO\]|\[WARN\]|\[ERROR\]|\[DEBUG\])/m, weight: 2 },
  { type: "json", pattern: /^\s*(\{|\["|\[\{|\[\d|\[\s*")/, weight: 3 },
  { type: "csv", pattern: /^[^,\n]+,[^,\n]+(,[^,\n]+)*\n/m, weight: 2 },
  { type: "xml", pattern: /^\s*<\?xml/, weight: 3 },
  { type: "yaml", pattern: /^[\s-]*\w+:\s/m, weight: 2 },
  { type: "html", pattern: /^\s*<!DOCTYPE|^\s*<html/, weight: 3 },
  { type: "sql", pattern: /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im, weight: 3 },
  { type: "markdown", pattern: /^#{1,6}\s|^[-*]\s|^\d+\.\s/m, weight: 2 },
  { type: "shell", pattern: /^\$ |^#!/m, weight: 3 },
]

function detectType(content: string): ContentType {
  const scores = new Map<ContentType, number>()
  for (const { type, pattern, weight } of TYPE_PATTERNS) {
    if (pattern.test(content)) {
      scores.set(type, (scores.get(type) || 0) + weight)
    }
  }

  if (scores.size === 0) return "text"

  let bestType: ContentType = "text"
  let bestScore = 0
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }
  return bestType
}

// Language detection patterns
const LANG_PATTERNS: { lang: Language; pattern: RegExp }[] = [
  { lang: "typescript", pattern: /(?:import|export)\s+.*from\s+['"]|:\s*(string|number|boolean|any|void|never)\b/ },
  { lang: "javascript", pattern: /const\s+\w+\s*=\s*(?:require|function|=>)|module\.exports/ },
  { lang: "python", pattern: /def\s+\w+|import\s+\w+|from\s+\w+\s+import|class\s+\w+:/ },
  { lang: "rust", pattern: /fn\s+\w+|let\s+mut\s+\w+|pub\s+(?:fn|struct|enum)|impl\s+\w+/ },
  { lang: "go", pattern: /func\s+\w+|package\s+\w+|import\s+\(/ },
  { lang: "java", pattern: /public\s+class|private\s+void|import\s+java\.|package\s+\w+;/ },
  { lang: "c", pattern: /#include\s+[<"]|int\s+main\s*\(|void\s+\w+\s*\(/ },
  { lang: "cpp", pattern: /#include\s+[<"]|std::|using\s+namespace|class\s+\w+/ },
  { lang: "ruby", pattern: /def\s+\w+|require\s+['"]|class\s+\w+|module\s+\w+/ },
  { lang: "swift", pattern: /import\s+\w+|func\s+\w+|let\s+\w+|var\s+\w+|class\s+\w+/ },
  { lang: "kotlin", pattern: /fun\s+\w+|val\s+\w+|var\s+\w+|class\s+\w+|import\s+\w+/ },
  { lang: "scala", pattern: /def\s+\w+|val\s+\w+|var\s+\w+|object\s+\w+|trait\s+\w+/ },
  { lang: "php", pattern: /<\?php|function\s+\w+|class\s+\w+|\$\w+/ },
  { lang: "csharp", pattern: /using\s+\w+|namespace\s+\w+|public\s+class|private\s+void/ },
]

// Analyze content type and language
export function analyzeContent(content: string, filePath?: string): ContentAnalysis {
  const lines = content.split("\n")
  const size = content.length
  const lineCount = lines.length

  // Detect language from file path
  let language: Language = "unknown"
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase() || ""
    language = EXT_TO_LANG[ext] || "unknown"
  }

  // Detect content type using scored matching
  let type = detectType(content)

  // If type is code, try to detect language
  if (type === "text" && language === "unknown") {
    for (const { lang, pattern } of LANG_PATTERNS) {
      if (pattern.test(content)) {
        language = lang
        type = "code"
        break
      }
    }
  }

  // Check if content is structured (JSON, XML, YAML, etc.)
  const isStructured = ["json", "xml", "yaml", "csv"].includes(type)

  // Check for errors
  const hasErrors = /error|fail|panic|fatal|exception|unauthorized/i.test(content)

  // Check for repetitive content
  const isRepetitive = detectRepetitive(lines)

  // Determine compression candidates
  const compressionCandidates = determineCompressionCandidates(type, language, hasErrors, isRepetitive)

  return {
    type,
    language,
    size,
    lines: lineCount,
    isStructured,
    hasErrors,
    isRepetitive,
    compressionCandidates,
  }
}

// Detect repetitive content
function detectRepetitive(lines: string[]): boolean {
  if (lines.length < 10) return false

  const uniqueLines = new Set(lines.map((l) => l.trim()))
  const ratio = uniqueLines.size / lines.length

  return ratio < 0.5 // Less than 50% unique lines = repetitive
}

// Determine which compression stages to apply
function determineCompressionCandidates(
  type: ContentType,
  language: Language,
  hasErrors: boolean,
  isRepetitive: boolean,
): string[] {
  const candidates: string[] = []

  // Always apply: secret redaction, whitespace cleanup
  candidates.push("secrets", "whitespace")

  // Type-specific stages
  switch (type) {
    case "code":
      candidates.push("skeleton")
      break
    case "json":
      candidates.push("json-sample", "key-alias")
      break
    case "diff":
      candidates.push("diff-fold")
      break
    case "log":
      candidates.push("log-fold")
      break
  }

  // Content-specific stages
  if (isRepetitive) {
    candidates.push("dedup")
  }

  return candidates
}

// Get compression pipeline for content
export function getCompressionPipeline(analysis: ContentAnalysis): string[] {
  return analysis.compressionCandidates
}
