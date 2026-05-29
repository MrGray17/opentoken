// Pre-call filters — intercept tool args BEFORE execution
// #3 Block verbose commands → rewrite to quiet
// #5 Subagent budget enforcement
// #6 Block minified/generated files
// #7 Size caps on write/edit

const MINIFIED_PATTERNS = [
	/\.min\.(js|css)$/,
	/\.bundle\.(js|css)$/,
	/\.chunk\.\w+\.js$/,
	/\.generated\./,
	/(?:^|\/)dist\//,
	/(?:^|\/)build\//,
	/(?:^|\/)out\//,
	/(?:^|\/)target\//,
	/(?:^|\/)node_modules\//,
	/(?:^|\/)\.next\//,
	/(?:^|\/)\.nuxt\//,
	/(?:^|\/)\.svelte-kit\//,
	/(?:^|\/)\.cache\//,
	/(?:^|\/)__pycache__\//,
	/(?:^|\/)\.turbo\//,
	/(?:^|\/)\.parcel-cache\//,
	/(?:^|\/)coverage\//,
	/(?:^|\/)\.venv\//,
	/(?:^|\/)venv\//,
	/(?:^|\/)vendor\//,
];

// Lock file patterns — large, auto-generated, blocked by default, overridable
const LOCK_FILE_PATTERNS = [
	/package-lock\.json$/,
	/yarn\.lock$/,
	/Cargo\.lock$/,
	/pnpm-lock\.yaml$/,
	/Gemfile\.lock$/,
	/go\.sum$/,
	/composer\.lock$/,
	/bun\.lock$/,
	/bun\.lockb$/,
	/poetry\.lock$/,
	/Pipfile\.lock$/,
];

// #3: Command rewrite rules — map verbose → quiet
const COMMAND_REWRITES: { match: RegExp; rewrite: (cmd: string) => string }[] =
	[
		// npm/yarn/bun/pnpm install → add --silent
		{
			match: /^(npm|yarn|bun|pnpm)\s+(install|i|add)(\s|$)/,
			rewrite: (cmd) => {
				if (
					cmd.includes("--silent") ||
					cmd.includes("-s") ||
					cmd.includes("--quiet") ||
					cmd.includes("-q")
				)
					return cmd;
				return cmd.replace(
					/^(npm|yarn|bun|pnpm)\s+(install|i|add)/,
					"$1 $2 --silent",
				);
			},
		},
		// npm run → add --silent
		{
			match: /^(npm|yarn|bun|pnpm)\s+run\s/,
			rewrite: (cmd) => {
				if (
					cmd.includes("--silent") ||
					cmd.includes("-s") ||
					cmd.includes("--quiet") ||
					cmd.includes("-q")
				)
					return cmd;
				return `${cmd} --silent`;
			},
		},
		// curl → add -s
		{
			match: /^curl\s/,
			rewrite: (cmd) => {
				if (
					cmd.includes(" -s") ||
					cmd.includes(" -S") ||
					cmd.includes("--silent")
				)
					return cmd;
				return cmd.replace(/^curl\s/, "curl -s ");
			},
		},
		// wget → add -q
		{
			match: /^wget\s/,
			rewrite: (cmd) => {
				if (cmd.includes(" -q") || cmd.includes("--quiet")) return cmd;
				return cmd.replace(/^wget\s/, "wget -q ");
			},
		},
		// docker build → add --progress=quiet
		{
			match: /^docker\s+build\s/,
			rewrite: (cmd) => {
				if (cmd.includes("--progress")) return cmd;
				return cmd.replace(/^docker\s+build/, "docker build --progress=quiet");
			},
		},
		// docker compose → add --quiet
		{
			match: /^docker\s+compose\s/,
			rewrite: (cmd) => {
				if (cmd.includes("--quiet") || cmd.includes("-q")) return cmd;
				return `${cmd} --quiet`;
			},
		},
		// git log without --oneline → add --oneline
		{
			match: /^git\s+log(?!\s+--oneline)(?!\s+-\w*o)/,
			rewrite: (cmd) => cmd.replace(/^git\s+log/, "git log --oneline"),
		},
		// cargo build → add --quiet
		{
			match: /^cargo\s+(build|check|test|clippy)(?!\s+.*--quiet)/,
			rewrite: (cmd) => cmd.replace(/^(cargo\s+\w+)/, "$1 --quiet"),
		},
		// cargo build --release without --quiet
		{
			match: /^cargo\s+(build|check|test|clippy)\s+--release(?!\s+.*--quiet)/,
			rewrite: (cmd) => cmd.replace(/^(cargo\s+\w+\s+--release)/, "$1 --quiet"),
		},
		// pip install → add --quiet
		{
			match: /^pip(3)?\s+install\s/,
			rewrite: (cmd) => {
				if (cmd.includes("--quiet") || cmd.includes("-q")) return cmd;
				return cmd.replace(/^(pip3?\s+install)/, "$1 --quiet");
			},
		},
		// pytest → add -q
		{
			match: /^pytest(?!\s+-[qr])/,
			rewrite: (cmd) => `${cmd} -q`,
		},
		// ls → add --color=never (saves ANSI escape tokens)
		{
			match: /^ls\s/,
			rewrite: (cmd) => {
				if (cmd.includes("--color")) return cmd;
				return cmd.replace(/^ls\s/, "ls --color=never ");
			},
		},
		// tree → add -I to exclude noise
		{
			match: /^tree\s/,
			rewrite: (cmd) => {
				if (cmd.includes("-I")) return cmd;
				return `${cmd} -I "node_modules|.git|dist|build|.cache|__pycache__|.venv|coverage|.next|.turbo"`;
			},
		},
		// find → exclude noise dirs
		{
			match: /^find\s/,
			rewrite: (cmd) => {
				if (cmd.includes("-path") || cmd.includes("-prune")) return cmd;
				return `${cmd} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.cache/*" -not -path "*/__pycache__/*"`;
			},
		},
		// kubectl → add -o wide for more info per token
		{
			match: /^kubectl\s/,
			rewrite: (cmd) => {
				if (cmd.includes(" -o ")) return cmd;
				return `${cmd} -o wide`;
			},
		},
		// terraform → add -no-color
		{
			match: /^terraform\s/,
			rewrite: (cmd) => {
				if (cmd.includes("-no-color")) return cmd;
				return `${cmd} -no-color`;
			},
		},
		// git status → short format
		{
			match: /^git\s+status(?!\s+-[sb])/,
			rewrite: (cmd) => {
				if (cmd.includes("-s") || cmd.includes("-b") || cmd.includes("--short"))
					return cmd;
				return `${cmd} -s`;
			},
		},
		// npm/yarn ls → limit depth
		{
			match: /^(npm|yarn)\s+ls/,
			rewrite: (cmd) => {
				if (cmd.includes("--depth")) return cmd;
				return `${cmd} --depth=0`;
			},
		},
		// grep → strip ANSI
		{
			match: /^grep\s/,
			rewrite: (cmd) => {
				if (cmd.includes("--color")) return cmd;
				return `${cmd} --color=never`;
			},
		},
		// go test → verbose (test names only, fewer tokens than raw)
		{
			match: /^go\s+test\s/,
			rewrite: (cmd) => {
				if (cmd.includes("-v")) return cmd;
				return cmd.replace(/^(go\s+test)/, "$1 -v");
			},
		},
		// older make+go-test rewrites removed (caused silent data loss); safe go test -v kept above
		// brew → add -q
		{
			match: /^brew\s/,
			rewrite: (cmd) => {
				if (cmd.includes(" -q") || cmd.includes(" --quiet")) return cmd;
				return `${cmd} -q`;
			},
		},
		// apt/apt-get → add -qq
		{
			match: /^(apt|apt-get)\s/,
			rewrite: (cmd) => {
				if (cmd.includes(" -q")) return cmd;
				return cmd
					.replace(/^(apt-get)/, "$1 -qq")
					.replace(/^(apt)(\s)/, "$1 -qq$2");
			},
		},
		// mvn/gradle → add -q
		{
			match: /^(mvn|gradle)\s/,
			rewrite: (cmd) => {
				if (cmd.includes(" -q") || cmd.includes(" --quiet")) return cmd;
				return `${cmd} -q`;
			},
		},
	];

// #6: Check if file path is minified/generated
export function isMinifiedOrGenerated(
	filePath: string,
	allowLockFiles?: boolean,
): boolean {
	if (allowLockFiles) {
		return MINIFIED_PATTERNS.some((p) => p.test(filePath));
	}
	return (
		MINIFIED_PATTERNS.some((p) => p.test(filePath)) ||
		LOCK_FILE_PATTERNS.some((p) => p.test(filePath))
	);
}

// #3: Rewrite command to quiet version
export function rewriteCommand(command: string): string {
	let result = command.trim();
	for (const rule of COMMAND_REWRITES) {
		if (rule.match.test(result)) {
			result = rule.rewrite(result);
		}
	}
	return result;
}

// #7: Size caps for write/edit
export const WRITE_MAX_BYTES = 50 * 1024; // 50KB
export const EDIT_MAX_BYTES = 20 * 1024; // 20KB

export function checkWriteSize(content: string): {
	allowed: boolean;
	reason?: string;
} {
	if (content.length > WRITE_MAX_BYTES) {
		return {
			allowed: false,
			reason: `Write blocked: ${Math.round(content.length / 1024)}KB exceeds ${WRITE_MAX_BYTES / 1024}KB limit`,
		};
	}
	return { allowed: true };
}

export function checkEditSize(content: string): {
	allowed: boolean;
	reason?: string;
} {
	if (content.length > EDIT_MAX_BYTES) {
		return {
			allowed: false,
			reason: `Edit blocked: ${Math.round(content.length / 1024)}KB exceeds ${EDIT_MAX_BYTES / 1024}KB limit`,
		};
	}
	return { allowed: true };
}

// Pre-call hook: intercept tool args before execution
export function preCallFilter(
	tool: string,
	args: Record<string, unknown>,
	options?: { allowLockFiles?: boolean },
): {
	blocked?: boolean;
	reason?: string;
	modifiedArgs?: Record<string, unknown>;
} {
	// #3: Bash command rewriting
	if (tool === "bash" && typeof args.command === "string") {
		const rewritten = rewriteCommand(args.command);
		if (rewritten !== args.command) {
			return { modifiedArgs: { ...args, command: rewritten } };
		}
	}

	// #6: Block reads of minified/generated files
	if (tool === "read" && typeof args.filePath === "string") {
		if (isMinifiedOrGenerated(args.filePath, options?.allowLockFiles)) {
			return {
				blocked: true,
				reason: `Blocked: ${args.filePath} is minified/generated (use outline instead)`,
			};
		}
	}

	// #7: Size caps on write/edit
	if (tool === "write" && typeof args.content === "string") {
		const check = checkWriteSize(args.content);
		if (!check.allowed) return { blocked: true, reason: check.reason };
	}

	if (tool === "edit" && typeof args.content === "string") {
		const check = checkEditSize(args.content);
		if (!check.allowed) return { blocked: true, reason: check.reason };
	}

	return {};
}
