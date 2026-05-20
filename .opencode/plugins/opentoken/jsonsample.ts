// JSON Statistical Sampling — inspired by claw-compactor's Ionizer stage
// For large JSON arrays: discover schema, sample representative subset, preserve errors

interface JsonSchema {
  type: string
  properties: Record<string, { type: string; sample?: unknown }>
  arrayLength: number
  sampledCount: number
}

const MAX_JSON_SAMPLE = 3 // Number of items to sample from large arrays
const MAX_JSON_DEPTH = 3 // Maximum depth for schema discovery

// Discover JSON schema from an array
function discoverSchema(items: unknown[], maxDepth = MAX_JSON_DEPTH): JsonSchema {
  if (items.length === 0) {
    return { type: "array", properties: {}, arrayLength: 0, sampledCount: 0 }
  }

  const first = items[0]
  const properties: Record<string, { type: string; sample?: unknown }> = {}

  if (typeof first === "object" && first !== null && !Array.isArray(first)) {
    const obj = first as Record<string, unknown>
    for (const [key, value] of Object.entries(obj)) {
      properties[key] = {
        type: Array.isArray(value) ? "array" : typeof value,
        sample: typeof value === "object" ? undefined : value,
      }
    }
  }

  return {
    type: "array",
    properties,
    arrayLength: items.length,
    sampledCount: Math.min(MAX_JSON_SAMPLE, items.length),
  }
}

// Detect if content is a JSON array
function isJsonArray(content: string): unknown[] | null {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length > MAX_JSON_SAMPLE) {
      return parsed
    }
  } catch {
    // Not valid JSON
  }
  return null
}

// Detect if content is a JSON object with large arrays
function findLargeArraysInObject(content: string): Record<string, unknown[]> | null {
  try {
    const parsed = JSON.parse(content)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null

    const largeArrays: Record<string, unknown[]> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > MAX_JSON_SAMPLE) {
        largeArrays[key] = value
      }
    }
    return Object.keys(largeArrays).length > 0 ? largeArrays : null
  } catch {
    return null
  }
}

// Sample items from an array, preserving error entries
function sampleArray(items: unknown[], maxSample = MAX_JSON_SAMPLE): {
  sampled: unknown[]
  schema: JsonSchema
  preserved: unknown[]
} {
  const schema = discoverSchema(items)
  const sampled: unknown[] = []
  const preserved: unknown[] = []

  // First pass: preserve error entries
  for (const item of items) {
    if (isErrorEntry(item)) {
      preserved.push(item)
    }
  }

  // Second pass: sample non-error entries
  const nonErrorItems = items.filter((item) => !isErrorEntry(item))
  const sampleSize = Math.min(maxSample, nonErrorItems.length)

  // Take first, middle, and last items for representative sampling
  if (sampleSize >= 1) sampled.push(nonErrorItems[0])
  if (sampleSize >= 2 && nonErrorItems.length > 2) {
    sampled.push(nonErrorItems[Math.floor(nonErrorItems.length / 2)])
  }
  if (sampleSize >= 3 && nonErrorItems.length > 3) {
    sampled.push(nonErrorItems[nonErrorItems.length - 1])
  }

  return { sampled, schema, preserved }
}

// Detect if an entry looks like an error
function isErrorEntry(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false
  const obj = item as Record<string, unknown>

  // Check for error indicators
  const errorKeys = ["error", "errors", "message", "status", "code", "statusCode"]
  for (const key of errorKeys) {
    const value = obj[key]
    if (typeof value === "string" && /error|fail|exception|invalid|unauthorized/i.test(value)) {
      return true
    }
    if (typeof value === "number" && value >= 400) {
      return true
    }
  }

  return false
}

// Format schema summary
function formatSchemaSummary(schema: JsonSchema): string {
  const props = Object.entries(schema.properties)
    .map(([key, info]) => `${key}: ${info.type}`)
    .join(", ")

  return `schema: { ${props} }`
}

// Main JSON sampling function
export function sampleJson(content: string): { result: string; sampled: boolean } {
  // Check for top-level JSON array
  const array = isJsonArray(content)
  if (array) {
    const { sampled, schema, preserved } = sampleArray(array)

    let result = `[${sampled.length} sampled from ${schema.arrayLength} items, ${preserved.length} errors preserved]\n`
    result += `[${formatSchemaSummary(schema)}]\n\n`

    // Show sampled items
    for (let i = 0; i < sampled.length; i++) {
      result += `// Sample ${i + 1}:\n${JSON.stringify(sampled[i], null, 2)}\n\n`
    }

    // Show preserved error entries
    if (preserved.length > 0) {
      result += `// Error entries (${preserved.length}):\n`
      for (const entry of preserved.slice(0, 5)) {
        result += `${JSON.stringify(entry, null, 2)}\n\n`
      }
      if (preserved.length > 5) {
        result += `// ... and ${preserved.length - 5} more errors\n`
      }
    }

    result += `// ${schema.arrayLength - sampled.length - preserved.length} items omitted (use "opentoken json-fetch" to retrieve)`

    return { result, sampled: true }
  }

  // Check for JSON object with large arrays
  const largeArrays = findLargeArraysInObject(content)
  if (largeArrays) {
    let result = content
    let modified = false

    for (const [key, items] of Object.entries(largeArrays)) {
      const { sampled, schema, preserved } = sampleArray(items)

      // Replace the large array with sampled version
      const arrayStr = JSON.stringify(items)
      const sampledStr = JSON.stringify(sampled)
      const summary = `/* ${items.length} items → ${sampled.length} sampled, ${preserved.length} errors [${formatSchemaSummary(schema)}] */`

      result = result.replace(arrayStr, `${summary}\n${sampledStr}`)
      modified = true
    }

    if (modified) {
      return { result, sampled: true }
    }
  }

  return { result: content, sampled: false }
}
