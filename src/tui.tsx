/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiSlotContext, TuiTheme } from "@opencode-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import path from "path"
import os from "os"

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken")
const CONFIG_FILE = path.join(METRICS_DIR, "config.json")
const SESSION_FILE = path.join(METRICS_DIR, "session-memory.json")
const SESSION_START_FILE = path.join(METRICS_DIR, "session-start.json")

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1000000).toFixed(1)}M`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function levelEmoji(level: string): string {
  switch (level) {
    case "ceiling": return "🔥"
    case "ultra": return "⚡"
    case "lean": return "🍃"
    default: return "💤"
  }
}

async function isTuiEnabled(): Promise<boolean> {
  try {
    const file = Bun.file(CONFIG_FILE)
    if (await file.exists()) {
      const cfg = JSON.parse(await file.text())
      if (cfg.enableTui === false) return false
    }
  } catch { /* ignore */ }
  return true
}

function StatusBarWidget(props: { theme: TuiTheme }) {
  const [display, setDisplay] = createSignal("")
  let sessionStart = Date.now()
  let metricsInterval: ReturnType<typeof setInterval>

  async function loadMetrics() {
    const enabled = await isTuiEnabled()
    if (!enabled) {
      setDisplay("")
      return
    }

    // Detect session start from session-start.json to track duration
    try {
      const startFile = Bun.file(SESSION_START_FILE)
      if (await startFile.exists()) {
        const data = JSON.parse(await startFile.text())
        if (data.sessionStart) sessionStart = data.sessionStart
      }
    } catch { /* ignore */ }

    const time = formatTime(new Date())
    const duration = formatDuration(Date.now() - sessionStart)

    // Read per-session tracker — reset on each new session
    try {
      const sessionFile = Bun.file(SESSION_FILE)
      if (await sessionFile.exists()) {
        const data = JSON.parse(await sessionFile.text())
        const tokensSaved = data.tokensSaved ?? 0
        const compressionLevel = data.compressionLevel ?? "off"
        const emoji = levelEmoji(compressionLevel)

        // Staleness check: if file timestamp is older than session start,
        // the data is from a previous session — don't display it
        const fileTs = data.timestamp
        if (fileTs && sessionStart && fileTs < sessionStart) {
          setDisplay(`🌸 opentoken ready  ${duration}  ${time}`)
          return
        }

        if (tokensSaved > 0) {
          setDisplay(`${emoji} opentoken saved ${formatTokens(tokensSaved)} tokens  ${duration}  ${time}`)
        } else {
          setDisplay(`🌸 opentoken ready  ${duration}  ${time}`)
        }
        return
      }
    } catch { /* fall through */ }

    setDisplay(`🌸 opentoken ready  ${duration}  ${time}`)
  }



const plugin: TuiPlugin = async (api, _options, _meta) => {
  api.slots.register({
    order: 50,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, _props: { session_id: string }) {
        return <StatusBarWidget theme={ctx.theme} />
      }}})

  api.lifecycle.onDispose(() => {
    // cleanup handled by Solid.js onCleanup
  })
}

const pluginModule: { id: string; tui: TuiPlugin } = {
  id: "opentoken",
  tui: plugin}

export default pluginModule
