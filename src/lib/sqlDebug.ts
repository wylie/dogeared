export type SqlDebugParam = {
	name: string;
	pgType: string;
	value: unknown;
};

function failingParameterIndex(error: unknown) {
	const message = error instanceof Error ? error.message : String(error || "");
	const match = message.match(/parameter\s+\$(\d+)/i);
	return match ? Number(match[1]) : 0;
}

function valuePreview(value: unknown) {
	if (value === null) return null;
	if (value === undefined) return "undefined";
	if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) return `[array:${value.length}]`;
	if (value && typeof value === "object") return "[object]";
	return String(value);
}

function runtimeType(value: unknown) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function isDevelopmentRuntime() {
	return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}

export function logSqlQueryFailure(operation: string, params: SqlDebugParam[], error: unknown) {
	if (!isDevelopmentRuntime()) return;
	const index = failingParameterIndex(error);
	const parameterList = params.map((param, itemIndex) => ({
		index: itemIndex + 1,
		name: param.name,
		pgType: param.pgType,
		runtimeType: runtimeType(param.value),
		value: valuePreview(param.value)
	}));
	console.error("[sql.query.failed]", {
		operation,
		failingParameterIndex: index || null,
		failingParameter: index > 0 ? parameterList[index - 1] || null : null,
		parameterList,
		error: error instanceof Error ? error.message : String(error || "Unknown error")
	});
}

export async function withSqlDebug<T>(operation: string, params: SqlDebugParam[], execute: () => Promise<T>) {
	try {
		return await execute();
	} catch (error) {
		logSqlQueryFailure(operation, params, error);
		throw error;
	}
}
