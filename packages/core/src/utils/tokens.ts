// Fast token estimation — adapts ratio based on content type
// Code: ~1 token per 2.5 chars (0.4), Text: ~1 token per 4 chars (0.25)

export function estimateTokens(text: string): number {
	if (!text) return 0;

	const chars = text.length;
	const codeRatio =
		(text.match(/[{}();[\]<>=+\-*/&|^~!@#$%]/g) || []).length / chars;
	const baseRatio = codeRatio > 0.15 ? 0.4 : 0.25;

	// LTSC/LZW markers (&diams;N, $N) inflate token count:
	// They are 2 chars but often 2 tokens in BPE,
	// while longer strings may be single tokens
	const markerCount = (text.match(/◆\d+|\$\d+/g) || []).length;
	if (markerCount > 0) {
		const markerChars = markerCount * 2;
		const normalChars = chars - markerChars;
		const markerTokens = markerCount * 2; // 2 chars → ~2 tokens
		const normalTokens = normalChars * baseRatio;
		return Math.ceil(normalTokens + markerTokens);
	}

	return Math.ceil(chars * baseRatio);
}
