import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { getEncryptionKey, resolveActiveUserId } from "../../../lib/auth";

export const prerender = false;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export const GET: APIRoute = async ({ request, url }) => {
	const userKey = normalizeText(url.searchParams.get("userKey"));
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20));

	try {
		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) {
			return new Response(JSON.stringify({ updates: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}

		const sql = getNeonSql();
		const encryptionKey = getEncryptionKey();
		const rows = await sql<Array<{
			event_type: string;
			rating: number | null;
			created_at: string;
			title: string;
			primary_author: string;
			cover_url: string;
			language: string;
			username: string | null;
			email_local: string | null;
		}>>`
			select
				ua.event_type,
				ua.rating,
				ua.created_at::text as created_at,
				b.title,
				b.primary_author,
				b.cover_url,
				b.language,
				au.username,
				nullif(split_part(coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), ''), '@', 1), '') as email_local
			from user_activity ua
			join book b on b.id = ua.book_id
			join app_user au on au.id = ua.user_id
			where ua.user_id = ${userId}::uuid
			order by ua.created_at desc, ua.id desc
			limit ${limit}
		`;

		const updates = rows.map((row) => ({
			status: row.event_type,
			rating: row.rating ?? 0,
			timestamp: Date.parse(row.created_at || "") || Date.now(),
			title: row.title || "",
			author: row.primary_author || "",
			coverUrl: row.cover_url || "",
			language: row.language || "",
			actorName: normalizeText(row.username) || normalizeText(row.email_local) || "A User"
		}));

		return new Response(JSON.stringify({ updates }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to load recent activity.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
