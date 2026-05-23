/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */

import os from "node:os";
import path from "node:path";
import type {
	TuiPlugin,
	TuiSlotContext,
	TuiTheme,
} from "@opencode-ai/plugin/tui";
import { createSignal, onCleanup, onMount } from "solid-js";

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken");
const CONFIG_FILE = path.join(METRICS_DIR, "config.json");
const SESSION_START_FILE = path.join(METRICS_DIR, "session-start.json");
const STATS_SUMMARY_FILE = path.join(METRICS_DIR, "stats-summary.json");

function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
	return `${(n / 1000000).toFixed(1)}M`;
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minute = Math.floor(seconds / 60);
	const hour = Math.floor(minute / 60);
	if (hour > 0) return `${hour}h ${minute % 60}m`;
	if (minute > 0) return `${minute}m ${seconds % 60}s`;
	return `${seconds}s`;
}

function getTerminalWidth(): number {
	return typeof process !== "undefined" && process.stdout
		? process.stdout.columns || 100
		: 100;
}

interface TuiConfig {
	enabled: boolean;
	useEmoji: boolean;
}

async function loadTuiConfig(): Promise<TuiConfig> {
	const defaults: TuiConfig = { enabled: true, useEmoji: true };
	try {
		const f = Bun.file(CONFIG_FILE);
		if (await f.exists()) {
			const cfg = JSON.parse(await f.text());
			if (cfg.enableTui === false) defaults.enabled = false;
			if (cfg.tuiUseEmoji === false) defaults.useEmoji = false;
		}
	} catch {
		/* ignore */
	}
	return defaults;
}

function StatusBarWidget(props: { theme: TuiTheme }) {
	const [display, setDisplay] = createSignal("");
	let sessionStart = Date.now();
	let sessionID: string | undefined;
	let sessionCached = false;
	let useEmoji = true;
	let metricsInterval: ReturnType<typeof setInterval>;

	async function loadMetrics() {
		const cfg = await loadTuiConfig();
		if (!cfg.enabled) {
			setDisplay("");
			return;
		}
		useEmoji = cfg.useEmoji;

		const width = getTerminalWidth();
		const isNarrow = width < 60;
		const isWide = width >= 100;

		// Cache session-start.json on first successful read — never re-read
		if (!sessionCached) {
			try {
				const startFile = Bun.file(SESSION_START_FILE);
				if (await startFile.exists()) {
					const data = JSON.parse(await startFile.text());
					sessionStart = data.sessionStart ?? Date.now();
					sessionID = data.sessionID;
					sessionCached = true;
				}
				return;
			} catch {
				return;
			}
		}

		const time = formatTime(new Date());
		const duration = formatDuration(Date.now() - sessionStart);

		// Read this session's stats from per-session file
		try {
			const summaryPath = sessionID
				? `${STATS_SUMMARY_FILE}.${sessionID}`
				: STATS_SUMMARY_FILE;
			const summaryFile = Bun.file(summaryPath);
			if (await summaryFile.exists()) {
				const data = JSON.parse(await summaryFile.text());
				const tokensSaved = data.session?.totalSavedTokens ?? 0;
				const callCount =
					data.session?.callCount ?? data.session?.toolCalls ?? 0;
				const errorCount = data.session?.errorCount ?? 0;

				const avgPerCall =
					callCount > 0 ? Math.round(tokensSaved / callCount) : 0;

				if (useEmoji) {
					const emoji = tokensSaved > 0 ? "🗜️" : "🌸";
					if (isNarrow) {
						const short = formatTokens(tokensSaved);
						setDisplay(`${emoji} ${short}`);
					} else if (isWide && tokensSaved > 0) {
						const avg = formatTokens(avgPerCall);
						const err = errorCount > 0 ? `  ⚠${errorCount}` : "";
						setDisplay(
							`${emoji} opentoken saved ${formatTokens(tokensSaved)} tok  ${avg}/call${err}  ${duration}  ${time}`,
						);
					} else {
						const tok =
							tokensSaved > 0
								? ` saved ${formatTokens(tokensSaved)} tok`
								: " ready";
						setDisplay(`${emoji} opentoken${tok}  ${duration}  ${time}`);
					}
				} else {
					if (isNarrow) {
						setDisplay(`[OT] ${formatTokens(tokensSaved)}`);
					} else if (isWide && tokensSaved > 0) {
						const err = errorCount > 0 ? ` err:${errorCount}` : "";
						setDisplay(
							`[OPENTOKEN] saved ${formatTokens(tokensSaved)} tok  avg ${formatTokens(avgPerCall)}/call${err}  ${duration}  ${time}`,
						);
					} else {
						const tok =
							tokensSaved > 0
								? ` saved ${formatTokens(tokensSaved)} tok`
								: " ready";
						setDisplay(`[OPENTOKEN]${tok}  ${duration}  ${time}`);
					}
				}
			} else {
				if (isNarrow) {
					setDisplay(useEmoji ? "🌸" : "[OT]");
				} else {
					setDisplay(
						useEmoji
							? `🌸 opentoken ready  ${duration}  ${time}`
							: `[OPENTOKEN] ready  ${duration}  ${time}`,
					);
				}
			}
		} catch {
			if (isNarrow) {
				setDisplay(useEmoji ? "🌸" : "[OT]");
			} else {
				setDisplay(
					useEmoji
						? `🌸 opentoken ready  ${duration}  ${time}`
						: `[OPENTOKEN] ready  ${duration}  ${time}`,
				);
			}
		}
	}

	onMount(() => {
		loadMetrics();
		metricsInterval = setInterval(loadMetrics, 1000);
	});

	onCleanup(() => {
		clearInterval(metricsInterval);
	});

	return <text fg={props.theme.current.text}>{display()}</text>;
}

const plugin: TuiPlugin = async (api, _options, _meta) => {
	api.slots.register({
		order: 50,
		slots: {
			session_prompt_right(
				ctx: TuiSlotContext,
				_props: { session_id: string },
			) {
				return <StatusBarWidget theme={ctx.theme} />;
			},
		},
	});
	api.lifecycle.onDispose(() => {
		// cleanup handled by Solid.js onCleanup
	});
};

const pluginModule: { id: string; tui: TuiPlugin } = {
	id: "opentoken",
	tui: plugin,
};

export default pluginModule;
