import os from "node:os";
import path from "node:path";
import { logger } from "./utils/logger";

// ─── CONFIGURATION ───

export interface OpenTokenConfig {
	maxOutputBytes: number; // Hard limit — reject outputs larger than this
	maxProcessingMs: number; // Timeout per pipeline stage
	safeReadRoot: string; // Only allow reads under this directory
	enableMetrics: boolean; // Track token savings to disk
	enableSymbolIndex: boolean; // Build and query symbol index at startup
	conservativeUseTokens: boolean; // Use token count (slower) vs byte count (faster) for safety check
	// Phase 7 — history compression
	enableHistoryCompression: boolean; // Kill switch for experimental hooks (default false)
	historyCompressionWindow: number; // Messages to keep full-fidelity (default 12)
	enableSessionMemory: boolean; // Cross-session memory persistence (default false)
	enableTui: boolean; // TUI status bar (default true)
	tuiUseEmoji: boolean; // TUI: use emoji vs ASCII (default true)
	allowLockFileReads: boolean; // Allow reading lock files despite minified/generated blocking (default false)
	enableOutputSaving: boolean; // Reduce output tokens via directives, caps, and response compression
}

export const DEFAULT_CONFIG: OpenTokenConfig = {
	maxOutputBytes: 10 * 1024 * 1024, // 10MB hard limit
	maxProcessingMs: 5000, // 5s per stage
	safeReadRoot: "", // Empty = use project directory
	enableMetrics: true,
	enableSymbolIndex: true,
	conservativeUseTokens: false, // Byte count by default (fast)
	enableHistoryCompression: true, // Kill switch — opt-in for experimental hooks
	historyCompressionWindow: 4, // Keep last 4 messages full-fidelity
	enableSessionMemory: false, // Cross-session memory persistence
	enableTui: true, // TUI status bar
	tuiUseEmoji: true, // TUI: use emoji vs ASCII
	allowLockFileReads: false, // Lock files blocked by default
	enableOutputSaving: true,
};

export let config: OpenTokenConfig = DEFAULT_CONFIG;

export function validateConfig(
	raw: Partial<OpenTokenConfig>,
): Partial<OpenTokenConfig> {
	const warnings: string[] = [];
	const validated: Record<string, unknown> = {};

	for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
		const value = (raw as Record<string, unknown>)[key];
		if (value === undefined) {
			validated[key] = defaultValue;
			continue;
		}

		const expectedType = typeof defaultValue;
		const actualType = typeof value;

		if (expectedType === "number") {
			if (actualType !== "number" || Number.isNaN(value as number)) {
				warnings.push(
					`config.${key}: expected number, got ${actualType} — using default (${defaultValue})`,
				);
				validated[key] = defaultValue;
				continue;
			}
			// Range checks
			if (key === "maxOutputBytes" && (value as number) < 1024 * 1024) {
				warnings.push(
					`config.${key}: ${value} is too small (min 1MB) — using default`,
				);
				validated[key] = defaultValue;
				continue;
			}
			if (key === "maxOutputBytes" && (value as number) > 100 * 1024 * 1024) {
				warnings.push(
					`config.${key}: ${value} is too large (max 100MB) — using default`,
				);
				validated[key] = defaultValue;
				continue;
			}
			if (
				key === "maxProcessingMs" &&
				((value as number) < 100 || (value as number) > 30000)
			) {
				warnings.push(
					`config.${key}: ${value}ms out of range (100–30000) — using default`,
				);
				validated[key] = defaultValue;
				continue;
			}
			if (
				key === "historyCompressionWindow" &&
				((value as number) < 1 || (value as number) > 100)
			) {
				warnings.push(
					`config.${key}: ${value} out of range (1–100) — using default`,
				);
				validated[key] = defaultValue;
				continue;
			}
			validated[key] = value;
		} else if (expectedType === "boolean") {
			if (actualType !== "boolean") {
				warnings.push(
					`config.${key}: expected boolean, got ${actualType} — using default (${defaultValue})`,
				);
				validated[key] = defaultValue;
				continue;
			}
			validated[key] = value;
		} else if (expectedType === "string") {
			if (actualType !== "string") {
				warnings.push(
					`config.${key}: expected string, got ${actualType} — using default (${defaultValue})`,
				);
				validated[key] = defaultValue;
				continue;
			}
			validated[key] = value;
		} else {
			validated[key] = value;
		}
	}

	if (warnings.length > 0) {
		console.error(`[OpenToken] Config warnings (${warnings.length}):`);
		for (const w of warnings) console.error(`  - ${w}`);
	}

	// Warn on unknown keys (typo detection)
	const validKeys = new Set(Object.keys(DEFAULT_CONFIG));
	for (const key of Object.keys(raw as Record<string, unknown>)) {
		if (!validKeys.has(key)) {
			console.error(`[OpenToken] Unknown config key "${key}" — ignored`);
		}
	}

	// Type validation per key
	const KEY_TYPES: Record<string, string> = {
		maxOutputBytes: "number",
		maxProcessingMs: "number",
		safeReadRoot: "string",
		enableMetrics: "boolean",
		enableSymbolIndex: "boolean",
		conservativeUseTokens: "boolean",
		enableHistoryCompression: "boolean",
		historyCompressionWindow: "number",
		enableSessionMemory: "boolean",
		enableTui: "boolean",
		tuiUseEmoji: "boolean",
		allowLockFileReads: "boolean",
		enableOutputSaving: "boolean",
	};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const expected = KEY_TYPES[key];
		if (expected && typeof value !== expected) {
			console.error(
				`[OpenToken] Config "${key}" expected ${expected}, got ${typeof value} — using default`,
			);
		}
	}

	return validated as Partial<OpenTokenConfig>;
}

export async function loadConfig(directory: string): Promise<void> {
	try {
		const configPath = path.join(
			os.homedir(),
			".config",
			"opentoken",
			"config.json",
		);
		const file = Bun.file(configPath);
		if (await file.exists()) {
			const raw = JSON.parse(await file.text()) as Partial<OpenTokenConfig>;
			const validated = validateConfig(raw);
			config = { ...DEFAULT_CONFIG, ...validated };
		}
	} catch {
		logger.warn(
			undefined,
			"config.load",
			"Failed to load config file, using defaults",
		);
	}

	// Set safe read root to project directory if not explicitly configured
	if (!config.safeReadRoot) {
		config.safeReadRoot = directory;
	}
}
