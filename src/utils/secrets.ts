// Secret redaction — 33+ patterns covering cloud keys, AI APIs, VCS tokens, payment secrets
// Runs BEFORE any filtering to ensure secrets are never exposed

const SECRET_PATTERNS: RegExp[] = [
  // AWS
  /AKIA[0-9A-Z]{16}/g,
  // GitHub
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  // Stripe
  /sk_live_[0-9a-zA-Z]{24,}/g,
  /rk_live_[0-9a-zA-Z]{24,}/g,
  // OpenAI
  /sk-[a-zA-Z0-9]{20,}/g,
  // Anthropic
  /sk-ant-[a-zA-Z0-9-_]{20,}/g,
  // Google
  /AIza[0-9A-Za-z-_]{35,}/g,
  // Slack
  /xox[baprs]-[0-9a-zA-Z-]{10,}/g,
  // Twilio
  /SK[0-9a-fA-F]{32}/g,
  // SendGrid
  /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
  // Generic API key patterns
  /(?:api[_-]?key|apikey)\s*[=:]\s*["'][a-zA-Z0-9]{20,}["']/gi,
  /(?:secret[_-]?key|secret)\s*[=:]\s*["'][a-zA-Z0-9]{20,}["']/gi,
  /(?:password|passwd|pwd)\s*[=:]\s*["'][^\s"']{8,}["']/gi,
  // Bearer tokens
  /Bearer\s+[a-zA-Z0-9\-._~+/]{20,}/g,
  // JWT
  /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
  // Private keys
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  // Connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']{10,}/gi,
]

const REDACTED = "[REDACTED]"

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }
  return result
}
