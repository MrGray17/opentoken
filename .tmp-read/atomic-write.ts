import fs from "node:fs";

// Atomic file write: write to .tmp, set permissions, then rename into place
// Prevents partial writes from being observed by concurrent readers

export function atomicWriteFileSync(
	filePath: string,
	data: string,
	mode: number = 0o600,
): void {
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, data, "utf8");
	fs.chmodSync(tmp, mode);
	fs.renameSync(tmp, filePath);
	fs.chmodSync(filePath, mode);
}

export async function atomicWriteFileAsync(
	filePath: string,
	data: string,
	mode: number = 0o600,
): Promise<void> {
	const tmp = `${filePath}.tmp`;
	await Bun.write(tmp, data);
	fs.chmodSync(tmp, mode);
	fs.renameSync(tmp, filePath);
	fs.chmodSync(filePath, mode);
}
