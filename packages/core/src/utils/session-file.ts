import path from "node:path";
import { atomicWriteFileAsync, atomicWriteFileSync } from "./atomic-write";
import { getConfigDir } from "./configDir";
import { fileExists } from "./fs-compat";

const SESSION_START_FILE = path.join(getConfigDir(), "session-start.json");

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
		if (!(await fileExists(SESSION_START_FILE))) {
			await writeSessionStartFileAsync(sessionID);
		}
	} catch {
		// fs — silent fail
	}
}
