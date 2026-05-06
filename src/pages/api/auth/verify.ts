import type { APIRoute } from "astro";
import { createSessionCookie, randomToken, sha256Hex } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const invalidRedirect = new URL("/?auth=invalid-link", url.origin);
	try {
		const token = String(url.searchParams.get("token") || "").trim();
		if (!token) {
			return Response.redirect(invalidRedirect, 302);
		}

		const tokenHash = sha256Hex(token);
		const sql = getNeonSql();
		const consumedRows = await sql<Array<{ user_id: string }>>`
			update auth_magic_link
			set used_at = now()
			where token_hash = ${tokenHash}
				and used_at is null
				and expires_at > now()
			returning user_id::text as user_id
		`;
		const userId = String(consumedRows[0]?.user_id || "");
		if (!userId) {
			return Response.redirect(invalidRedirect, 302);
		}

		const sessionToken = randomToken(32);
		const sessionHash = sha256Hex(sessionToken);
		await sql`
			insert into auth_session (user_id, session_hash, expires_at)
			values (${userId}::uuid, ${sessionHash}, now() + interval '30 days')
		`;

		const userRows = await sql<Array<{ username: string | null }>>`
			select nullif(trim(username), '') as username
			from app_user
			where id = ${userId}::uuid
			limit 1
		`;
		const username = String(userRows[0]?.username || "").trim();
		const redirectPath = username
			? `/u/${encodeURIComponent(username)}?auth=success`
			: "/settings#account-settings";

		const headers = new Headers({ Location: redirectPath });
		headers.append("Set-Cookie", createSessionCookie(sessionToken));
		return new Response(null, { status: 302, headers });
	} catch {
		return Response.redirect(invalidRedirect, 302);
	}
};
