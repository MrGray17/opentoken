// Fast token estimation — adapts ratio based on content type
// Code: ~1 token per 2.5 chars (0.4), Text: ~1 token per 4 chars (0.25)

export function estimateTokens(text: string): number {
	if (!text) return 0;

	const codeRatio =
		(text.match(/[{}();[\]<>=+\-*/&|^~!@#$%]/g) || []).length / text.length;
	const ratio = codeRatio > 0.15 ? 0.4 : 0.25;

	return Math.ceil(text.length * ratio);
}
