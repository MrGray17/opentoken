import path from "node:path";
import { config } from "./config";

// ─── SECURITY GUARDS ───

export function validateToolName(tool: unknown): string {
	if (typeof tool !== "string") return "unknown";
	// Whitelist known tool names
	const known = [
		"bash",
		"read",
		"grep",
		"glob",
		"write",
		"edit",
		"web_fetch",
		"web_search",
	];
	return known.includes(tool) ? tool : tool.replace(/[^a-zA-Z0-9_]/g, "");
}

export function sanitizeFilePath(
	filePath: string,
	rootDir: string,
): { safe: boolean; resolved: string; reason?: string } {
	const resolved = path.resolve(rootDir, filePath);
	const normalizedRoot = path.resolve(rootDir);

	// Block path traversal
	if (!resolved.startsWith(normalizedRoot)) {
		return {
			safe: false,
			resolved: "",
			reason: `Path traversal blocked: ${filePath} resolves outside project directory`,
		};
	}

	// Block absolute paths
	if (path.isAbsolute(filePath) && !filePath.startsWith(normalizedRoot)) {
		return {
			safe: false,
			resolved: "",
			reason: `Absolute paths outside project blocked: ${filePath}`,
		};
	}

	return { safe: true, resolved };
}

export function validateOutputSize(output: string): {
	valid: boolean;
	reason?: string;
} {
	const bytes = Buffer.byteLength(output, "utf8");
	if (bytes > config.maxOutputBytes) {
		return {
			valid: false,
			reason: `Output too large: ${(bytes / 1024 / 1024).toFixed(1)}MB exceeds ${(config.maxOutputBytes / 1024 / 1024).toFixed(0)}MB limit`,
		};
	}
	return { valid: true };
}
