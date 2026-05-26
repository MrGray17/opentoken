// Personal overrides for Yazid
// This file is gitignored — never committed or pushed.
// Exports a plain config overrides object consumed by loadConfig.
// No module-level side effects. Deterministic.

import type { OpenTokenConfig } from "./config";

const localOverrides: Partial<OpenTokenConfig> = {
	enableHistoryCompression: true,
	historyCompressionWindow: 4,
};

export default localOverrides;
