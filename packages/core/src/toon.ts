// TOON Format Converter — Token-Oriented Object Notation
// Converts JSON arrays of objects to tabular CSV-like format
// Field names declared once, values listed row-by-row
// 40-50% token reduction on structured data
// Reference: https://toonformat.dev/

// Detect if content is a JSON array of objects
function isArrayOfObjects(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.startsWith("[")) return false;
	// Check if first element is an object
	return /\[\s*\{/.test(trimmed);
}

// Detect if content is a JSON object with array values
function hasArrayValues(text: string): Array<{ key: string; value: string }> {
	try {
		const obj = JSON.parse(text);
		if (typeof obj !== "object" || Array.isArray(obj)) return [];
		const arrays: Array<{ key: string; value: string }> = [];
		for (const [key, value] of Object.entries(obj)) {
			if (
				Array.isArray(value) &&
				value.length > 2 &&
				typeof value[0] === "object"
			) {
				arrays.push({ key, value: JSON.stringify(value) });
			}
		}
		return arrays;
	} catch {
		return [];
	}
}

// Escape value for TOON format (quote if contains comma, newline, or quote)
function escapeValue(val: unknown): string {
	if (val === null || val === undefined) return "";
	if (typeof val === "object") {
		const s = JSON.stringify(val);
		if (s.includes(",") || s.includes("\n") || s.includes('"')) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	}
	const s = String(val);
	if (s.includes(",") || s.includes("\n") || s.includes('"')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

// Convert array of objects to TOON format
function arrayToTOON(arr: unknown[]): string {
	if (arr.length === 0) return "[]";
	if (!Array.isArray(arr) || typeof arr[0] !== "object" || arr[0] === null) {
		return JSON.stringify(arr);
	}

	// Collect all unique keys (preserve order of first object)
	const allKeys = new Set<string>();
	for (const item of arr) {
		if (typeof item === "object" && item !== null) {
			for (const key of Object.keys(item)) {
				allKeys.add(key);
			}
		}
	}

	const keys = [...allKeys];
	const count = arr.length;

	// Build TOON header: key[COUNT]{field1,field2,...}:
	const header = `${keys[0]}[${count}]{${keys.join(",")}}:`;

	// Build rows
	const rows: string[] = [];
	for (const item of arr) {
		const values = keys.map((k) =>
			escapeValue((item as Record<string, unknown>)[k]),
		);
		rows.push(values.join(","));
	}

	return `${header}\n${rows.join("\n")}`;
}

// Convert nested JSON object to TOON format
function objectToTOON(obj: Record<string, unknown>): string {
	const lines: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			typeof value[0] === "object"
		) {
			// Array of objects → TOON table
			lines.push(arrayToTOON(value));
		} else if (Array.isArray(value)) {
			// Primitive array → compact list
			lines.push(`${key}[${value.length}]: ${value.join(",")}`);
		} else if (typeof value === "object" && value !== null) {
			// Nested object → recurse
			lines.push(`${key}:`);
			const nested = objectToTOON(value as Record<string, unknown>);
			for (const line of nested.split("\n")) {
				lines.push(`  ${line}`);
			}
		} else {
			// Primitive → simple key: value
			lines.push(`${key}: ${value}`);
		}
	}

	return lines.join("\n");
}

// Main TOON conversion function
export function convertToTOON(text: string): {
	converted: boolean;
	result: string;
} {
	const trimmed = text.trim();

	// Try as JSON array of objects
	if (isArrayOfObjects(trimmed)) {
		try {
			const arr = JSON.parse(trimmed);
			if (Array.isArray(arr) && arr.length > 2 && typeof arr[0] === "object") {
				const toon = arrayToTOON(arr);
				// Only use TOON if it's actually shorter
				if (toon.length < trimmed.length * 0.8) {
					return { converted: true, result: toon };
				}
			}
		} catch {
			/* not valid JSON */
		}
	}

	// Try as JSON object with array values
	try {
		const obj = JSON.parse(trimmed);
		if (typeof obj === "object" && !Array.isArray(obj)) {
			const arrays = hasArrayValues(trimmed);
			if (arrays.length > 0) {
				// Convert only the array values to TOON, keep rest as-is
				let result = trimmed;
				for (const { value } of arrays) {
					const arr = JSON.parse(value);
					const toon = arrayToTOON(arr);
					if (toon.length < value.length * 0.8) {
						// Replace the array in the original JSON
						const escapedValue = JSON.stringify(value);
						result = result.replace(escapedValue, toon);
					}
				}
				if (result !== trimmed) {
					return { converted: true, result };
				}
			}

			// Try full object to TOON
			const toon = objectToTOON(obj);
			if (toon.length < trimmed.length * 0.7) {
				return { converted: true, result: toon };
			}
		}
	} catch {
		/* not valid JSON */
	}

	return { converted: false, result: text };
}
