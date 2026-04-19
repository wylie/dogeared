import type { APIRoute } from "astro";
import { clearSessionCookie, readCookie, resolveUserBySession, SESSION_COOKIE, sha256Hex } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return new Response(JSON.stringify({ error: "You must be logged in to delete your account." }), {
				status: 401,
				headers: { "Content-Type": "application/json" }
			});
		}

		const sql = getNeonSql();
		await sql`
			delete from app_user
			where id = ${session.userId}::uuid
		`;

		const token = readCookie(request.headers, SESSION_COOKIE);
		if (token) {
			await sql`
				update auth_session
				set revoked_at = now()
				where session_hash = ${sha256Hex(token)}
			`;
		}

		const headers = new Headers({ "Content-Type": "application/json" });
		headers.append("Set-Cookie", clearSessionCookie());
		return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to delete account.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
