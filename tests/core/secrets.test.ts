import { describe, expect, it } from "bun:test";
import { redactSecrets } from "@mrgray17/opentoken-core/utils/secrets";

describe("Secrets Redaction — Existing Patterns", () => {
	it("redacts AWS keys", () => {
		expect(redactSecrets("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
	});

	it("redacts GitHub tokens", () => {
		expect(redactSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12")).toBe(
			"[REDACTED]",
		);
		expect(
			redactSecrets("github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12_12345"),
		).toBe("[REDACTED]");
	});

	it("redacts OpenAI keys", () => {
		expect(redactSecrets("sk-abcdefghijklmnopqrstuvwxyz1234567890")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts Anthropic keys before generic sk-", () => {
		const input = "sk-ant-abcdefghijklmnopqrstuvwxyz1234567890";
		const result = redactSecrets(input);
		expect(result).toBe("[REDACTED]");
	});

	it("redacts Google AI keys", () => {
		expect(redactSecrets("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts Stripe keys", () => {
		expect(redactSecrets("sk_live_" + "abcd".repeat(8))).toBe(
			"[REDACTED]",
		);
		expect(redactSecrets("rk_live_" + "abcd".repeat(8))).toBe(
			"[REDACTED]",
		);
	});

	it("redacts Slack tokens", () => {
		expect(redactSecrets("xoxb-" + "1234567890-" + "abcd".repeat(7))).toBe(
			"[REDACTED]",
		);
	});

	it("redacts JWT tokens", () => {
		expect(
			redactSecrets(
				"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jV3E6lF7iQ",
			),
		).toBe("[REDACTED]");
	});

	it("redacts private keys", () => {
		expect(redactSecrets("-----BEGIN RSA PRIVATE KEY-----")).toContain(
			"[REDACTED]",
		);
	});

	it("redacts connection strings", () => {
		expect(
			redactSecrets("postgres://user:password@localhost:5432/db"),
		).toContain("[REDACTED]");
	});

	it("redacts Bearer tokens", () => {
		expect(
			redactSecrets("Bearer abcdefghijklmnopqrstuvwxyz0123456789abcdef"),
		).toContain("[REDACTED]");
	});
});

describe("Secrets Redaction — New Patterns", () => {
	it("redacts Azure keys", () => {
		expect(
			redactSecrets(
				"azure_key = abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop",
			),
		).toContain("[REDACTED]");
	});

	it("redacts GitLab tokens", () => {
		expect(redactSecrets("glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts JFrog tokens", () => {
		expect(
			redactSecrets("jfrog_token = abcdefghijklmnopqrstuvwxyz01234"),
		).toContain("[REDACTED]");
	});

	it("redacts npm tokens", () => {
		expect(redactSecrets("npm_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts PyPI tokens", () => {
		expect(redactSecrets("pypi-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts Docker Hub tokens", () => {
		expect(redactSecrets("dckr_pat_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(
			"[REDACTED]",
		);
	});

	it("redacts Sentry DSN", () => {
		expect(
			redactSecrets(
				"https://abcdef0123456789abcdef0123456789@abcdef0123456789.ingest.sentry.io",
			),
		).toContain("[REDACTED]");
	});

	it("redacts Datadog API keys", () => {
		expect(
			redactSecrets("DD_API_KEY = abcdefghijklmnopqrstuvwxyz0123456789"),
		).toContain("[REDACTED]");
	});

	it("redacts Datadog APP keys", () => {
		expect(
			redactSecrets(
				"datadog_app_key = abcdefghijklmnopqrstuvwxyz0123456789abcdefghij",
			),
		).toContain("[REDACTED]");
	});

	it("redacts Slack webhook URLs", () => {
		expect(
			redactSecrets(
				"https://hooks.slack.com/services/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz",
			),
		).toContain("[REDACTED]");
	});
});

describe("Secrets Redaction — False Positive Prevention", () => {
	it("does not redact short strings that look like tokens", () => {
		expect(redactSecrets("sk-short")).not.toContain("[REDACTED]");
	});

	it("does not redact normal text", () => {
		const text = "This is a normal sentence without any secrets.";
		expect(redactSecrets(text)).toBe(text);
	});

	it("does not redact code identifiers", () => {
		const code = "const apiKey = getConfig('api_key');";
		expect(redactSecrets(code)).toBe(code);
	});

	it("does not redact short npm-like strings", () => {
		expect(redactSecrets("npm_short")).not.toContain("[REDACTED]");
	});
});

describe("Secrets Redaction — Multiple Patterns", () => {
	it("redacts multiple secrets in single pass", () => {
		const input = `AWS: AKIAIOSFODNN7EXAMPLE
GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12
npm: npm_abcdefghijklmnopqrstuvwxyz0123456789`;
		const result = redactSecrets(input);
		expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
		expect(result).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12");
		expect(result).not.toContain("npm_abcdefghijklmnopqrstuvwxyz0123456789");
	});

	it("redacts all occurrences of the same pattern", () => {
		const input = "key1: AKIAIOSFODNN7EXAMPLE, key2: AKIAIOSFODNN7EXAMPLE";
		const result = redactSecrets(input);
		const matches = result.match(/\[REDACTED\]/g);
		expect(matches).toHaveLength(2);
	});
});
