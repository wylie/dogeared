import type { APIRoute } from "astro";
import { getEncryptionKey, resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return new Response(JSON.stringify({ error: "You must be logged in to export your data." }), {
				status: 401,
				headers: { "Content-Type": "application/json" }
			});
		}

		const sql = getNeonSql();
		const encryptionKey = getEncryptionKey();

		const [userRows, shelfRows] = await Promise.all([
			sql<Array<{
				id: string;
				username: string | null;
				email: string | null;
				created_at: string | null;
				profile_data: Record<string, unknown> | null;
			}>>`
				select
					au.id::text as id,
					au.username,
					coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as email,
					au.created_at::text as created_at,
					au.profile_data
				from app_user au
				where au.id = ${session.userId}::uuid
				limit 1
			`,
			sql<Array<{
				book_id: number;
				title: string;
				author: string;
				status: string;
				rating: number | null;
				total_pages: number;
				current_page: number;
				finished_date: string | null;
				first_added_at: string | null;
				updated_at: string | null;
				cover_url: string;
				language: string;
				isbn10: string;
				isbn13: string;
				genres: string[] | null;
			}>>`
				select
					b.id as book_id,
					coalesce(b.title, '') as title,
					coalesce(b.primary_author, '') as author,
					ub.status::text as status,
					ub.rating,
					coalesce(ub.total_pages, 0)::int as total_pages,
					coalesce(ub.current_page, 0)::int as current_page,
					ub.finished_date::text as finished_date,
					ub.first_added_at::text as first_added_at,
					ub.updated_at::text as updated_at,
					coalesce(b.cover_url, '') as cover_url,
					coalesce(b.language, '') as language,
					coalesce(b.isbn10, '') as isbn10,
					coalesce(b.isbn13, '') as isbn13,
					array_agg(distinct bg.genre_name order by bg.genre_name)
						filter (where trim(coalesce(bg.genre_name, '')) <> '') as genres
				from user_book ub
				join book b on b.id = ub.book_id
				left join book_genre bg on bg.book_id = b.id
				where ub.user_id = ${session.userId}::uuid
				group by b.id, ub.status, ub.rating, ub.total_pages, ub.current_page, ub.finished_date, ub.first_added_at, ub.updated_at
				order by ub.updated_at desc nulls last
			`
		]);

		const user = userRows[0];
		if (!user?.id) {
			return new Response(JSON.stringify({ error: "Account not found." }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}

		const payload = {
			exportedAt: new Date().toISOString(),
			version: 1,
			user: {
				id: user.id,
				username: String(user.username || ""),
				email: String(user.email || ""),
				createdAt: String(user.created_at || ""),
				profile: user.profile_data || {}
			},
			shelf: shelfRows.map((row) => ({
				bookId: row.book_id,
				title: String(row.title || ""),
				author: String(row.author || ""),
				status: String(row.status || ""),
				rating: row.rating == null ? null : Number(row.rating),
				totalPages: Number(row.total_pages || 0),
				currentPage: Number(row.current_page || 0),
				finishedDate: String(row.finished_date || ""),
				firstAddedAt: String(row.first_added_at || ""),
				updatedAt: String(row.updated_at || ""),
				coverUrl: String(row.cover_url || ""),
				language: String(row.language || ""),
				isbn10: String(row.isbn10 || ""),
				isbn13: String(row.isbn13 || ""),
				genres: Array.isArray(row.genres) ? row.genres : []
			}))
		};

		return new Response(JSON.stringify(payload, null, 2), {
			status: 200,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store"
			}
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to export account data.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};

