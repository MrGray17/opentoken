/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */

import type {
	TuiPlugin,
	TuiSlotContext,
	TuiTheme,
} from "@opencode-ai/plugin/tui";
import { createSignal, onCleanup, onMount } from "solid-js";

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusBarWidget(props: { theme: TuiTheme }) {
	const [display, setDisplay] = createSignal(formatTime(new Date()));

	onMount(() => {
		const id = setInterval(() => setDisplay(formatTime(new Date())), 1000);
		onCleanup(() => clearInterval(id));
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
