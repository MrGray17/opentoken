import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

// ─── SECURITY GUARDS ───

const MAX_SYMLINK_DEPTH = 40;

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

function resolveRealPath(inputPath: string, depth: number = 0): string | null {
	if (depth > MAX_SYMLINK_DEPTH) return null;
	try {
		const stat = fs.lstatSync(inputPath);
		if (stat.isSymbolicLink()) {
			const target = fs.readlinkSync(inputPath);
			const resolved = path.resolve(path.dirname(inputPath), target);
			return resolveRealPath(resolved, depth + 1);
		}
		return inputPath;
	} catch {
		return inputPath;
	}
}

export function sanitizeFilePath(
	filePath: string,
	rootDir: string,
): { safe: boolean; resolved: string; reason?: string } {
	const resolved = path.resolve(rootDir, filePath);
	const normalizedRoot = path.resolve(rootDir);

	// Resolve symlinks to prevent TOCTOU path traversal via symlink swaps
	const realResolved = resolveRealPath(resolved);
	if (realResolved === null) {
		return {
			safe: false,
			resolved: "",
			reason: `Symlink cycle detected: ${filePath} exceeds max resolution depth`,
		};
	}

	if (!realResolved.startsWith(normalizedRoot)) {
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

	return { safe: true, resolved: realResolved };
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
