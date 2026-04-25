import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to view sessions." });

		const sql = getNeonSql();
		const rows = await sql<Array<{ session_hash: string; expires_at: string }>>`
			select
				session_hash,
				expires_at::text as expires_at
			from auth_session
			where user_id = ${session.userId}::uuid
				and revoked_at is null
				and expires_at > now()
			order by expires_at desc
			limit 20
		`;

		return json(200, {
			sessions: rows.map((row) => ({
				id: String(row.session_hash || ""),
				label: `Session ${String(row.session_hash || "").slice(0, 8)}`,
				expiresAt: String(row.expires_at || ""),
				isCurrent: String(row.session_hash || "") === session.sessionHash
			}))
		});
	} catch (error) {
		return json(500, {
			error: "Failed to load sessions.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to revoke sessions." });

		const sql = getNeonSql();
		await sql`
			update auth_session
			set revoked_at = now()
			where user_id = ${session.userId}::uuid
				and revoked_at is null
				and session_hash <> ${session.sessionHash}
		`;

		return json(200, { ok: true });
	} catch (error) {
		return json(500, {
			error: "Failed to revoke sessions.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

