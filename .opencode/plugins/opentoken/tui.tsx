/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiSlotContext, TuiTheme } from "@opencode-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import path from "path"
import os from "os"

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken")
const SESSION_FILE = path.join(METRICS_DIR, "session-memory.json")
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl")

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1000000).toFixed(1)}M`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

async function readSessionMemory(): Promise<{ tokensSaved: number; toolCalls: number } | null> {
  try {
    const file = Bun.file(SESSION_FILE)
    if (await file.exists()) {
      const data = JSON.parse(await file.text())
      return { tokensSaved: data.tokensSaved ?? 0, toolCalls: data.toolCalls ?? 0 }
    }
  } catch {
    // ignore
  }
  return null
}

async function readRecentMetrics(): Promise<{ saved: number; calls: number } | null> {
  try {
    const file = Bun.file(METRICS_FILE)
    if (!(await file.exists())) return null
    const text = await file.text()
    const lines = text.trim().split("\n").filter((l) => l.trim())
    if (lines.length === 0) return null

    let totalSaved = 0
    let totalCalls = lines.length

    for (const line of lines.slice(-50)) {
      try {
        const entry = JSON.parse(line)
        totalSaved += entry.before_tokens - entry.after_tokens
      } catch {
        // skip malformed lines
      }
    }

    return { saved: totalSaved, calls: totalCalls }
  } catch {
    return null
  }
}

function StatusBarWidget(props: { theme: TuiTheme }) {
  const [time, setTime] = createSignal(formatTime(new Date()))
  const [tokensSaved, setTokensSaved] = createSignal(0)
  const [toolCalls, setToolCalls] = createSignal(0)
  const [sessionSaved, setSessionSaved] = createSignal(0)
  const [sessionCalls, setSessionCalls] = createSignal(0)
  const [isLoaded, setIsLoaded] = createSignal(false)

  let clockInterval: ReturnType<typeof setInterval>
  let metricsInterval: ReturnType<typeof setInterval>

  async function loadMetrics() {
    const session = await readSessionMemory()
    if (session) {
      setTokensSaved(session.tokensSaved)
      setToolCalls(session.toolCalls)
    }

    const recent = await readRecentMetrics()
    if (recent) {
      setSessionSaved(recent.saved)
      setSessionCalls(recent.calls)
    }

    setIsLoaded(true)
  }

  onMount(() => {
    clockInterval = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)

    loadMetrics()
    metricsInterval = setInterval(loadMetrics, 5000)
  })

  onCleanup(() => {
    clearInterval(clockInterval)
    clearInterval(metricsInterval)
  })

  const saved = tokensSaved() > 0 ? tokensSaved() : sessionSaved()
  const calls = toolCalls() > 0 ? toolCalls() : sessionCalls()
  const accent = props.theme.current.accent
  const muted = props.theme.current.textMuted

  const leftText = isLoaded() && saved > 0
    ? `🌸 opentoken ✨ saved ${formatTokens(saved)} tokens | ${calls} calls`
    : `🌸 opentoken 💤 ready`

  return (
    <box width="100%" height={1}>
      <text>
        <text fg={accent}>{leftText}</text>
        <text fg={muted}>{"    "}</text>
        <text fg={muted}>{time()}</text>
      </text>
    </box>
  )
}

const plugin: TuiPlugin = async (api, _options, _meta) => {
  api.slots.register({
    order: 100,
    slots: {
      app_bottom(ctx: TuiSlotContext) {
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
