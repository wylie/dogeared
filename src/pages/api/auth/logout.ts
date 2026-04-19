import type { APIRoute } from "astro";
import { clearSessionCookie, readCookie, SESSION_COOKIE, sha256Hex } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const token = readCookie(request.headers, SESSION_COOKIE);
	if (token) {
		const sql = getNeonSql();
		const sessionHash = sha256Hex(token);
		await sql`
			update auth_session
			set revoked_at = now()
			where session_hash = ${sessionHash}
		`;
	}

	const headers = new Headers({ "Content-Type": "application/json" });
	headers.append("Set-Cookie", clearSessionCookie());
	return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
