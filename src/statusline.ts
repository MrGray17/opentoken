// Cute aesthetic status line — shows token savings in conversation
// Injected after filtered outputs when savings are significant
// Session-keyed to prevent cross-session counter corruption

import { SessionStore } from "./utils/session-store";

interface StatusLine {
	text: string;
	tokens: number;
}

interface StatusLineState {
	emojiIndex: number;
	callCount: number;
}

// Cute emoji sets for variety
const EMOJI_SETS = [
	{ primary: "✨", secondary: "🌸", tertiary: "💫" },
	{ primary: "🌟", secondary: "🍃", tertiary: "✨" },
	{ primary: "💎", secondary: "🌿", tertiary: "🌸" },
	{ primary: "🦋", secondary: "✨", tertiary: "🌙" },
	{ primary: "🌺", secondary: "💫", tertiary: "🍀" },
	{ primary: "🌸", secondary: "✨", tertiary: "🌟" },
	{ primary: "🍃", secondary: "💎", tertiary: "🌸" },
	{ primary: "🌙", secondary: "🦋", tertiary: "✨" },
];

function createStatusLineState(): StatusLineState {
	return { emojiIndex: 0, callCount: 0 };
}

const store = new SessionStore<StatusLineState>();

function getState(sessionID: string): StatusLineState {
	return store.get(sessionID, createStatusLineState);
}

function getEmojis(state: StatusLineState) {
	const set = EMOJI_SETS[state.emojiIndex % EMOJI_SETS.length];
	state.emojiIndex++;
	return set;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
	return `${tokens}`;
}

// Cute messages based on savings level
function getCuteMessage(
	state: StatusLineState,
	savedPct: number,
	savedTokens: number,
	sessionTotal: number,
): string {
	const emojis = getEmojis(state);

	if (savedPct >= 90) {
		return `${emojis.primary} opentoken saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — session total: ${formatTokens(sessionTotal)}`;
	}
	if (savedPct >= 70) {
		return `${emojis.primary}${emojis.secondary} saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`;
	}
	if (savedPct >= 50) {
		return `${emojis.primary} trimmed ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`;
	}
	if (savedPct >= 30) {
		return `${emojis.secondary} saved ${formatTokens(savedTokens)} tokens (${savedPct}%) — total: ${formatTokens(sessionTotal)}`;
	}
	return `${emojis.tertiary} saved ${formatTokens(savedTokens)} tokens — total: ${formatTokens(sessionTotal)}`;
}

// Generate status line
export function generateStatusLine(
	sessionID: string,
	savedTokens: number,
	totalBefore: number,
	sessionTotal: number,
): StatusLine | null {
	const state = getState(sessionID);
	state.callCount++;

	// Only show every 3rd call to avoid spam
	if (state.callCount % 3 !== 0) return null;

	// Only show if saved > 100 tokens
	if (savedTokens < 100) return null;

	const savedPct =
		totalBefore > 0 ? Math.round((savedTokens / totalBefore) * 100) : 0;

	return {
		text: `\n\n${getCuteMessage(state, savedPct, savedTokens, sessionTotal)}`,
		tokens: 15, // Approximate token cost of the status line itself
	};
}

// Generate session summary status line
export function generateSessionSummary(
	sessionID: string,
	sessionTotal: number,
	toolCalls: number,
): string {
	const state = getState(sessionID);
	const emojis = getEmojis(state);
	const avgSaved = toolCalls > 0 ? Math.round(sessionTotal / toolCalls) : 0;

	return `${emojis.primary}${emojis.secondary}${emojis.tertiary} opentoken session summary: saved ${formatTokens(sessionTotal)} tokens across ${toolCalls} calls (avg ${formatTokens(avgSaved)}/call)`;
}

// Reset status line state (new session)
export function resetStatusLine(sessionID: string): void {
	store.reset(sessionID, createStatusLineState);
}
