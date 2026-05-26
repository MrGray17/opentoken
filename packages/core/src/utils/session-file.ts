import os from "node:os";
import path from "node:path";
import { atomicWriteFileAsync, atomicWriteFileSync } from "./atomic-write";

const SESSION_START_FILE = path.join(
	os.homedir(),
	".config",
	"opentoken",
	"session-start.json",
);

export function writeSessionStartFile(sessionID: string): void {
	try {
		atomicWriteFileSync(
			SESSION_START_FILE,
			JSON.stringify({ sessionStart: Date.now(), sessionID }),
		);
	} catch {
		// fs — silent fail
	}
}

export async function writeSessionStartFileAsync(
	sessionID: string,
): Promise<void> {
	try {
		await atomicWriteFileAsync(
			SESSION_START_FILE,
			JSON.stringify({ sessionStart: Date.now(), sessionID }),
		);
	} catch {
		// fs — silent fail
	}
}

export async function ensureSessionStartFile(sessionID: string): Promise<void> {
	try {
		const f = Bun.file(SESSION_START_FILE);
		if (!(await f.exists())) {
			await writeSessionStartFileAsync(sessionID);
		}
	} catch {
		// fs — silent fail
	}
}
