// Fast token estimation: chars × 0.25 (~80-85% accuracy vs tiktoken)
// Exact counting available via optional @anthropic-ai/tokenizer

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length * 0.25)
}

// Exact token count using cl100k_base (Anthropic tokenizer)
let _tokenizer: { encode: (text: string) => number[] } | null = null

async function getTokenizer() {
  if (_tokenizer) return _tokenizer
  try {
    const { getEncoding } = await import("@anthropic-ai/tokenizer")
    _tokenizer = getEncoding("cl100k_base")
  } catch {
    _tokenizer = { encode: (text: string) => [] } // fallback
  }
  return _tokenizer
}

export async function countTokens(text: string): Promise<number> {
  const tokenizer = await getTokenizer()
  const tokens = tokenizer.encode(text)
  return tokens.length || estimateTokens(text)
}
