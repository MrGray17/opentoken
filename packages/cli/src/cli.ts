#!/usr/bin/env bun
import { pipeline } from "node:stream/promises";
import { transformToolOutput } from "@opentoken/core";

const USAGE = `
opentoken — universal token-saving pipe tool

Usage:
  opentoken [flags]                      pipe mode (reads stdin)
  opentoken wrap [flags] <command...>    wrap mode (runs command, pipes output)
  opentoken stats [--since all|session]  show token savings
  opentoken version                      print version

Flags:
  -t, --tool <bash|read|grep|glob>    tool type (default: bash)
  -c, --command <cmd>                 original command (for family detection)
  -s, --session <id>                  session ID for stats tracking
  --no-compress                       skip compression, pass through
  --no-metrics                        skip metrics recording
  -h, --help                          show help

Examples:
  git diff HEAD~1 | opentoken -t bash -c "git diff"
  opentoken wrap cargo build --release
  opentoken stats
  npm install | opentoken -t bash -c "npm install"
`;

function parseArgs(): Record<string, unknown> {
	const args = process.argv.slice(2);
	const parsed: Record<string, unknown> = { tool: "bash", command: "" };

	if (args.length === 0) return parsed;

	if (args[0] === "wrap") {
		parsed._mode = "wrap";
		// Consume flags before the command
		let idx = 1;
		while (idx < args.length && args[idx].startsWith("-")) {
			const flag = args[idx];
			switch (flag) {
				case "-t":
				case "--tool":
					parsed.tool = args[++idx];
					break;
				case "-s":
				case "--session":
					parsed.session = args[++idx];
					break;
				case "--no-compress":
					parsed["no-compress"] = true;
					break;
				case "--no-metrics":
					parsed["no-metrics"] = true;
					break;
				default:
					// skip unknown flags
					break;
			}
			idx++;
		}
		parsed._command = args.slice(idx);
		return parsed;
	}

	if (args[0] === "stats") {
		parsed._mode = "stats";
		parsed._since = args[1] === "--since" ? args[2] : "session";
		return parsed;
	}

	if (args[0] === "version" || args[0] === "--version") {
		parsed._mode = "version";
		return parsed;
	}

	if (args[0] === "-h" || args[0] === "--help") {
		parsed._mode = "help";
		return parsed;
	}

	// Pipe mode with flags
	parsed._mode = "pipe";
	let idx = 0;
	while (idx < args.length && args[idx].startsWith("-")) {
		const flag = args[idx];
		switch (flag) {
			case "-t":
			case "--tool":
				parsed.tool = args[++idx];
				break;
			case "-c":
			case "--command":
				parsed.command = args[++idx];
				break;
			case "-s":
			case "--session":
				parsed.session = args[++idx];
				break;
			case "--no-compress":
				parsed["no-compress"] = true;
				break;
			case "--no-metrics":
				parsed["no-metrics"] = true;
				break;
			default:
				break;
		}
		idx++;
	}
	return parsed;
}

async function pipeMode(args: Record<string, unknown>): Promise<void> {
	const chunks: Buffer[] = [];
	let totalBytes = 0;
	const maxBytes = 10_485_760; // 10MB

	for await (const chunk of process.stdin) {
		const buf =
			typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
		totalBytes += buf.length;
		if (totalBytes > maxBytes) {
			process.stderr.write("[opentoken] Input exceeds 10MB, passing through\n");
			process.stdout.write(Buffer.concat(chunks));
			await pipeline(process.stdin, process.stdout);
			return;
		}
		chunks.push(buf);
	}

	if (chunks.length === 0) {
		process.stderr.write(
			"Error: no input on stdin, use `opentoken wrap <cmd>` to run a command\n",
		);
		process.exit(1);
	}

	const input = Buffer.concat(chunks).toString("utf8");

	if (args["no-compress"]) {
		process.stdout.write(input);
		return;
	}

	// Check if stdin is a TTY — if so, we're interactive, not piping
	if (process.stdin.isTTY) {
		process.stderr.write(
			"Error: no input on stdin. Pipe tool output into opentoken, e.g.:\n" +
				'  git diff HEAD~1 | opentoken -t bash -c "git diff"\n' +
				"  opentoken wrap cargo build --release\n",
		);
		process.exit(1);
	}

	const { output } = await transformToolOutput(
		args.tool as string,
		args.command as string,
		input,
		{
			sessionID: (args.session as string) ?? undefined,
			enableMetrics: !args["no-metrics"],
		},
	);

	process.stdout.write(output);
}

async function wrapMode(commandParts: string[]): Promise<void> {
	if (commandParts.length === 0) {
		process.stderr.write("Usage: opentoken wrap <command...>\n");
		process.exit(1);
	}

	const { spawn } = await import("node:child_process");
	const fullCommand = commandParts.join(" ");

	const child = spawn(commandParts[0], commandParts.slice(1), {
		stdio: ["inherit", "pipe", "pipe"],
		shell: false,
	});

	const chunks: Buffer[] = [];

	const childStdout = child.stdout;
	const childStderr = child.stderr;

	if (!childStdout || !childStderr) {
		process.stderr.write(
			"opentoken: failed to capture child process streams\n",
		);
		process.exit(1);
	}

	for await (const chunk of childStdout) {
		chunks.push(
			typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer),
		);
	}

	for await (const chunk of childStderr) {
		process.stderr.write(
			typeof chunk === "string"
				? chunk
				: new TextDecoder().decode(chunk as Buffer),
		);
	}

	const exitCode = await new Promise<number>((resolve) => {
		child.on("close", resolve);
	});

	const stdoutBuf = Buffer.concat(chunks).toString("utf8");

	if (stdoutBuf.length === 0) return;

	const { output } = await transformToolOutput("bash", fullCommand, stdoutBuf, {
		enableMetrics: false,
	});

	process.stdout.write(output);
	process.exit(exitCode ?? 0);
}

async function statsMode(since?: string): Promise<void> {
	try {
		const { formatStatsSummary } = await import("@opentoken/core");
		const summary = formatStatsSummary(
			since === "all"
				? undefined
				: (process.env.OPENTOKEN_SESSION ?? undefined),
		);
		process.stdout.write(summary + "\n");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(`Failed to get stats: ${msg}\n`);
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const args = parseArgs();
	const mode = (args._mode as string) ?? "pipe";

	switch (mode) {
		case "help":
			process.stdout.write(USAGE);
			break;
		case "version":
			process.stdout.write("opentoken v2.0.0\n");
			break;
		case "stats":
			await statsMode(args._since as string);
			break;
		case "wrap":
			await wrapMode(args._command as string[]);
			break;
		default:
			await pipeMode(args);
			break;
	}
}

main().catch((err) => {
	process.stderr.write(`opentoken: ${err.message}\n`);
	process.exit(1);
});
