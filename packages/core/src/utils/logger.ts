// Structured logger for OpenToken
// Levels: ERROR, WARN, INFO, DEBUG
// Format: {ts, level, sessionID, stage, error: string, stack?: string}

export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG";

export interface LogEntry {
	ts: string;
	level: LogLevel;
	sessionID?: string;
	stage?: string;
	message: string;
	error?: string;
	stack?: string;
}

const PREFIX = "[OpenToken]";

function log(entry: LogEntry): void {
	const { level, sessionID, stage, message, error } = entry;
	const parts = [`${PREFIX}`, level];
	if (sessionID) parts.push(`[${sessionID}]`);
	if (stage) parts.push(`(${stage})`);
	parts.push(message);

	// ERROR and WARN to stderr, INFO and DEBUG to stdout
	const output = parts.join(" ");
	if (level === "ERROR" || level === "WARN") {
		console.error(output);
	} else {
		console.log(output);
	}

	if (error && level === "ERROR") {
		console.error(`  Error: ${error}`);
	}
	if (entry.stack && level === "ERROR") {
		console.error(`  Stack: ${entry.stack}`);
	}
}

export const logger = {
	error(
		sessionID: string | undefined,
		stage: string | undefined,
		message: string,
		err?: unknown,
	): void {
		log({
			ts: new Date().toISOString(),
			level: "ERROR",
			sessionID,
			stage,
			message,
			error:
				err instanceof Error
					? err.message
					: err !== undefined
						? String(err)
						: undefined,
			stack: err instanceof Error ? err.stack : undefined,
		});
	},

	warn(
		sessionID: string | undefined,
		stage: string | undefined,
		message: string,
		err?: unknown,
	): void {
		log({
			ts: new Date().toISOString(),
			level: "WARN",
			sessionID,
			stage,
			message,
			error:
				err instanceof Error
					? err.message
					: err !== undefined
						? String(err)
						: undefined,
		});
	},

	info(
		sessionID: string | undefined,
		stage: string | undefined,
		message: string,
	): void {
		log({
			ts: new Date().toISOString(),
			level: "INFO",
			sessionID,
			stage,
			message,
		});
	},

	debug(
		sessionID: string | undefined,
		stage: string | undefined,
		message: string,
	): void {
		log({
			ts: new Date().toISOString(),
			level: "DEBUG",
			sessionID,
			stage,
			message,
		});
	},
};
