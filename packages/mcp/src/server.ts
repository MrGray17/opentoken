#!/usr/bin/env bun
import {
	formatStatsSummary,
	rewriteCommand,
	transformToolOutput,
} from "@mrgray17/opentoken-core";
import { readline } from "bun";

const currentSessionID = crypto.randomUUID();

interface JsonRpcRequest {
	jsonrpc: string;
	id: string | number;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: string;
	id: string | number;
	result?: unknown;
	error?: { code: number; message: string };
}

const TOOLS = [
	{
		name: "opentoken_transform",
		description:
			"Compress tool output before sending to LLM. Reduces token usage 50-80%.",
		inputSchema: {
			type: "object",
			properties: {
				tool: {
					type: "string",
					enum: ["bash", "read", "grep", "glob"],
					description: "Tool type",
				},
				command: {
					type: "string",
					description: "Original command (enables family-specific filtering)",
				},
				output: {
					type: "string",
					description: "Raw tool output to compress",
				},
			},
			required: ["tool", "output"],
		},
	},
	{
		name: "opentoken_rewrite",
		description:
			"Rewrite command to suppress noise before execution (--silent, -q, --oneline)",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string" },
			},
			required: ["command"],
		},
	},
	{
		name: "opentoken_stats",
		description: "Show token savings statistics for current session",
		inputSchema: { type: "object", properties: {} },
	},
];

async function handleToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
	switch (name) {
		case "opentoken_transform": {
			const { output } = await transformToolOutput(
				args.tool as string,
				(args.command as string) ?? "",
				args.output as string,
				{ sessionID: currentSessionID },
			);
			return { content: [{ type: "text", text: output }] };
		}
		case "opentoken_rewrite": {
			const result = rewriteCommand(args.command as string);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							modifiedArgs: result.modifiedArgs,
							blocked: result.blocked,
						}),
					},
				],
			};
		}
		case "opentoken_stats": {
			const summary = formatStatsSummary(undefined);
			return { content: [{ type: "text", text: summary }] };
		}
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

async function handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse> {
	const base = { jsonrpc: "2.0", id: msg.id };

	try {
		switch (msg.method) {
			case "initialize":
				return {
					...base,
					result: {
						protocolVersion: "2024-11-05",
						capabilities: {
							tools: {},
						},
						serverInfo: {
							name: "@mrgray17/opentoken-mcp",
							version: "1.0.0",
						},
					},
				};

			case "notifications/initialized":
				return { ...base, result: null };

			case "tools/list":
				return { ...base, result: { tools: TOOLS } };

			case "tools/call": {
				const result = await handleToolCall(
					msg.params?.name as string,
					(msg.params?.arguments as Record<string, unknown>) ?? {},
				);
				return { ...base, result };
			}

			default:
				return {
					...base,
					error: { code: -32601, message: `Method not found: ${msg.method}` },
				};
		}
	} catch (err) {
		const msgErr = err instanceof Error ? err.message : String(err);
		return {
			...base,
			error: { code: -32603, message: msgErr },
		};
	}
}

// Main loop — JSON-RPC over stdio
for await (const line of readline(process.stdin)) {
	if (!line.trim()) continue;
	try {
		const msg = JSON.parse(line) as JsonRpcRequest;
		const response = await handleMessage(msg);
		process.stdout.write(JSON.stringify(response) + "\n");
	} catch {
		// Malformed JSON — ignore
	}
}
