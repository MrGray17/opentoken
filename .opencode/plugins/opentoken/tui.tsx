/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiSlotContext, TuiTheme } from "@opencode-ai/plugin/tui"
import type { Event } from "@opencode-ai/sdk/v2"
import { createSignal, onCleanup, onMount } from "solid-js"
import path from "path"
import os from "os"

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken")
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl")

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

interface StatusBarState {
  tokensSaved: number
  toolCalls: number
  compressionLevel: string
  sessionStart: number | null
  isStreaming: boolean
}

// Read metrics.jsonl directly — always fresh, updated after every tool call
async function readSessionMetrics(): Promise<{ tokensSaved: number; toolCalls: number } | null> {
  try {
    const file = Bun.file(METRICS_FILE)
    if (!(await file.exists())) return null
    const text = await file.text()
    const lines = text.trim().split("\n").filter((l) => l.trim())
    // Read last 50 entries to cover the current session
    const recent = lines.slice(-50)
    let totalSaved = 0
    let totalCalls = 0
    for (const line of recent) {
      try {
        const entry = JSON.parse(line)
        totalSaved += (entry.before_tokens || 0) - (entry.after_tokens || 0)
        totalCalls++
      } catch { /* skip malformed lines */ }
    }
    return { tokensSaved: Math.max(0, totalSaved), toolCalls: totalCalls }
  } catch {
    return null
  }
}


function StatusBarWidget(props: { theme: TuiTheme; getMetrics: () => { isStreaming: boolean; isComplete: boolean } | null }) {
  const [time, setTime] = createSignal(formatTime(new Date()))
  const [state, setState] = createSignal<StatusBarState>({
    tokensSaved: 0,
    toolCalls: 0,
    compressionLevel: "off",
    sessionStart: null,
    isStreaming: false,
  })

  let clockInterval: ReturnType<typeof setInterval>
  let metricsInterval: ReturnType<typeof setInterval>

  async function loadMetrics() {
    const metrics = await readSessionMetrics()

    setState((prev) => ({
      ...prev,
      tokensSaved: metrics?.tokensSaved ?? prev.tokensSaved,
      toolCalls: metrics?.toolCalls ?? prev.toolCalls,
    }))
  }

  onMount(() => {
    setState((prev) => ({ ...prev, sessionStart: Date.now() }))

    clockInterval = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)

    loadMetrics()
    metricsInterval = setInterval(loadMetrics, 3000)
  })

  onCleanup(() => {
    clearInterval(clockInterval)
    clearInterval(metricsInterval)
  })

  const s = state()
  const accent = props.theme.current.accent
  const muted = props.theme.current.textMuted
  const text = props.theme.current.text

  const levelEmoji = s.compressionLevel === "ceiling" ? "🔥" : s.compressionLevel === "ultra" ? "⚡" : s.compressionLevel === "lean" ? "🍃" : "💤"
  const duration = s.sessionStart ? formatDuration(Date.now() - s.sessionStart) : ""

  const leftText = s.tokensSaved > 0
    ? `🌸 opentoken ${levelEmoji} saved ${formatTokens(s.tokensSaved)} tokens  ${s.toolCalls} calls`
    : `🌸 opentoken ${levelEmoji} ready`

  const rightText = [duration, formatTime(new Date())].filter(Boolean).join("  ")

  return (
    <text fg={text}>
      <text fg={accent}>{leftText}</text>
      <text fg={muted}>{"   "}</text>
      <text fg={muted}>{rightText}</text>
    </text>
  )
}

const plugin: TuiPlugin = async (api, _options, _meta) => {
  // Track session state for event-driven updates
  const [sessionStart, setSessionStart] = createSignal<number | null>(null)
  const [isStreaming, setIsStreaming] = createSignal(false)

  // Listen to session events for instant updates
  api.event.on("session.status", (event: Extract<Event, { type: "session.status" }>) => {
    const status = event.properties.status
    if (status?.type === "busy") {
      setIsStreaming(true)
    } else if (status?.type === "idle") {
      setIsStreaming(false)
    }
  })

  api.event.on("session.created", () => {
    setSessionStart(Date.now())
  })

  api.event.on("session.deleted", () => {
    setSessionStart(null)
  })

  // Use session_prompt_right slot — proven by opencodeBar reference plugin
  // This renders inline text next to the prompt, more visible than app_bottom
  api.slots.register({
    order: 50,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, _props: { session_id: string }) {
        return (
          <StatusBarWidget
            theme={ctx.theme}
            getMetrics={() => ({ isStreaming: isStreaming(), isComplete: false })}
          />
        )
      },
    },
  })

  api.lifecycle.onDispose(() => {
    // cleanup handled by Solid.js onCleanup
  })
}

const pluginModule: { id: string; tui: TuiPlugin } = {
  id: "opentoken",
  tui: plugin,
}

export default pluginModule
