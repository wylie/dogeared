import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { ensureReviewSchema, normalizeReviewBody, normalizeReviewRating, normalizeReviewTitle } from "../../../lib/bookReviews";

export const prerender = false;

function json(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

function normalizeBookId(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.floor(parsed);
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json({ error: "You must be logged in to save a review." }, 401);
		const body = await request.json();
		const bookId = normalizeBookId(body?.bookId);
		if (!bookId) return json({ error: "Missing book." }, 400);

		const sql = getNeonSql();
		await ensureReviewSchema(sql);
		const rating = normalizeReviewRating(body?.rating);
		const title = normalizeReviewTitle(body?.title);
		const reviewBody = normalizeReviewBody(body?.body);
		const hasSpoiler = body?.spoiler === true;
		const rows = await sql<Array<{ status: string }>>`
			select status
			from user_book
			where user_id = ${session.userId}::uuid
				and book_id = ${bookId}
			limit 1
		`;
		if (rows.length === 0) return json({ error: "Add this book to your shelf before reviewing it." }, 403);
		if (String(rows[0]?.status || "") !== "finished") return json({ error: "Mark this book Read before writing a public review." }, 403);

		await sql`
			update user_book
			set
				rating = ${rating},
				review_title = ${title},
				finished_reflection = ${reviewBody},
				review_spoiler = ${hasSpoiler},
				review_updated_at = case when ${title} <> '' or ${reviewBody} <> '' then now() else review_updated_at end,
				updated_at = now()
			where user_id = ${session.userId}::uuid
				and book_id = ${bookId}
		`;
		if (rating !== null) {
			await sql`
				insert into user_activity (user_id, book_id, event_type, rating)
				values (${session.userId}::uuid, ${bookId}, 'rating', ${rating})
			`;
		}
		if (title || reviewBody) {
			await sql`
				insert into user_activity (user_id, book_id, event_type)
				values (${session.userId}::uuid, ${bookId}, 'finished')
			`;
		}
		return json({ ok: true });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "Failed to save review." }, 500);
	}
};

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json({ error: "You must be logged in to delete a review." }, 401);
		const body = request.headers.get("content-type")?.includes("application/json") ? await request.json().catch(() => ({})) : {};
		const bookId = normalizeBookId(body?.bookId || url.searchParams.get("bookId"));
		if (!bookId) return json({ error: "Missing book." }, 400);

		const sql = getNeonSql();
		await ensureReviewSchema(sql);
		const result = await sql`
			update user_book
			set
				review_title = '',
				finished_reflection = '',
				review_spoiler = false,
				review_updated_at = null,
				updated_at = now()
			where user_id = ${session.userId}::uuid
				and book_id = ${bookId}
		`;
		return json({ ok: true, deleted: Number((result as any)?.count || 0) > 0 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : "Failed to delete review." }, 500);
	}
};
