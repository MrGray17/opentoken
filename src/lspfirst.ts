// LSP-First Enforcement — inspired by lsp-enforcement-kit
// Block Grep/Glob calls on code symbol patterns, force LSP tools instead
// 80% savings on navigation
// Session-keyed to prevent cross-session state corruption

import { SessionStore } from "./utils/session-store"

interface LSPState {
  navCount: number
  readCount: number
  lastNavTime: number
  project: string
}

function createLSPState(project: string): LSPState {
  return {
    navCount: 0,
    readCount: 0,
    lastNavTime: 0,
    project}
}

const store = new SessionStore<LSPState>()

function getState(sessionID: string, project: string): LSPState {
  return store.get(sessionID, () => createLSPState(project))
}

// Detect if a grep query is looking for a code symbol
function isSymbolQuery(query: string): boolean {
  const patterns = [
    // Class/interface/struct definitions
    /\b(class|interface|struct|enum|trait|impl)\s+[A-Z]\w*\b/,
    // Function/method definitions
    /\b(def|fn|func|function)\s+\w+/,
    // Decorator patterns
    /@\w+/,
    // Fully qualified names: module::Symbol, package.Symbol
    /\w+::[A-Z]\w+/,
    /\w+\.[A-Z]\w+/,
    // Type annotations with generics: List[str], Map<K,V>
    /\w+<\w+.*>/]

  return patterns.some((p) => p.test(query))
}

// Detect if a glob query is looking for a symbol file
function isSymbolGlob(query: string): boolean {
  const patterns = [
    // Looking for specific file patterns
    /\*Service\*/,
    /\*Controller\*/,
    /\*Handler\*/,
    /\*Manager\*/,
    /\*Factory\*/,
    /\*Repository\*/,
    // Looking for test files
    /\*test\*/,
    /\*spec\*/,
    // Looking for config files
    /\*config\*/,
    /\*settings\*/]

  return patterns.some((p) => p.test(query))
}

// Block Grep call if it's a symbol query
export function shouldBlockGrep(query: string): { blocked: boolean; suggestion?: string } {
  if (isSymbolQuery(query)) {
    return {
      blocked: true,
      suggestion: `Use LSP tools instead of grep for symbol "${query}":\n- find_definition("${query}")\n- find_references("${query}")\n- get_hover("${query}")`}
  }

  return { blocked: false }
}

// Block Glob call if it's a symbol glob
export function shouldBlockGlob(query: string): { blocked: boolean; suggestion?: string } {
  if (isSymbolGlob(query)) {
    return {
      blocked: true,
      suggestion: `Use LSP workspace symbols instead of glob for "${query}":\n- find_workspace_symbols("${query}")`}
  }

  return { blocked: false }
}

// Block shell grep/rg/ag commands
export function shouldBlockShellGrep(command: string): { blocked: boolean; suggestion?: string } {
  const grepPatterns = [
    /(?:grep|rg|ag|ack)\s+.*\b(class|interface|struct|enum|def|fn|func|function)\s+\w+/,
    /(?:grep|rg|ag|ack)\s+.*@\w+/,
    /(?:grep|rg|ag|ack)\s+.*\w+::[A-Z]\w+/]

  if (grepPatterns.some((p) => p.test(command))) {
    return {
      blocked: true,
      suggestion: "Use LSP tools instead of shell grep for code symbols"}
  }

  return { blocked: false }
}

// Track LSP usage
export function trackLSPUsage(sessionID: string, project: string, tool: string): void {
  const state = getState(sessionID, project)

  if (tool.includes("find_") || tool.includes("get_")) {
    state.navCount++
  } else if (tool === "read") {
    state.readCount++
  }

  state.lastNavTime = Date.now()
}

// Reset LSP state for new session
export function resetLSPState(sessionID: string, _project: string): void {
  store.delete(sessionID)
}
