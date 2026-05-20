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

interface MetricsResult {
  tokensSaved: number
  toolCalls: number
}

// Read only metrics from the current session (after sessionStart)
async function readCurrentSessionMetrics(sessionStart: number): Promise<MetricsResult> {
  try {
    const file = Bun.file(METRICS_FILE)
    if (!(await file.exists())) return { tokensSaved: 0, toolCalls: 0 }
    const text = await file.text()
    const lines = text.trim().split("\n").filter((l) => l.trim())
    if (lines.length === 0) return { tokensSaved: 0, toolCalls: 0 }

    let totalSaved = 0
    let totalCalls = 0
    const sessionStartMs = sessionStart

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        // Only count entries from current session
        const entryTs = new Date(entry.ts).getTime()
        if (entryTs >= sessionStartMs) {
          totalSaved += entry.before_tokens - entry.after_tokens
          totalCalls++
        }
      } catch {
        // skip malformed
      }
    }

    return { tokensSaved: totalSaved, toolCalls: totalCalls }
  } catch {
    return { tokensSaved: 0, toolCalls: 0 }
  }
}

function StatusBarWidget(props: { theme: TuiTheme; sessionStart: () => number | null }) {
  const [display, setDisplay] = createSignal("")

  let metricsInterval: ReturnType<typeof setInterval>

  async function loadMetrics() {
    const start = props.sessionStart()
    if (!start) {
      setDisplay(" opentoken")
      return
    }

    const metrics = await readCurrentSessionMetrics(start)
    const time = formatTime(new Date())
    const duration = formatDuration(Date.now() - start)

    // Compression level emoji
    const levelEmoji = "🌸"

    let text: string
    if (metrics.tokensSaved > 0) {
      text = `${levelEmoji} opentoken  saved ${formatTokens(metrics.tokensSaved)} tokens  ${metrics.toolCalls} calls  ${duration}  ${time}`
    } else {
      text = `${levelEmoji} opentoken  ready  ${duration}  ${time}`
    }

    setDisplay(text)
  }

  onMount(() => {
    loadMetrics()
    metricsInterval = setInterval(loadMetrics, 3000)
  })

  onCleanup(() => {
    clearInterval(metricsInterval)
  })

  return (
    <text fg={props.theme.current.text}>{display()}</text>
  )
}

const plugin: TuiPlugin = async (api, _options, _meta) => {
  const [sessionStart, setSessionStart] = createSignal<number | null>(null)

  api.event.on("session.created", () => {
    setSessionStart(Date.now())
  })

  api.event.on("session.deleted", () => {
    setSessionStart(null)
  })

  api.slots.register({
    order: 50,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, _props: { session_id: string }) {
        return <StatusBarWidget theme={ctx.theme} sessionStart={sessionStart} />
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
