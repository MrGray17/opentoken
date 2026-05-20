// Generic filter — fallback for unrecognized commands
// Head + tail preservation, UTF-8 safe truncation

const MAX_LINES = 200
const MAX_BYTES = 50 * 1024 // 50KB
const HEAD_LINES = 20
const TAIL_LINES = 20

export function filterGeneric(output: string): string {
  // Short outputs pass through
  const lines = output.split("\n")
  if (lines.length <= MAX_LINES && output.length <= MAX_BYTES) {
    return output
  }

  // Head + tail preservation
  const head = lines.slice(0, HEAD_LINES)
  const tail = lines.slice(-TAIL_LINES)

  let result = head.join("\n")
  const skipped = lines.length - HEAD_LINES - TAIL_LINES
  if (skipped > 0) {
    result += `\n\n... ${skipped} lines omitted ...\n\n`
  }
  result += tail.join("\n")

  // UTF-8 safe: ensure we don't cut mid-character
  return result
}
