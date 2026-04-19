import type { APIRoute } from "astro";
import { getEncryptionKey, resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return new Response(JSON.stringify({ authenticated: false }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}

		const sql = getNeonSql();
		const encryptionKey = getEncryptionKey();
		const rows = await sql<Array<{ user_id: string; username: string | null; email: string | null }>>`
			select
				au.id::text as user_id,
				au.username,
				coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as email
			from app_user au
			where au.id = ${session.userId}::uuid
			limit 1
		`;
		const user = rows[0];
		if (!user?.user_id) {
			return new Response(JSON.stringify({ authenticated: false }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}

		return new Response(JSON.stringify({
			authenticated: true,
			user: {
				id: user.user_id,
				username: String(user.username || ""),
				email: String(user.email || "")
			}
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			authenticated: false,
			error: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
