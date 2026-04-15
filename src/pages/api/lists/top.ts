import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

type TopListRow = {
	book_id: number;
	title: string;
	primary_author: string;
	cover_url: string;
	score: number | string;
	reader_count: number;
	reading_count: number;
	want_to_read_count: number;
	finished_count: number;
	last_activity_at: string;
};

function normalizeGenreSlug(value: string) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function toInt(value: string, fallback: number, min: number, max: number) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(min, Math.min(max, parsed));
}

export const GET: APIRoute = async ({ url }) => {
	const genre = normalizeGenreSlug(String(url.searchParams.get("genre") || ""));
	const limit = toInt(String(url.searchParams.get("limit") || ""), 20, 1, 50);
	const windowDays = toInt(String(url.searchParams.get("windowDays") || ""), 120, 1, 3650);

	if (!genre) {
		return new Response(JSON.stringify({ error: "Missing required query param: genre" }), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
	}

	try {
		const sql = getNeonSql();
		const rows = await sql<TopListRow[]>`
			select
				book_id,
				title,
				primary_author,
				cover_url,
				score,
				reader_count,
				reading_count,
				want_to_read_count,
				finished_count,
				last_activity_at
			from get_top_books_by_genre(${genre}, ${limit}, ${windowDays})
		`;

		const items = rows.map((row) => ({
			bookId: row.book_id,
			title: row.title,
			author: row.primary_author,
			coverUrl: row.cover_url,
			score: Number(row.score) || 0,
			readers: row.reader_count,
			breakdown: {
				reading: row.reading_count,
				wantToRead: row.want_to_read_count,
				finished: row.finished_count
			},
			lastActivityAt: row.last_activity_at
		}));

		return new Response(JSON.stringify({
			genre,
			limit,
			windowDays,
			count: items.length,
			items
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Top list query failed.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
