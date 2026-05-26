import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { OpenTokenPlugin } from "../src/index";

const tmp = `/tmp/opentoken-smoke-${Date.now()}`;
const pluginInput = { directory: tmp } as any;

describe("Smoke", () => {
	fs.mkdirSync(tmp, { recursive: true });

	it("plugin initializes without error", async () => {
		const plugin = await OpenTokenPlugin(pluginInput);
		expect(plugin).toBeDefined();
		expect(typeof plugin).toBe("object");
	});

	it("plugin returns expected hook keys", async () => {
		const plugin = await OpenTokenPlugin(pluginInput);
		const keys = Object.keys(plugin);
		expect(keys).toContain("chat.params");
		expect(keys).toContain("experimental.chat.system.transform");
	});

	it("before hook rewrites npm install to --silent", async () => {
		const plugin = await OpenTokenPlugin(pluginInput);
		const output = { args: { command: "npm install react" } };
		await (plugin as any)["tool.execute.before"](
			{ tool: "bash", sessionID: "s1", callID: "c1" },
			output,
		);
		expect(output.args?.command).toContain("--silent");
	});

	it("pipeline compresses real npm install output", async () => {
		const { filterNpmInstall } = await import("../src/families/npm");
		const input = `added 150 packages in 5s

40 packages are looking for funding

up to date, audited 150 packages in 2s

6 packages are looking for funding
run \`npm fund\` for details

found 0 vulnerabilities`;
		const result = filterNpmInstall(input);
		expect(result.length).toBeLessThan(input.length);
		expect(result).toContain("Added");
	});

	it("session.created hook does not crash", async () => {
		const plugin = await OpenTokenPlugin(pluginInput);
		const hooks = plugin as any;
		await expect(
			hooks["session.created"](),
		).resolves.toBeUndefined();
	});

	it("session.deleted hook does not crash", async () => {
		const plugin = await OpenTokenPlugin(pluginInput);
		const hooks = plugin as any;
		await expect(
			hooks["session.deleted"](),
		).resolves.toBeUndefined();
	});
});
