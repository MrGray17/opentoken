// fs-compat — Bun <-> Node.js compatibility layer
// All functions return Promises, matching Bun's async API.
// Under Bun: delegates to Bun natives. Under Node.js: uses fs.promises.

import { spawn } from "node:child_process";
import fs from "node:fs";

const hasBun = typeof Bun !== "undefined";

export async function fileExists(path: string): Promise<boolean> {
	if (hasBun) return Bun.file(path).exists();
	try {
		await fs.promises.access(path, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

export async function readTextFile(path: string): Promise<string> {
	if (hasBun) return Bun.file(path).text();
	return fs.promises.readFile(path, "utf-8");
}

export interface FileStat {
	mtimeMs: number;
	size: number;
}

export async function getFileStat(path: string): Promise<FileStat> {
	if (hasBun) {
		const stat = await Bun.file(path).stat();
		return { mtimeMs: stat.mtimeMs, size: stat.size };
	}
	const stat = await fs.promises.stat(path);
	return { mtimeMs: stat.mtimeMs, size: stat.size };
}

export async function writeTextFile(path: string, data: string): Promise<void> {
	if (hasBun) {
		await Bun.write(path, data);
		return;
	}
	await fs.promises.writeFile(path, data, "utf-8");
}

export interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export function runCommand(args: string[]): Promise<SpawnResult> {
	if (hasBun) {
		return (async () => {
			const proc = Bun.spawn({
				cmd: [args[0], ...args.slice(1)],
				stdout: "pipe",
				stderr: "pipe",
			});
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();
			const exitCode = await proc.exited;
			return { stdout, stderr, exitCode };
		})();
	}
	return new Promise((resolve, reject) => {
		const proc = spawn(args[0], args.slice(1));
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
		proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
		proc.on("close", (code: number | null) =>
			resolve({ stdout, stderr, exitCode: code ?? 0 }),
		);
		proc.on("error", reject);
	});
}
