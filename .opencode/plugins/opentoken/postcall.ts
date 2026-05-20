// Post-call processors — clean/compress tool results AFTER execution
// #15 XML/Markdown block stripping (<antThinking>, <thinking>)
// #16 Binary detection (NUL byte scan, suppress)
// #17 Output suppression (>500KB → block entirely)
// #20 Key aliasing (replace long JSON keys with short aliases)
// #21 Whitespace/null cleanup (strip redundant fields, timestamps)

const MAX_OUTPUT_BYTES = 500 * 1024 // 500KB — block entirely

// #15: Strip reasoning/thinking blocks
const THINKING_BLOCKS: RegExp[] = [
  /<antThinking>[\s\S]*?<\/antThinking>/g,
  /<thinking>[\s\S]*?<\/thinking>/g,
  /<reasoning>[\s\S]*?<\/reasoning>/g,
  /<scratchpad>[\s\S]*?<\/scratchpad>/g,
  /<inner_monologue>[\s\S]*?<\/inner_monologue>/g,
]

export function stripThinkingBlocks(text: string): string {
  let result = text
  for (const pattern of THINKING_BLOCKS) {
    result = result.replace(pattern, "")
  }
  // Clean up double newlines left behind
  return result.replace(/\n{3,}/g, "\n\n").trim()
}

// #16: Binary detection via NUL byte scan
function isBinaryOutput(text: string): boolean {
  // Check first 8KB for NUL bytes
  const sample = text.slice(0, 8192)
  const nulCount = (sample.match(/\0/g) || []).length
  return nulCount > 3 // More than 3 NUL bytes = binary
}

export function detectAndHandleBinary(text: string): { binary: boolean; result: string } {
  if (isBinaryOutput(text)) {
    // Try to extract any text content
    const textContent = text.replace(/[\0-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, "")
    if (textContent.trim().length < text.length * 0.1) {
      return { binary: true, result: "[Binary output suppressed — no text content]" }
    }
    return { binary: true, result: `[Binary output — ${text.length} bytes, ${Math.round((textContent.length / text.length) * 100)}% text]` }
  }
  return { binary: false, result: text }
}

// #17: Output suppression — block entirely if too large
export function suppressOversized(text: string): { suppressed: boolean; result: string } {
  if (text.length > MAX_OUTPUT_BYTES) {
    return {
      suppressed: true,
      result: `[Output suppressed: ${Math.round(text.length / 1024)}KB exceeds ${MAX_OUTPUT_BYTES / 1024}KB limit — use targeted queries instead]`,
    }
  }
  return { suppressed: false, result: text }
}

// #20: Key aliasing — replace long JSON keys with short aliases
const LONG_KEY_MAP: Record<string, string> = {
  description: "desc",
  documentation: "docs",
  configuration: "config",
  authentication: "auth",
  authorization: "authz",
  implementation: "impl",
  information: "info",
  environment: "env",
  development: "dev",
  production: "prod",
  directory: "dir",
  directories: "dirs",
  parameters: "params",
  arguments: "args",
  properties: "props",
  attributes: "attrs",
  references: "refs",
  definitions: "defs",
  declarations: "decls",
  expressions: "exprs",
  statements: "stmts",
  conditions: "conds",
  iterations: "iters",
  algorithms: "algos",
  optimizations: "opts",
  performance: "perf",
  infrastructure: "infra",
  architecture: "arch",
  repository: "repo",
  repositories: "repos",
  installation: "install",
  dependency: "dep",
  dependencies: "deps",
  extension: "ext",
  extensions: "exts",
  template: "tmpl",
  templates: "tmpls",
  context: "ctx",
  content: "cnt",
  standard: "std",
  specification: "spec",
  specifications: "specs",
  additional: "addl",
  available: "avail",
  previous: "prev",
  following: "foll",
  current: "curr",
  internal: "int",
  external: "ext",
  output: "out",
  outputs: "outs",
  input: "in",
  inputs: "ins",
  message: "msg",
  messages: "msgs",
  request: "req",
  requests: "reqs",
  response: "res",
  responses: "resps",
  error: "err",
  errors: "errs",
  warning: "warn",
  warnings: "warns",
  successful: "ok",
  successfully: "ok",
  temporary: "tmp",
  package: "pkg",
  packages: "pkgs",
  module: "mod",
  modules: "mods",
  interface: "iface",
  interfaces: "ifaces",
  callback: "cb",
  callbacks: "cbs",
  promise: "prom",
  promises: "proms",
  asynchronous: "async",
  synchronous: "sync",
  container: "ctr",
  containers: "ctrs",
  controller: "ctrl",
  controllers: "ctrls",
  service: "svc",
  services: "svcs",
  middleware: "mw",
  handler: "hdlr",
  handlers: "hdlrs",
  component: "comp",
  components: "comps",
  function: "fn",
  functions: "fns",
  variable: "var",
  variables: "vars",
  parameter: "param",
  number: "num",
  numbers: "nums",
  string: "str",
  strings: "strs",
  boolean: "bool",
  object: "obj",
  objects: "objs",
  element: "el",
  elements: "els",
  identifier: "id",
  identifiers: "ids",
  timestamp: "ts",
  timestamps: "tss",
  created_at: "created",
  updated_at: "updated",
  deleted_at: "deleted",
  modified_at: "modified",
  generated_at: "generated",
  published_at: "published",
  expires_at: "expires",
  started_at: "started",
  finished_at: "finished",
  completed_at: "completed",
}

export function aliasJsonKeys(text: string): string {
  if (!text.includes("{") || !text.includes("}")) return text

  // Only match keys that appear after { or , (structural JSON positions)
  // Uses lookbehind to avoid matching inside string values
  return text.replace(/(?<=[{,]\s*)"([a-zA-Z_]\w*)"\s*:/g, (match, key) => {
    const alias = LONG_KEY_MAP[key]
    if (alias) {
      return `"${alias}":`
    }
    return match
  })
}

// #21: Whitespace/null cleanup — strip redundant fields
const NULLISH_PATTERNS: RegExp[] = [
  /,\s*"[^"]*"\s*:\s*null/g,
  /,\s*"[^"]*"\s*:\s*""/g,
  /,\s*"[^"]*"\s*:\s*\[\s*\]/g,
  /,\s*"[^"]*"\s*:\s*\{\s*\}/g,
]

const TIMESTAMP_PATTERNS: RegExp[] = [
  /,\s*"(created_at|updated_at|deleted_at|modified_at|timestamp|ts|date|time|datetime|createdOn|updatedOn|createdAt|updatedAt)"\s*:\s*"[^"]*"/g,
  /,\s*"(created_at|updated_at|deleted_at|modified_at|timestamp|ts|date|time|datetime|createdOn|updatedOn|createdAt|updatedAt)"\s*:\s*\d+/g,
]

const REDUNDANT_PATTERNS: RegExp[] = [
  /,\s*"(hash|checksum|signature|digest)"\s*:\s*"[a-f0-9]{20,}"/g,
  /,\s*"(_links|_embedded|_meta|pagination|page_info)"\s*:\s*\{[^}]*\}/g,
]

export function cleanWhitespaceAndNulls(text: string): string {
  if (!text.includes("{") || !text.includes("}")) return text

  let result = text

  // Strip null/empty values
  for (const pattern of NULLISH_PATTERNS) {
    result = result.replace(pattern, "")
  }

  // Strip timestamps (saves tokens, usually not needed for coding)
  for (const pattern of TIMESTAMP_PATTERNS) {
    result = result.replace(pattern, "")
  }

  // Strip redundant fields (IDs, hashes, links, versions, types)
  for (const pattern of REDUNDANT_PATTERNS) {
    result = result.replace(pattern, "")
  }

  // Clean up trailing commas, double commas, and extra whitespace
  result = result.replace(/,(\s*,)+/g, ",")
  result = result.replace(/,\s*}/g, "}")
  result = result.replace(/,\s*]/g, "]")
  result = result.replace(/\{\s*,/g, "{")
  result = result.replace(/\[\s*,/g, "[")

  return result
}

// Main post-call processor pipeline
export function postCallProcess(text: string): string {
  let result = text

  // #17: Block entirely if too large
  const suppressed = suppressOversized(result)
  if (suppressed.suppressed) return suppressed.result

  // #16: Binary detection
  const binary = detectAndHandleBinary(result)
  if (binary.binary) return binary.result

  // #15: Strip thinking blocks
  result = stripThinkingBlocks(result)

  // #21: Whitespace/null cleanup (before key aliasing)
  result = cleanWhitespaceAndNulls(result)

  // #20: Key aliasing
  result = aliasJsonKeys(result)

  return result
}
