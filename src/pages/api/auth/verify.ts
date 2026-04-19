import type { APIRoute } from "astro";
import { createSessionCookie, randomToken, sha256Hex } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	try {
		const token = String(url.searchParams.get("token") || "").trim();
		if (!token) {
			return Response.redirect(new URL("/settings?auth=invalid-link", url.origin), 302);
		}

		const tokenHash = sha256Hex(token);
		const sql = getNeonSql();
		const linkRows = await sql<Array<{ id: string; user_id: string }>>`
			select id::text as id, user_id::text as user_id
			from auth_magic_link
			where token_hash = ${tokenHash}
				and used_at is null
				and expires_at > now()
			limit 1
		`;
		const linkId = String(linkRows[0]?.id || "");
		const userId = String(linkRows[0]?.user_id || "");
		if (!linkId || !userId) {
			return Response.redirect(new URL("/settings?auth=invalid-link", url.origin), 302);
		}

		await sql`
			update auth_magic_link
			set used_at = now()
			where id = ${linkId}::uuid
				and used_at is null
		`;

		const sessionToken = randomToken(32);
		const sessionHash = sha256Hex(sessionToken);
		await sql`
			insert into auth_session (user_id, session_hash, expires_at)
			values (${userId}::uuid, ${sessionHash}, now() + interval '30 days')
		`;

		const headers = new Headers({ Location: "/profile?auth=success" });
		headers.append("Set-Cookie", createSessionCookie(sessionToken));
		return new Response(null, { status: 302, headers });
	} catch {
		return Response.redirect(new URL("/settings?auth=invalid-link", url.origin), 302);
	}
};
