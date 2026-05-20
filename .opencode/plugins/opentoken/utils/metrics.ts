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
  try {
    const dirExists = await Bun.file(METRICS_DIR).exists()
    if (!dirExists) {
      const proc = Bun.spawn(["mkdir", "-p", METRICS_DIR])
      await proc.exited
    }
  } catch {
    // Homedir inaccessible — metrics will silently fail
  }
}

export async function recordMetric(entry: MetricEntry): Promise<void> {
  try {
    await ensureDir()
    const line = JSON.stringify(entry) + "\n"
    // @ts-expect-error Bun.writer append option not yet in @types/bun
    await Bun.file(METRICS_FILE).writer({ append: true }).write(line)
  } catch {
    // Silent fail — metrics shouldn't break the pipeline
  }
}
