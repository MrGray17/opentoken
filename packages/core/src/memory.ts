// MEMORY.md — structured fact store for cross-session memory
// Each fact is one line (~30t). Injected only if net token positive.
// 0-risk: silent skip on missing/corrupt file, cost-gated injection.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./utils/logger";

const MEMORY_DIR = path.join(os.homedir(), ".config", "opentoken");
const MEMORY_PATH = path.join(MEMORY_DIR, "MEMORY.md");
const MAX_FACTS = 50;
const ESTIMATED_SAVINGS_PER_FACT = 80;
const MIN_NET_SAVINGS = 0;

function ensureDir(): void {
	try {
		if (!fs.existsSync(MEMORY_DIR)) {
			fs.mkdirSync(MEMORY_DIR, { recursive: true });
		}
	} catch {
		logger.warn(
			undefined,
			"memory.ensureDir",
			"Failed to create memory directory",
		);
	}
}

function readFacts(): string[] {
	try {
		ensureDir();
		if (!fs.existsSync(MEMORY_PATH)) return [];
		const content = fs.readFileSync(MEMORY_PATH, "utf-8");
		return content
			.split("\n")
			.filter((l) => l.startsWith("- "))
			.map((l) => l.slice(2).trim())
			.filter((l) => l.length > 0);
	} catch {
		logger.warn(undefined, "memory.read", "Failed to read memory file");
		return [];
	}
}

function writeFacts(facts: string[]): void {
	try {
		ensureDir();
		const content =
			"# Memory\n\n" + facts.map((f) => `- ${f}`).join("\n") + "\n";
		const tmp = MEMORY_PATH + ".tmp";
		fs.writeFileSync(tmp, content, "utf-8");
		fs.renameSync(tmp, MEMORY_PATH);
		try {
			fs.chmodSync(MEMORY_PATH, 0o600);
		} catch {
			logger.debug(
				undefined,
				"memory.chmod",
				"Failed to set memory file permissions",
			);
		}
	} catch {
		logger.warn(undefined, "memory.write", "Failed to write memory facts");
	}
}

function getRelevantFacts(
	projectPath: string,
	limit: number,
	keywords?: string[],
): string[] {
	const facts = readFacts();
	const projectName = projectPath.split("/").pop() || projectPath;
	const relevant = facts.filter((f) => f.startsWith(projectName + ":"));
	const other = facts.filter((f) => !relevant.includes(f));
	const sorted = [...relevant, ...other];

	if (keywords && keywords.length > 0) {
		const kwSet = new Set(keywords.map((k) => k.toLowerCase()));
		sorted.sort((a, b) => {
			const aScore = a
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => kwSet.has(w)).length;
			const bScore = b
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => kwSet.has(w)).length;
			return bScore - aScore;
		});
	}

	return sorted.slice(0, limit);
}

function estimateInjectionCost(facts: string[]): number {
	const overhead = 25;
	return (
		facts.reduce((sum, f) => sum + Math.ceil(f.length / 4) + 5, 0) + overhead
	);
}

function estimateSavings(facts: string[]): number {
	return facts.length * ESTIMATED_SAVINGS_PER_FACT;
}

// Build memory prompt — injects compact facts, cost-gated
export function buildMemoryPrompt(
	projectPath: string,
	keywords?: string[],
): string {
	const facts = getRelevantFacts(projectPath, 5, keywords);
	if (facts.length === 0) return "";

	const cost = estimateInjectionCost(facts);
	const savings = estimateSavings(facts);
	if (savings - cost < MIN_NET_SAVINGS) return "";

	const lines = facts.map((f) => `  - ${f}`);
	return `Previous context:\n${lines.join("\n")}`;
}

// Write a structured fact
export function writeSessionSummary(
	_sessionID: string,
	projectPath: string,
	summary: string,
): void {
	const facts = readFacts();
	const projectName = projectPath.split("/").pop() || projectPath;

	const keywords = summary
		.toLowerCase()
		.replace(/[^\w\s-/.]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3 && !STOP_WORDS.has(w))
		.slice(0, 5)
		.join(" ");

	const files = extractFiles(summary);
	const fileStr = files.length > 0 ? files.slice(0, 3).join(" ") : "";
	const factParts = [keywords, fileStr].filter(Boolean);
	const fact = factParts.join(" | ");

	if (!fact) return;

	const prefixed = `${projectName}: ${fact}`;
	const deduped = facts.filter((f) => {
		const a = f.replace(/^[^:]+:\s*/, "").trim();
		const b = prefixed.replace(/^[^:]+:\s*/, "").trim();
		return similarity(a, b) < 0.7;
	});

	deduped.unshift(prefixed);
	const trimmed = deduped.slice(0, MAX_FACTS);
	writeFacts(trimmed);
}

// Stats (matches old interface for index.ts)
export function getMemoryStats(): {
	total: number;
	byProject: Record<string, number>;
	oldest: string;
} {
	const facts = readFacts();
	const byProject: Record<string, number> = {};
	for (const f of facts) {
		const project = f.split(":")[0] || "unknown";
		byProject[project] = (byProject[project] || 0) + 1;
	}
	return {
		total: facts.length,
		byProject,
		oldest: facts.length > 0 ? "stored" : "none",
	};
}

export function clearMemory(): void {
	try {
		if (fs.existsSync(MEMORY_PATH)) {
			fs.unlinkSync(MEMORY_PATH);
		}
	} catch {
		logger.debug(undefined, "memory.clear", "Failed to clear memory file");
	}
}

// Helpers
const STOP_WORDS = new Set([
	"this",
	"that",
	"with",
	"from",
	"have",
	"been",
	"were",
	"they",
	"their",
	"there",
	"would",
	"could",
	"should",
	"which",
	"about",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"between",
	"under",
	"again",
	"further",
	"then",
	"once",
	"here",
	"what",
	"when",
	"where",
	"why",
	"how",
	"all",
	"each",
	"every",
	"both",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"only",
	"own",
	"same",
	"than",
	"too",
	"very",
	"just",
	"also",
	"now",
	"the",
	"and",
	"for",
	"are",
	"but",
	"not",
	"you",
	"all",
	"can",
	"was",
	"one",
	"our",
	"out",
	"day",
	"get",
	"has",
	"his",
	"its",
	"may",
	"new",
	"old",
	"see",
	"two",
	"who",
	"did",
	"use",
	"way",
	"many",
	"back",
	"well",
	"down",
	"still",
	"even",
	"make",
	"like",
	"long",
	"look",
	"come",
	"made",
	"does",
]);

function extractFiles(summary: string): string[] {
	const filePattern = /(?:^|\s|["'`])([/\w.-]+\.\w{1,6})(?:["'`\s,;:]|$)/g;
	const files: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = filePattern.exec(summary)) !== null) {
		const f = match[1];
		if (f.includes("/") || f.includes(".")) {
			files.push(f);
		}
	}
	return [...new Set(files)].slice(0, 10);
}

// Extract keywords from text for context relevance matching
export function extractContextKeywords(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3 && !STOP_WORDS.has(w))
		.slice(0, 10);
}

function similarity(a: string, b: string): number {
	const setA = new Set(a.split(/\s+/));
	const setB = new Set(b.split(/\s+/));
	let intersection = 0;
	for (const w of setA) {
		if (setB.has(w)) intersection++;
	}
	const union = setA.size + setB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}
