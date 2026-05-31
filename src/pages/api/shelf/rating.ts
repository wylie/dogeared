import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { monitorEvent } from "../../../lib/monitoring";

export const prerender = false;

function normalizeRating(value: unknown) {
	if (value === null || value === undefined || String(value).trim() === "") return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export const PATCH: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			monitorEvent("rating.save.unauthorized", {}, "warn");
			return new Response(JSON.stringify({ error: "You must be logged in to rate books." }), {
				status: 401,
				headers: { "Content-Type": "application/json" }
			});
		}

		const body = await request.json().catch(() => ({})) as { bookId?: unknown; rating?: unknown };
		const bookId = Math.max(0, Number(body.bookId || 0) || 0);
		if (!bookId) {
			monitorEvent("rating.save.invalid_book", {}, "warn");
			return new Response(JSON.stringify({ error: "Missing book." }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}
		const rating = normalizeRating(body.rating);
		const sql = getNeonSql();
		await sql`alter table user_book add column if not exists rating int`;

		const existingRows = await sql<Array<{ rating: number | null }>>`
			select rating
			from user_book
			where user_id = ${session.userId}::uuid
				and book_id = ${bookId}
			limit 1
		`;
		if (existingRows.length === 0) {
			monitorEvent("rating.save.missing_shelf_entry", { userId: session.userId, bookId }, "warn");
			return new Response(JSON.stringify({ error: "Add this book to your shelf before rating it." }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}
		const previousRating = normalizeRating(existingRows[0]?.rating);

		await sql`
			update user_book
			set rating = ${rating}, updated_at = now()
			where user_id = ${session.userId}::uuid
				and book_id = ${bookId}
		`;

		if (rating !== null && previousRating !== rating) {
			await sql`
				insert into user_activity (user_id, book_id, event_type, rating)
				values (${session.userId}::uuid, ${bookId}, 'rating', ${rating})
			`;
		}
		monitorEvent("rating.save.success", { userId: session.userId, bookId, rating: rating ?? 0, previousRating: previousRating ?? 0 });

		const aggregateRows = await sql<Array<{ average_rating: number | null; rating_count: number }>>`
			select
				round(avg(rating)::numeric, 1) as average_rating,
				count(*) filter (where rating is not null)::int as rating_count
			from user_book
			where book_id = ${bookId}
		`;

		return new Response(JSON.stringify({
			ok: true,
			bookId,
			rating,
			previousRating,
			averageRating: Number(aggregateRows[0]?.average_rating || 0),
			ratingCount: Number(aggregateRows[0]?.rating_count || 0)
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		monitorEvent("rating.save.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		return new Response(JSON.stringify({
			error: "Failed to save rating.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
