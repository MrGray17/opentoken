// Output compression for model responses
// Applied post-generation via experimental.text.complete
// Conservative filter: always returns original if output grew

import { shortenUrls, stripAnsi, stripThinkingBlocks } from "./postcall";

const BOILERPLATE_PATTERNS: RegExp[] = [
	// Start-anchored openings
	/^Sure[!,\s]/i,
	/^Certainly[!,\s]/i,
	/^Of course[!,\s]/i,
	/^Absolutely[!,\s]/i,
	/^Great question[!,\s]/i,
	/^Thanks? (for|you)[!,\s]/i,
	/^Here['']s (the|a|my|what)/i,
	/^Let me (explain|show|help|walk|start|begin)/i,
	/^I['']d be happy to/i,
	/^I['']ll (help|show|walk|start|begin|explain)/i,
	/^To (answer|address|respond|start)/i,
	// End-anchored closings
	/\.\s*(Let me know|Hope this|I hope|Feel free|Don['']t hesitate).*$/i,
	/\.\s*(Happy to help|Glad to help|Let me know if).*$/i,
	/\.\s*(Best|Cheers|Regards|Thanks)[!,\s]*$/i,
	// Restatements
	/^So[,]?\s+(you['']re|you are|in other words|basically|essentially)/i,
	/^In short[,]?\s/i,
	// Filler transitions
	/^Now[,]?\s+(let['']s|we|the|as)/i,
	/^Moving (on|forward)[,!\s]/i,
];

export function getConcisenessDirective(): string {
	return " Be concise. Prefer code over explanation. Omit pleasantries, hedging, restatements, and inline examples. Never explain what code does — show it.";
}

export function getOutputBudget(): number {
	return 2048;
}

export function compressOutput(text: string): string {
	if (!text || text.length < 100) return text;

	const trimmed = text.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return text;

	let result = text;

	// Stage 1: Strip thinking/reasoning blocks
	result = stripThinkingBlocks(result);

	// Stage 2: Strip ANSI escape sequences
	result = stripAnsi(result);

	// Stage 3: Whitespace normalization (inline — avoid cleanWhitespaceAndNulls)
	result = result.replace(/\n{3,}/g, "\n\n");
	result = result.replace(/[ \t]+$/gm, "");

	// Stage 4: Boilerplate elimination
	for (const pattern of BOILERPLATE_PATTERNS) {
		const candidate = result.replace(pattern, "");
		if (candidate.length < result.length) {
			result = candidate;
		}
	}

	// Stage 5: URL shortening
	result = shortenUrls(result);

	// Conservative filter: never return longer text
	return result.length < text.length ? result.trim() : text;
}
