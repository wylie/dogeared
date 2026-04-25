import type { APIRoute } from "astro";
import { resolveActiveUserId } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json() as { userKey?: unknown };
		const userKey = normalizeText(body?.userKey);
		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) return json(401, { error: "Could not resolve user." });

		const sql = getNeonSql();
		await sql`
			delete from user_book
			where user_id = ${userId}::uuid
		`;

		return json(200, { ok: true });
	} catch (error) {
		return json(500, {
			error: "Failed to clear shelf entries.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

