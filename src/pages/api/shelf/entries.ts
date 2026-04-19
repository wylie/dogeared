import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveActiveUserId } from "../../../lib/auth";

export const prerender = false;

type ShelfStatus = "want_to_read" | "reading" | "finished";

type ShelfEntryInput = {
	title?: unknown;
	author?: unknown;
	status?: unknown;
	totalPages?: unknown;
	currentPage?: unknown;
	finishedDate?: unknown;
	coverUrl?: unknown;
	format?: unknown;
	language?: unknown;
	isbn10?: unknown;
	isbn13?: unknown;
	publisher?: unknown;
	publishedDate?: unknown;
	categories?: unknown;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeStatus(value: unknown): ShelfStatus {
	const input = String(value || "").trim();
	if (input === "reading" || input === "finished") return input;
	return "want_to_read";
}

function normalizePositiveInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function normalizeIsbn(value: unknown) {
	return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function slugify(value: string) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function canonicalizeTitle(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)/g, " ")
		.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)\b/g, " ")
		.split(":")[0]
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalizeAuthor(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/^(by\s+)/, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalWorkKey(input: { title: string; author: string; isbn10: string; isbn13: string }) {
	if (input.isbn13) return `isbn13:${input.isbn13}`;
	if (input.isbn10) return `isbn10:${input.isbn10}`;
	const title = canonicalizeTitle(input.title) || "untitled";
	const author = canonicalizeAuthor(input.author) || "unknown";
	return `title_author:${title}|${author}`;
}

function parseGenres(input: unknown) {
	const values = Array.isArray(input) ? input : [];
	const dedupe = new Set<string>();
	const genres: Array<{ slug: string; name: string }> = [];
	for (const raw of values) {
		const name = String(raw || "").trim();
		if (!name) continue;
		const slug = slugify(name);
		if (!slug || dedupe.has(slug)) continue;
		dedupe.add(slug);
		genres.push({ slug, name });
	}
	if (genres.length === 0) {
		genres.push({ slug: "general", name: "General" });
	}
	return genres;
}

export const GET: APIRoute = async ({ request, url }) => {
	const userKey = normalizeText(url.searchParams.get("userKey"));

	try {
		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) {
			return new Response(JSON.stringify({ entries: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}
		const sql = getNeonSql();
		const rows = await sql<Array<{
			book_id: number;
			title: string;
			primary_author: string;
			cover_url: string;
			language: string;
			status: ShelfStatus;
			total_pages: number;
			current_page: number;
			finished_date: string | null;
			first_added_at: string;
			updated_at: string;
			genres: string[] | null;
			isbn10: string;
			isbn13: string;
		}>>`
			select
				b.id as book_id,
				b.title,
				b.primary_author,
				b.cover_url,
				b.language,
				ub.status,
				ub.total_pages,
				ub.current_page,
				ub.finished_date::text as finished_date,
				ub.first_added_at::text as first_added_at,
				ub.updated_at::text as updated_at,
				array_agg(bg.genre_name order by bg.genre_name asc) filter (where bg.genre_name is not null) as genres,
				b.isbn10,
				b.isbn13
			from user_book ub
			join book b on b.id = ub.book_id
			left join book_genre bg on bg.book_id = b.id
			where ub.user_id = ${userId}::uuid
			group by b.id, ub.status, ub.total_pages, ub.current_page, ub.finished_date, ub.first_added_at, ub.updated_at
			order by ub.updated_at desc
		`;

		const entries = rows.map((row) => ({
			id: `book_${row.book_id}`,
			title: row.title,
			author: row.primary_author || "",
			status: row.status,
			totalPages: normalizePositiveInt(row.total_pages),
			currentPage: normalizePositiveInt(row.current_page),
			finishedDate: row.finished_date || "",
			addedAt: Date.parse(row.first_added_at || "") || Date.now(),
			coverUrl: row.cover_url || "",
			format: "",
			language: row.language || "",
			isbn10: row.isbn10 || "",
			isbn13: row.isbn13 || "",
			categories: Array.isArray(row.genres) ? row.genres : [],
			updatedAt: Date.parse(row.updated_at || "") || Date.now()
		}));

		return new Response(JSON.stringify({ entries }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to load shelf entries.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json() as { userKey?: unknown; entry?: ShelfEntryInput };
		const userKey = normalizeText(body?.userKey);
		const entry = body?.entry || {};
		const title = normalizeText(entry.title);
		if (!title) {
			return new Response(JSON.stringify({ error: "Missing title." }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}

		const author = normalizeText(entry.author);
		const status = normalizeStatus(entry.status);
		const totalPages = normalizePositiveInt(entry.totalPages);
		const currentPage = normalizePositiveInt(entry.currentPage);
		const finishedDateRaw = normalizeText(entry.finishedDate);
		const finishedDate = status === "finished" && finishedDateRaw ? finishedDateRaw : "";
		const coverUrl = normalizeText(entry.coverUrl);
		const language = normalizeText(entry.language);
		const isbn10 = normalizeIsbn(entry.isbn10);
		const isbn13 = normalizeIsbn(entry.isbn13);
		const publishedDate = normalizeText(entry.publishedDate);
		const publishedYearMatch = publishedDate.match(/\d{4}/);
		const publishedYear = publishedYearMatch ? Number(publishedYearMatch[0]) : null;
		const genres = parseGenres(entry.categories);
		const workKey = canonicalWorkKey({ title, author, isbn10, isbn13 });

		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) throw new Error("User resolution failed.");
		const sql = getNeonSql();

		const bookRows = await sql<{ id: number }[]>`
			insert into book (
				canonical_work_key,
				title,
				primary_author,
				isbn13,
				isbn10,
				cover_url,
				language,
				published_year
			)
			values (
				${workKey},
				${title},
				${author},
				${isbn13},
				${isbn10},
				${coverUrl},
				${language},
				${publishedYear}
			)
			on conflict (canonical_work_key) do update set
				title = excluded.title,
				primary_author = excluded.primary_author,
				isbn13 = case when excluded.isbn13 <> '' then excluded.isbn13 else book.isbn13 end,
				isbn10 = case when excluded.isbn10 <> '' then excluded.isbn10 else book.isbn10 end,
				cover_url = case when excluded.cover_url <> '' then excluded.cover_url else book.cover_url end,
				language = case when excluded.language <> '' then excluded.language else book.language end,
				published_year = coalesce(excluded.published_year, book.published_year),
				updated_at = now()
			returning id
		`;

		const bookId = Number(bookRows[0]?.id || 0);
		if (!bookId) throw new Error("Book upsert failed.");

		for (const genre of genres) {
			await sql`
				insert into book_genre (book_id, genre_slug, genre_name)
				values (${bookId}, ${genre.slug}, ${genre.name})
				on conflict (book_id, genre_slug) do update set
					genre_name = excluded.genre_name
			`;
		}

		await sql`
			insert into user_book (
				user_id,
				book_id,
				status,
				total_pages,
				current_page,
				finished_date,
				first_added_at,
				updated_at
			)
			values (
				${userId}::uuid,
				${bookId},
				${status},
				${totalPages},
				${currentPage},
				${finishedDate ? finishedDate : null}::date,
				now(),
				now()
			)
			on conflict (user_id, book_id) do update set
				status = excluded.status,
				total_pages = excluded.total_pages,
				current_page = excluded.current_page,
				finished_date = excluded.finished_date,
				updated_at = now()
		`;

		return new Response(JSON.stringify({ ok: true, bookId }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to save shelf entry.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const body = await request.json() as { userKey?: unknown; entry?: ShelfEntryInput };
		const userKey = normalizeText(body?.userKey);
		const entry = body?.entry || {};
		const title = normalizeText(entry.title);
		const author = normalizeText(entry.author);
		const isbn10 = normalizeIsbn(entry.isbn10);
		const isbn13 = normalizeIsbn(entry.isbn13);
		const workKey = canonicalWorkKey({ title, author, isbn10, isbn13 });

		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) throw new Error("User resolution failed.");
		const sql = getNeonSql();
		await sql`
			delete from user_book ub
			using book b
			where ub.book_id = b.id
				and ub.user_id = ${userId}::uuid
				and b.canonical_work_key = ${workKey}
		`;

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to delete shelf entry.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
