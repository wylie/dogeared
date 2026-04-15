import { neon } from "@neondatabase/serverless";

let cachedSql: ReturnType<typeof neon> | null = null;

export function getNeonSql() {
	if (cachedSql) return cachedSql;

	const databaseUrl = String(import.meta.env.DATABASE_URL || "").trim();
	if (!databaseUrl) {
		throw new Error("Missing DATABASE_URL.");
	}

	cachedSql = neon(databaseUrl);
	return cachedSql;
}

