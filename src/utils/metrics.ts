import path from "path"
import os from "os"

interface MetricEntry {
  ts: string
  tool: string
  family: string
  before_tokens: number
  after_tokens: number
  saved_pct: number
  project?: string
}

const METRICS_DIR = path.join(os.homedir(), ".config", "opentoken")
const METRICS_FILE = path.join(METRICS_DIR, "metrics.jsonl")

async function ensureDir() {
  await Bun.file(METRICS_DIR).exists() || await Bun.write(METRICS_DIR, "")
}

export async function recordMetric(entry: MetricEntry): Promise<void> {
  try {
    await ensureDir()
    const line = JSON.stringify(entry) + "\n"
    await Bun.file(METRICS_FILE).writer({ append: true }).write(line)
  } catch {
    // Silent fail — metrics shouldn't break the pipeline
  }
}

export async function getStats(period: "all" | "today" | "week" | "month" = "all"): Promise<{
  total_saved: number
  total_before: number
  total_after: number
  overall_pct: number
  by_family: Record<string, { saved: number; before: number; after: number }>
}> {
  try {
    const file = Bun.file(METRICS_FILE)
    if (!(await file.exists())) {
      return { total_saved: 0, total_before: 0, total_after: 0, overall_pct: 0, by_family: {} }
    }

    const content = await file.text()
    const lines = content.trim().split("\n").filter(Boolean)
    const entries: MetricEntry[] = lines.map((l) => JSON.parse(l))

    // Filter by period
    const cutoff = new Date()
    if (period === "today") cutoff.setHours(0, 0, 0, 0)
    else if (period === "week") cutoff.setDate(cutoff.getDate() - 7)
    else if (period === "month") cutoff.setMonth(cutoff.getMonth() - 1)

    const filtered = entries.filter((e) => new Date(e.ts) >= cutoff)

    let total_saved = 0
    let total_before = 0
    let total_after = 0
    const by_family: Record<string, { saved: number; before: number; after: number }> = {}

    for (const e of filtered) {
      total_before += e.before_tokens
      total_after += e.after_tokens
      total_saved += e.before_tokens - e.after_tokens

      if (!by_family[e.family]) {
        by_family[e.family] = { saved: 0, before: 0, after: 0 }
      }
      by_family[e.family].saved += e.before_tokens - e.after_tokens
      by_family[e.family].before += e.before_tokens
      by_family[e.family].after += e.after_tokens
    }

    return {
      total_saved,
      total_before,
      total_after,
      overall_pct: total_before > 0 ? Math.round(((total_before - total_after) / total_before) * 100) : 0,
      by_family,
    }
  } catch {
    return { total_saved: 0, total_before: 0, total_after: 0, overall_pct: 0, by_family: {} }
  }
}
