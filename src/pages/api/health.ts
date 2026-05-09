import type { APIRoute } from "astro";
import { getNeonSql } from "../../lib/neon.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
	const startedAt = Date.now();
	let dbOk = false;
	let dbLatencyMs = 0;
	let dbError = "";

	try {
		const sql = getNeonSql();
		const queryStartedAt = Date.now();
		await sql`select 1 as ok`;
		dbLatencyMs = Date.now() - queryStartedAt;
		dbOk = true;
	} catch (error) {
		dbOk = false;
		dbError = error instanceof Error ? error.message : "Unknown database error";
	}

	const status = dbOk ? "ok" : "degraded";
	const statusCode = dbOk ? 200 : 503;
	const payload = {
		status,
		checkedAt: new Date().toISOString(),
		uptimeSeconds: Math.floor(process.uptime()),
		durationMs: Date.now() - startedAt,
		services: {
			db: {
				ok: dbOk,
				latencyMs: dbLatencyMs,
				error: dbError
			}
		}
	};

	return new Response(JSON.stringify(payload), {
		status: statusCode,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store"
		}
	});
};
