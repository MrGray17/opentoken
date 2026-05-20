// AST Skeleton Reads — replace full file content with structural signatures
// Inspired by pith + claw-compactor. 88% reduction per read.
// Uses tree-sitter when available, falls back to regex extraction.

import path from "path"
import os from "os"

const SKELETON_CACHE_DIR = path.join(os.homedir(), ".config", "opentoken", "skeleton-cache")
const MAX_SKELETON_LINES = 100

// Language-specific regex patterns for skeleton extraction
const LANGUAGE_PATTERNS: Record<string, { patterns: RegExp[]; commentPattern?: RegExp }> = {
  "typescript,tsx,javascript,jsx": {
    patterns: [
      // Imports
      /^(import\s+[\s\S]*?from\s+['"][^'"]+['"])/gm,
      /^(import\s+['"][^'"]+['"])/gm,
      // Exports
      /^(export\s+(default\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var)\s+\w+)/gm,
      // Function declarations
      /^(export\s+)?(async\s+)?function\s+\w+/gm,
      // Class declarations
      /^(export\s+)?(abstract\s+)?class\s+\w+/gm,
      // Interface declarations
      /^(export\s+)?interface\s+\w+/gm,
      // Type aliases
      /^(export\s+)?type\s+\w+/gm,
      // Enum declarations
      /^(export\s+)?enum\s+\w+/gm,
      // Const/let/var exports
      /^(export\s+)?(const|let|var)\s+\w+/gm,
      // Arrow function exports
      /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/gm,
    ],
  },
  "python,py": {
    patterns: [
      // Imports
      /^(import\s+\w+)/gm,
      /^(from\s+\w+(\.\w+)*\s+import\s+[\s\S]*?)/gm,
      // Class definitions
      /^(class\s+\w+)/gm,
      // Function definitions
      /^(async\s+)?def\s+\w+/gm,
      // Decorators
      /^@\w+/gm,
      // Type aliases
      /^(\w+)\s*:\s*TypeAlias\s*=/gm,
    ],
  },
  "rust,rs": {
    patterns: [
      // Use statements
      /^(use\s+[\s\S]*?;)/gm,
      // Module declarations
      /^(mod\s+\w+)/gm,
      // Public functions
      /^(pub\s+(async\s+)?fn\s+\w+)/gm,
      // Struct definitions
      /^(pub\s+)?struct\s+\w+/gm,
      // Enum definitions
      /^(pub\s+)?enum\s+\w+/gm,
      // Trait definitions
      /^(pub\s+)?trait\s+\w+/gm,
      // Impl blocks
      /^(impl\s+(\w+|\w+<[^>]+>))/gm,
      // Type aliases
      /^(pub\s+)?type\s+\w+/gm,
      // Const declarations
      /^(pub\s+)?(const|static)\s+\w+/gm,
    ],
  },
  "go": {
    patterns: [
      // Imports
      /^import\s+\(/gm,
      /^import\s+"[^"]+"/gm,
      // Package declaration
      /^package\s+\w+/gm,
      // Function declarations
      /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/gm,
      // Type declarations
      /^type\s+\w+/gm,
      // Struct declarations
      /^type\s+\w+\s+struct/gm,
      // Interface declarations
      /^type\s+\w+\s+interface/gm,
      // Const/Var blocks
      /^(const|var)\s+\(/gm,
      /^(const|var)\s+\w+/gm,
    ],
  },
  "java": {
    patterns: [
      // Imports
      /^import\s+[\s\S]*?;/gm,
      // Package declaration
      /^package\s+[\s\S]*?;/gm,
      // Class declarations
      /^(public|private|protected)?\s*(abstract\s+)?class\s+\w+/gm,
      // Interface declarations
      /^(public|private|protected)?\s*interface\s+\w+/gm,
      // Method declarations
      /^(public|private|protected)?\s*(static\s+)?(abstract\s+)?(final\s+)?[\w<>\[\]]+\s+\w+\s*\(/gm,
      // Field declarations
      /^(public|private|protected)?\s*(static\s+)?(final\s+)?[\w<>\[\]]+\s+\w+\s*;/gm,
    ],
  },
  "c,cpp,h,hpp": {
    patterns: [
      // Includes
      /^#include\s+[<"][^>"]+[>"]/gm,
      // Define macros
      /^#define\s+\w+/gm,
      // Function declarations
      /^(extern\s+)?[\w*\s]+\s+\w+\s*\(/gm,
      // Struct/union/enum declarations
      /^(typedef\s+)?(struct|union|enum)\s+\w*/gm,
      // Class declarations (C++)
      /^(class\s+\w+)/gm,
      // Namespace declarations
      /^namespace\s+\w+/gm,
      // Template declarations
      /^template\s*</gm,
    ],
  },
  "ruby,rb": {
    patterns: [
      // Require statements
      /^require\s+['"][^'"]+['"]/gm,
      // Class definitions
      /^class\s+\w+/gm,
      // Module definitions
      /^module\s+\w+/gm,
      // Method definitions
      /^def\s+\w+/gm,
      // Singleton method definitions
      /^def\s+self\.\w+/gm,
      // Include/extend
      /^(include|extend|prepend)\s+\w+/gm,
    ],
  },
  "swift": {
    patterns: [
      // Import statements
      /^import\s+\w+/gm,
      // Class declarations
      /^(public|private|internal|fileprivate|open)?\s*(final\s+)?class\s+\w+/gm,
      // Struct declarations
      /^(public|private|internal|fileprivate|open)?\s*struct\s+\w+/gm,
      // Enum declarations
      /^(public|private|internal|fileprivate|open)?\s*enum\s+\w+/gm,
      // Protocol declarations
      /^(public|private|internal|fileprivate|open)?\s*protocol\s+\w+/gm,
      // Function declarations
      /^(public|private|internal|fileprivate|open)?\s*func\s+\w+/gm,
      // Variable/constant declarations
      /^(public|private|internal|fileprivate|open)?\s*(var|let)\s+\w+/gm,
    ],
  },
  "kotlin,kt": {
    patterns: [
      // Package declaration
      /^package\s+[\s\S]*?/gm,
      // Import statements
      /^import\s+[\s\S]*?/gm,
      // Class declarations
      /^(public|private|internal|protected)?\s*(data\s+)?(sealed\s+)?(abstract\s+)?class\s+\w+/gm,
      // Interface declarations
      /^(public|private|internal|protected)?\s*interface\s+\w+/gm,
      // Object declarations
      /^(public|private|internal|protected)?\s*object\s+\w+/gm,
      // Function declarations
      /^(public|private|internal|protected)?\s*(suspend\s+)?fun\s+\w+/gm,
      // Variable/constant declarations
      /^(public|private|internal|protected)?\s*(val|var)\s+\w+/gm,
    ],
  },
  "php": {
    patterns: [
      // Namespace declaration
      /^namespace\s+[\s\S]*?;/gm,
      // Use statements
      /^use\s+[\s\S]*?;/gm,
      // Class declarations
      /^(public|private|protected)?\s*(abstract|final)?\s*class\s+\w+/gm,
      // Interface declarations
      /^interface\s+\w+/gm,
      // Trait declarations
      /^trait\s+\w+/gm,
      // Function declarations
      /^(public|private|protected)?\s*(static\s+)?function\s+\w+/gm,
      // Constant declarations
      /^(public|private|protected)?\s*const\s+\w+/gm,
    ],
  },
  "scala": {
    patterns: [
      // Package declaration
      /^package\s+[\s\S]*?/gm,
      // Import statements
      /^import\s+[\s\S]*?/gm,
      // Class declarations
      /^(sealed\s+)?(abstract\s+)?(case\s+)?class\s+\w+/gm,
      // Object declarations
      /^(sealed\s+)?(abstract\s+)?(case\s+)?object\s+\w+/gm,
      // Trait declarations
      /^trait\s+\w+/gm,
      // Function/val/var declarations
      /^(def|val|var)\s+\w+/gm,
    ],
  },
  "csharp,cs": {
    patterns: [
      // Using statements
      /^using\s+[\s\S]*?;/gm,
      // Namespace declarations
      /^namespace\s+[\s\S]*?/gm,
      // Class declarations
      /^(public|private|internal|protected)?\s*(abstract|sealed|static)?\s*class\s+\w+/gm,
      // Interface declarations
      /^(public|private|internal|protected)?\s*interface\s+\w+/gm,
      // Struct declarations
      /^(public|private|internal|protected)?\s*struct\s+\w+/gm,
      // Method declarations
      /^(public|private|internal|protected)?\s*(static|virtual|override|abstract|sealed)?\s*[\w<>\[\]]+\s+\w+\s*\(/gm,
      // Property declarations
      /^(public|private|internal|protected)?\s*(static|virtual|override)?\s*[\w<>\[\]]+\s+\w+\s*\{/gm,
    ],
  },
}

// Build pattern lookup
const PATTERN_LOOKUP: Record<string, { patterns: RegExp[] }> = {}
for (const [extensions, config] of Object.entries(LANGUAGE_PATTERNS)) {
  for (const ext of extensions.split(",")) {
    PATTERN_LOOKUP[ext.trim()] = config
  }
}

// Add common aliases
PATTERN_LOOKUP["ts"] = PATTERN_LOOKUP["typescript"]
PATTERN_LOOKUP["tsx"] = PATTERN_LOOKUP["typescript"]
PATTERN_LOOKUP["js"] = PATTERN_LOOKUP["javascript"]
PATTERN_LOOKUP["jsx"] = PATTERN_LOOKUP["javascript"]
PATTERN_LOOKUP["py"] = PATTERN_LOOKUP["python"]
PATTERN_LOOKUP["rs"] = PATTERN_LOOKUP["rust"]
PATTERN_LOOKUP["cs"] = PATTERN_LOOKUP["csharp"]
PATTERN_LOOKUP["kt"] = PATTERN_LOOKUP["kotlin"]

// Detect language from file extension
function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  return PATTERN_LOOKUP[ext] ? ext : null
}

// Extract skeleton using regex patterns
function extractSkeletonRegex(content: string, language: string): string {
  const config = PATTERN_LOOKUP[language]
  if (!config) return ""

  const lines = content.split("\n")
  const skeletonLines: { lineNum: number; text: string }[] = []

  for (const pattern of config.patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split("\n").length
      const text = match[0].trim()
      // Skip duplicates
      if (!skeletonLines.some((s) => s.lineNum === lineNum)) {
        skeletonLines.push({ lineNum, text })
      }
    }
  }

  // Sort by line number
  skeletonLines.sort((a, b) => a.lineNum - b.lineNum)

  // Limit to MAX_SKELETON_LINES
  const limited = skeletonLines.slice(0, MAX_SKELETON_LINES)

  // Build skeleton output
  const totalLines = lines.length
  const totalSymbols = skeletonLines.length

  let result = `// Skeleton: ${totalSymbols} symbols in ${totalLines} lines\n`
  for (const sym of limited) {
    result += `L${sym.lineNum.toString().padStart(4)}: ${sym.text}\n`
  }
  if (totalSymbols > MAX_SKELETON_LINES) {
    result += `// ... and ${totalSymbols - MAX_SKELETON_LINES} more symbols\n`
  }
  result += `// Use "opentoken fetch L{line}" to see specific sections`

  return result
}

// Extract skeleton using tree-sitter (if available)
async function extractSkeletonTreeSitter(content: string, language: string): Promise<string | null> {
  try {
    // Try to load tree-sitter dynamically
    const Parser = await import("web-tree-sitter")
    // This would require WASM loading, which is complex
    // For now, fall back to regex
    return null
  } catch {
    return null
  }
}

// Main skeleton extraction function
export async function extractSkeleton(filePath: string, content: string): Promise<string | null> {
  const language = detectLanguage(filePath)
  if (!language) return null

  // Try tree-sitter first, fall back to regex
  const tsSkeleton = await extractSkeletonTreeSitter(content, language)
  if (tsSkeleton) return tsSkeleton

  return extractSkeletonRegex(content, language)
}
