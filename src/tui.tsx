/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiSlotContext, TuiTheme } from "@opencode-ai/plugin/tui"
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

function StatusBarWidget(props: { theme: TuiTheme }) {
  const [display, setDisplay] = createSignal("")
  const sessionStart = Date.now()

  let metricsInterval: ReturnType<typeof setInterval>

  async function loadMetrics() {
    try {
      const file = Bun.file(METRICS_FILE)
      if (await file.exists()) {
        const text = await file.text()
        const lines = text.trim().split("\n").filter((l) => l.trim())
        // Read last 20 entries for current session
        const recent = lines.slice(-20)
        let totalSaved = 0
        let totalCalls = 0

        for (const line of recent) {
          try {
            const entry = JSON.parse(line)
            totalSaved += (entry.before_tokens || 0) - (entry.after_tokens || 0)
            totalCalls++
          } catch { /* skip */ }
        }

        const time = formatTime(new Date())
        const duration = formatDuration(Date.now() - sessionStart)

        if (totalSaved > 0) {
          setDisplay(`🌸 opentoken  saved ${formatTokens(totalSaved)} tokens  ${totalCalls} calls  ${duration}  ${time}`)
        } else {
          setDisplay(`🌸 opentoken  ready  ${duration}  ${time}`)
        }
        return
      }
    } catch { /* fall through */ }

    // Fallback
    const time = formatTime(new Date())
    const duration = formatDuration(Date.now() - sessionStart)
    setDisplay(`🌸 opentoken  ready  ${duration}  ${time}`)
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
  api.slots.register({
    order: 50,
    slots: {
      session_prompt_right(ctx: TuiSlotContext, _props: { session_id: string }) {
        return <StatusBarWidget theme={ctx.theme} />
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
