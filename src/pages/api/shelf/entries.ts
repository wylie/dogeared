import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";
import { fromShelfEntryInput } from "../../../lib/bookPayload";
import { ensureAuthorEnriched } from "../../../lib/authorEnrichment";
import {
	normalizeCatalogText,
	normalizeCatalogIsbn,
	canonicalCatalogWorkKey,
	canonicalizeCatalogTitle,
	canonicalizeCatalogAuthor,
	resolveBestCatalogBookId,
	upsertBookSources,
	type CatalogSourceInput
} from "../../../lib/catalog";
import { normalizeGenreList } from "../../../lib/genres";
import { normalizeTopicTagList } from "../../../lib/genres";

export const prerender = false;

type ShelfStatus = "want_to_read" | "reading" | "finished";

type ShelfEntryInput = {
	title?: unknown;
	author?: unknown;
	description?: unknown;
	status?: unknown;
	rating?: unknown;
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
	source?: unknown;
	sourceWorkId?: unknown;
	sourceEditionId?: unknown;
	sourceUrl?: unknown;
	googleBooksId?: unknown;
};

const GOOGLE_BOOKS_API_KEY = normalizeCatalogText(import.meta.env.GOOGLE_BOOKS_API_KEY);

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

function normalizeRating(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function normalizeIsbn(value: unknown) {
	return normalizeCatalogIsbn(value);
}

function parseGenres(input: unknown) {
	return normalizeGenreList(input, 8);
}

function scoreGoogleVolume(
	volume: { id?: string; volumeInfo?: { title?: string; authors?: string[]; categories?: string[] } } | null | undefined,
	input: { title: string; author: string; googleBooksId: string }
) {
	if (!volume) return -1;
	const info = volume.volumeInfo || {};
	const title = canonicalizeCatalogTitle(info.title || "");
	const author = canonicalizeCatalogAuthor(Array.isArray(info.authors) ? info.authors[0] : "");
	const targetTitle = canonicalizeCatalogTitle(input.title);
	const targetAuthor = canonicalizeCatalogAuthor(input.author);
	let score = 0;
	if (title && targetTitle && title === targetTitle) score += 120;
	if (title && targetTitle && title.includes(targetTitle)) score += 80;
	if (targetTitle && title && targetTitle.includes(title)) score += 60;
	if (author && targetAuthor && author === targetAuthor) score += 70;
	if (author && targetAuthor && author.includes(targetAuthor)) score += 35;
	if (Array.isArray(info.categories) && info.categories.length > 0) score += 40;
	if (input.googleBooksId && String(volume.id || "").trim() === input.googleBooksId) score += 160;
	return score;
}

async function fetchGoogleBooksJson(url: string) {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

function scoreOpenLibraryDoc(
	doc: { title?: string; author_name?: string[]; subject?: string[]; subject_facet?: string[] } | null | undefined,
	input: { title: string; author: string }
) {
	if (!doc) return -1;
	const title = canonicalizeCatalogTitle(doc.title || "");
	const author = canonicalizeCatalogAuthor(Array.isArray(doc.author_name) ? doc.author_name[0] : "");
	const targetTitle = canonicalizeCatalogTitle(input.title);
	const targetAuthor = canonicalizeCatalogAuthor(input.author);
	let score = 0;
	if (title && targetTitle && title === targetTitle) score += 120;
	if (title && targetTitle && title.includes(targetTitle)) score += 80;
	if (targetTitle && title && targetTitle.includes(title)) score += 60;
	if (author && targetAuthor && author === targetAuthor) score += 70;
	if (author && targetAuthor && author.includes(targetAuthor)) score += 35;
	if (Array.isArray(doc.subject) && doc.subject.length > 0) score += 40;
	if (Array.isArray(doc.subject_facet) && doc.subject_facet.length > 0) score += 25;
	return score;
}

async function fetchOpenLibraryDocs(query: Record<string, string>) {
	try {
		const params = new URLSearchParams({ ...query, limit: "8" });
		const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
		if (!response.ok) return [];
		const data = await response.json();
		return Array.isArray(data?.docs) ? data.docs : [];
	} catch {
		return [];
	}
}

function normalizeOpenLibraryWorkKey(value: unknown) {
	const raw = normalizeText(value);
	const match = raw.match(/OL[0-9A-Z]+W/i);
	return match ? match[0] : "";
}

async function fetchOpenLibraryWorkSubjects(workKey: string) {
	const key = normalizeOpenLibraryWorkKey(workKey);
	if (!key) return [];
	try {
		const response = await fetch(`https://openlibrary.org/works/${encodeURIComponent(key)}.json`);
		if (!response.ok) return [];
		const data = await response.json();
		return parseGenres(data?.subjects || []);
	} catch {
		return [];
	}
}

async function inferGenresForBook(input: {
	title: string;
	author: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
}) {
	if (!GOOGLE_BOOKS_API_KEY) return [] as Array<{ slug: string; name: string }>;
	const queries: string[] = [];
	if (input.googleBooksId) {
		const params = new URLSearchParams({ key: GOOGLE_BOOKS_API_KEY });
		const direct = await fetchGoogleBooksJson(
			`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(input.googleBooksId)}?${params.toString()}`
		);
		const directGenres = parseGenres(direct?.volumeInfo?.categories || []);
		if (directGenres.length > 0) return directGenres.slice(0, 8);
	}
	if (input.isbn13) queries.push(`isbn:${input.isbn13}`);
	if (input.isbn10) queries.push(`isbn:${input.isbn10}`);
	if (input.title && input.author) queries.push(`intitle:${input.title} inauthor:${input.author}`);
	if (input.title) queries.push(`intitle:${input.title}`);

	let bestVolume: { id?: string; volumeInfo?: { title?: string; authors?: string[]; categories?: string[] } } | null = null;
	let bestScore = -1;

	for (const query of queries) {
		const params = new URLSearchParams({
			key: GOOGLE_BOOKS_API_KEY,
			q: query,
			maxResults: "5",
			printType: "books"
		});
		const data = await fetchGoogleBooksJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
		const items = Array.isArray(data?.items) ? data.items : [];
		for (const item of items) {
			const score = scoreGoogleVolume(item, input);
			if (score > bestScore) {
				bestScore = score;
				bestVolume = item;
			}
		}
	}

	const googleGenres = parseGenres(bestVolume?.volumeInfo?.categories || []);
	if (googleGenres.length > 0) return googleGenres.slice(0, 8);

	const openQueries: Array<Record<string, string>> = [];
	if (input.isbn13) openQueries.push({ isbn: input.isbn13 });
	if (input.isbn10) openQueries.push({ isbn: input.isbn10 });
	if (input.title && input.author) openQueries.push({ title: input.title, author: input.author });
	if (input.title) openQueries.push({ title: input.title });

	let bestDoc: { key?: string; title?: string; author_name?: string[]; subject?: string[]; subject_facet?: string[] } | null = null;
	let bestDocScore = -1;
	for (const query of openQueries) {
		const docs = await fetchOpenLibraryDocs(query);
		for (const doc of docs) {
			const score = scoreOpenLibraryDoc(doc, { title: input.title, author: input.author });
			if (score > bestDocScore) {
				bestDocScore = score;
				bestDoc = doc;
			}
		}
	}
	if (!bestDoc) return [];
	const subjects = Array.isArray(bestDoc.subject) && bestDoc.subject.length > 0
		? bestDoc.subject
		: (Array.isArray(bestDoc.subject_facet) ? bestDoc.subject_facet : []);
	const direct = parseGenres(subjects).slice(0, 8);
	if (direct.length > 0) return direct;
	return (await fetchOpenLibraryWorkSubjects(bestDoc.key || "")).slice(0, 8);
}

async function inferMetadataForBook(input: {
	title: string;
	author: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
}) {
	const out = {
		synopsis: "",
		coverUrl: "",
		language: "",
		publishedYear: null as number | null,
		isbn10: "",
		isbn13: "",
		googleBooksId: ""
	};

	const queryParts = [
		input.isbn13 ? `isbn:${input.isbn13}` : "",
		input.isbn10 ? `isbn:${input.isbn10}` : "",
		input.title && input.author ? `intitle:${input.title} inauthor:${input.author}` : "",
		input.title ? `intitle:${input.title}` : ""
	].filter(Boolean);

	if (GOOGLE_BOOKS_API_KEY) {
		let bestVolume: any = null;
		let bestScore = -1;
		if (input.googleBooksId) {
			const params = new URLSearchParams({ key: GOOGLE_BOOKS_API_KEY });
			const direct = await fetchGoogleBooksJson(
				`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(input.googleBooksId)}?${params.toString()}`
			);
			if (direct?.volumeInfo) {
				bestVolume = direct;
				bestScore = scoreGoogleVolume(direct, input);
			}
		}
		for (const q of queryParts) {
			const params = new URLSearchParams({
				key: GOOGLE_BOOKS_API_KEY,
				q,
				maxResults: "5",
				printType: "books"
			});
			const data = await fetchGoogleBooksJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
			const items = Array.isArray(data?.items) ? data.items : [];
			for (const item of items) {
				const score = scoreGoogleVolume(item, input);
				if (score > bestScore) {
					bestScore = score;
					bestVolume = item;
				}
			}
		}
		const info = bestVolume?.volumeInfo || {};
		const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
		const matchedIsbn13 = normalizeIsbn(ids.find((id: any) => String(id?.type || "") === "ISBN_13")?.identifier || "");
		const matchedIsbn10 = normalizeIsbn(ids.find((id: any) => String(id?.type || "") === "ISBN_10")?.identifier || "");
		const publishedMatch = String(info.publishedDate || "").match(/\d{4}/);
		out.synopsis = normalizeText(info.description);
		out.coverUrl = normalizeText(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail);
		out.language = normalizeText(info.language);
		out.publishedYear = publishedMatch ? Number(publishedMatch[0]) : null;
		out.isbn13 = matchedIsbn13;
		out.isbn10 = matchedIsbn10;
		out.googleBooksId = normalizeCatalogText(bestVolume?.id || "");
	}

	if ((!out.synopsis || !out.coverUrl || !out.publishedYear) && (input.isbn13 || input.isbn10)) {
		const bibkey = input.isbn13 ? `ISBN:${input.isbn13}` : `ISBN:${input.isbn10}`;
		try {
			const response = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibkey)}&format=json&jscmd=data`);
			if (response.ok) {
				const data = await response.json();
				const row = data?.[bibkey];
				if (row) {
					if (!out.synopsis) out.synopsis = normalizeText(typeof row.description === "string" ? row.description : row.description?.value);
					if (!out.coverUrl) out.coverUrl = normalizeText(row.cover?.large || row.cover?.medium || row.cover?.small);
					if (!out.publishedYear) {
						const y = normalizeText(row.publish_date).match(/\d{4}/);
						out.publishedYear = y ? Number(y[0]) : null;
					}
				}
			}
		} catch {
			// best effort enrichment only
		}
	}

	return out;
}

async function ensureShelfSchema() {
	const sql = getNeonSql();
	await sql`alter table user_book add column if not exists rating int`;
	await sql`alter table book add column if not exists synopsis text not null default ''`;
	await sql`
		create table if not exists book_tag (
			book_id bigint not null references book(id) on delete cascade,
			tag_slug text not null,
			tag_name text not null,
			primary key (book_id, tag_slug)
		)
	`;
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		await ensureShelfSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return new Response(JSON.stringify({ error: "You must be logged in to load shelf entries." }), { status: 401, headers: { "Content-Type": "application/json" } });
		const userId = session.userId;
		const sql = getNeonSql();
		const rows = await sql<Array<{
			book_id: number;
			title: string;
			primary_author: string;
			cover_url: string;
			language: string;
			status: ShelfStatus;
			rating: number | null;
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
				ub.rating,
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
			group by b.id, ub.status, ub.rating, ub.total_pages, ub.current_page, ub.finished_date, ub.first_added_at, ub.updated_at
			order by ub.updated_at desc
		`;

		const entries = rows.map((row) => ({
			id: `book_${row.book_id}`,
			title: row.title,
			author: row.primary_author || "",
			status: row.status,
			rating: normalizeRating(row.rating),
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
		await ensureShelfSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return new Response(JSON.stringify({ error: "You must be logged in to save shelf entries." }), { status: 401, headers: { "Content-Type": "application/json" } });
		const body = await request.json() as { entry?: ShelfEntryInput };
		const entry = body?.entry || {};
		const bookPayload = fromShelfEntryInput(entry);
		const title = bookPayload.title;
		if (!title) {
			return new Response(JSON.stringify({ error: "Missing title." }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}

		const author = bookPayload.author;
		const authorId = await ensureAuthorEnriched(author);
		const status = normalizeStatus(entry.status);
		const rating = status === "finished" ? normalizeRating(entry.rating) : null;
		const totalPages = normalizePositiveInt(entry.totalPages);
		const currentPage = normalizePositiveInt(entry.currentPage);
		const finishedDateRaw = normalizeText(entry.finishedDate);
		const finishedDate = status === "finished" && finishedDateRaw ? finishedDateRaw : "";
		let coverUrl = bookPayload.coverUrl;
		let language = bookPayload.language;
		let synopsis = bookPayload.description;
		let isbn10 = bookPayload.isbn10;
		let isbn13 = bookPayload.isbn13;
		const publishedDate = bookPayload.publishedDate;
		const publishedYearMatch = publishedDate.match(/\d{4}/);
		let publishedYear = publishedYearMatch ? Number(publishedYearMatch[0]) : null;
		const genres = parseGenres(bookPayload.categories);
		const tags = normalizeTopicTagList(bookPayload.categories, 12);
		let googleBooksId = bookPayload.googleBooksId;
		if (!synopsis || !coverUrl || !publishedYear || !language || (!isbn10 && !isbn13) || !googleBooksId) {
			const enriched = await inferMetadataForBook({ title, author, isbn10, isbn13, googleBooksId });
			if (!synopsis) synopsis = enriched.synopsis || synopsis;
			if (!coverUrl) coverUrl = enriched.coverUrl || coverUrl;
			if (!language) language = enriched.language || language;
			if (!publishedYear) publishedYear = enriched.publishedYear || publishedYear;
			if (!isbn13) isbn13 = enriched.isbn13 || isbn13;
			if (!isbn10) isbn10 = enriched.isbn10 || isbn10;
			if (!googleBooksId) googleBooksId = enriched.googleBooksId || googleBooksId;
		}
		const workKey = canonicalCatalogWorkKey({ title, author, isbn10, isbn13 });
		const source = normalizeCatalogText(entry.source);
		const sourceWorkId = normalizeCatalogText(entry.sourceWorkId);
		const sourceEditionId = normalizeCatalogText(entry.sourceEditionId);
		const sourceUrl = normalizeCatalogText(entry.sourceUrl);
		const sources: CatalogSourceInput[] = [];
		if (googleBooksId) {
			sources.push({
				source: "google_books",
				sourceWorkId: googleBooksId,
				sourceUrl: sourceUrl || "https://books.google.com/"
			});
		}
		if (source === "open_library" && (sourceWorkId || sourceEditionId)) {
			sources.push({
				source: "open_library",
				sourceWorkId,
				sourceEditionId,
				sourceUrl
			});
		}
		if (source === "nyt" && sourceWorkId) {
			sources.push({
				source: "nyt",
				sourceWorkId,
				sourceUrl
			});
		}
		const userId = session.userId;
		const sql = getNeonSql();
		const resolvedBookId = await resolveBestCatalogBookId(sql, {
			canonicalWorkKey: workKey,
			title,
			author,
			isbn10,
			isbn13,
			googleBooksId,
			sources
		});

		const previousRows = await sql<Array<{ status: ShelfStatus; rating: number | null }>>`
			select status, rating
			from user_book
			where user_id = ${userId}::uuid
				and book_id = ${resolvedBookId || 0}
			limit 1
		`;
		const previousStatus = String(previousRows[0]?.status || "").trim() as ShelfStatus | "";
		const previousRating = normalizeRating(previousRows[0]?.rating);

		let bookId = resolvedBookId;
		if (bookId > 0) {
			await sql`
				update book
				set
					title = ${title},
					primary_author = ${author},
					author_id = case when ${authorId} > 0 then ${authorId} else book.author_id end,
					isbn13 = case when ${isbn13} <> '' then ${isbn13} else book.isbn13 end,
					isbn10 = case when ${isbn10} <> '' then ${isbn10} else book.isbn10 end,
					google_books_id = case when ${googleBooksId} <> '' then ${googleBooksId} else book.google_books_id end,
					synopsis = case when ${synopsis} <> '' then ${synopsis} else book.synopsis end,
					cover_url = case when ${coverUrl} <> '' then ${coverUrl} else book.cover_url end,
					language = case when ${language} <> '' then ${language} else book.language end,
					published_year = coalesce(${publishedYear}, book.published_year),
					updated_at = now()
				where id = ${bookId}
			`;
		} else {
			const bookRows = await sql<{ id: number }[]>`
				insert into book (
					canonical_work_key,
					title,
					primary_author,
					author_id,
					isbn13,
					isbn10,
					google_books_id,
					synopsis,
					cover_url,
					language,
					published_year
				)
				values (
					${workKey},
					${title},
					${author},
					${authorId > 0 ? authorId : null},
					${isbn13},
					${isbn10},
					${googleBooksId},
					${synopsis},
					${coverUrl},
					${language},
					${publishedYear}
				)
				on conflict (canonical_work_key) do update set
					title = excluded.title,
					primary_author = excluded.primary_author,
					author_id = coalesce(excluded.author_id, book.author_id),
					isbn13 = case when excluded.isbn13 <> '' then excluded.isbn13 else book.isbn13 end,
					isbn10 = case when excluded.isbn10 <> '' then excluded.isbn10 else book.isbn10 end,
					google_books_id = case when excluded.google_books_id <> '' then excluded.google_books_id else book.google_books_id end,
					synopsis = case when excluded.synopsis <> '' then excluded.synopsis else book.synopsis end,
					cover_url = case when excluded.cover_url <> '' then excluded.cover_url else book.cover_url end,
					language = case when excluded.language <> '' then excluded.language else book.language end,
					published_year = coalesce(excluded.published_year, book.published_year),
					updated_at = now()
				returning id
			`;
			bookId = Number(bookRows[0]?.id || 0);
		}
		if (!bookId) throw new Error("Book upsert failed.");
		await upsertBookSources(sql, bookId, sources);

		for (const genre of genres) {
			await sql`
				insert into book_genre (book_id, genre_slug, genre_name)
				values (${bookId}, ${genre.slug}, ${genre.name})
				on conflict (book_id, genre_slug) do update set
					genre_name = excluded.genre_name
			`;
		}
		for (const tag of tags) {
			await sql`
				insert into book_tag (book_id, tag_slug, tag_name)
				values (${bookId}, ${tag.slug}, ${tag.name})
				on conflict (book_id, tag_slug) do update set
					tag_name = excluded.tag_name
			`;
		}

		if (genres.length === 0) {
			const genreCountRows = await sql<Array<{ count: number }>>`
				select count(*)::int as count
				from book_genre
				where book_id = ${bookId}
			`;
			const hasAnyGenres = Number(genreCountRows[0]?.count || 0) > 0;
			if (!hasAnyGenres) {
				const inferredGenres = await inferGenresForBook({ title, author, isbn10, isbn13, googleBooksId });
				for (const genre of inferredGenres) {
					await sql`
						insert into book_genre (book_id, genre_slug, genre_name)
						values (${bookId}, ${genre.slug}, ${genre.name})
						on conflict (book_id, genre_slug) do update set
							genre_name = excluded.genre_name
					`;
				}
			}
		}

		await sql`
			insert into user_book (
				user_id,
				book_id,
				status,
				rating,
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
				${rating},
				${totalPages},
				${currentPage},
				${finishedDate ? finishedDate : null}::date,
				now(),
				now()
			)
			on conflict (user_id, book_id) do update set
				status = excluded.status,
				rating = excluded.rating,
				total_pages = excluded.total_pages,
				current_page = excluded.current_page,
				finished_date = excluded.finished_date,
				updated_at = now()
		`;

		if (!previousStatus || previousStatus !== status) {
			await sql`
				insert into user_activity (
					user_id,
					book_id,
					event_type
				)
				values (
					${userId}::uuid,
					${bookId},
					${status}
				)
			`;
		}

		if (rating !== null && previousRating !== rating) {
			await sql`
				insert into user_activity (
					user_id,
					book_id,
					event_type,
					rating
				)
				values (
					${userId}::uuid,
					${bookId},
					'rating',
					${rating}
				)
			`;
		}

		const persistedRows = await sql<Array<{
			book_id: number;
			title: string;
			primary_author: string;
			cover_url: string;
			language: string;
			status: ShelfStatus;
			rating: number | null;
			total_pages: number;
			current_page: number;
			finished_date: string | null;
			first_added_at: string;
			updated_at: string;
			genres: string[] | null;
			isbn10: string;
			isbn13: string;
			google_books_id: string;
			publisher: string | null;
			synopsis: string;
		}>>`
			select
				b.id as book_id,
				b.title,
				b.primary_author,
				b.cover_url,
				b.language,
				ub.status,
				ub.rating,
				ub.total_pages,
				ub.current_page,
				ub.finished_date::text as finished_date,
				ub.first_added_at::text as first_added_at,
				ub.updated_at::text as updated_at,
				array_agg(bg.genre_name order by bg.genre_name asc) filter (where bg.genre_name is not null) as genres,
				b.isbn10,
				b.isbn13,
				b.google_books_id,
				null::text as publisher,
				coalesce(b.synopsis, '') as synopsis
			from user_book ub
			join book b on b.id = ub.book_id
			left join book_genre bg on bg.book_id = b.id
			where ub.user_id = ${userId}::uuid
				and ub.book_id = ${bookId}
			group by b.id, ub.status, ub.rating, ub.total_pages, ub.current_page, ub.finished_date, ub.first_added_at, ub.updated_at
			limit 1
		`;
		const persisted = persistedRows[0];
		const persistedEntry = persisted ? {
			id: `book_${persisted.book_id}`,
			bookId: Number(persisted.book_id || 0),
			title: persisted.title || "",
			author: persisted.primary_author || "",
			status: persisted.status,
			rating: normalizeRating(persisted.rating),
			totalPages: normalizePositiveInt(persisted.total_pages),
			currentPage: normalizePositiveInt(persisted.current_page),
			finishedDate: persisted.finished_date || "",
			addedAt: Date.parse(persisted.first_added_at || "") || Date.now(),
			coverUrl: persisted.cover_url || "",
			format: "",
			language: persisted.language || "",
			isbn10: persisted.isbn10 || "",
			isbn13: persisted.isbn13 || "",
			googleBooksId: persisted.google_books_id || "",
			publisher: persisted.publisher || "",
			description: persisted.synopsis || "",
			categories: Array.isArray(persisted.genres) ? persisted.genres : [],
			updatedAt: Date.parse(persisted.updated_at || "") || Date.now()
		} : null;

		return new Response(JSON.stringify({ ok: true, bookId, entry: persistedEntry }), {
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
		await ensureShelfSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return new Response(JSON.stringify({ error: "You must be logged in to delete shelf entries." }), { status: 401, headers: { "Content-Type": "application/json" } });
		const body = await request.json() as { entry?: ShelfEntryInput };
		const entry = body?.entry || {};
		const title = normalizeText(entry.title);
		const author = normalizeText(entry.author);
		const isbn10 = normalizeIsbn(entry.isbn10);
		const isbn13 = normalizeIsbn(entry.isbn13);
		const workKey = canonicalCatalogWorkKey({ title, author, isbn10, isbn13 });

		const userId = session.userId;
		const sql = getNeonSql();
		const googleBooksId = normalizeCatalogText(entry.googleBooksId);
		const bookId = await resolveBestCatalogBookId(sql, {
			canonicalWorkKey: workKey,
			title,
			author,
			isbn10,
			isbn13,
			googleBooksId
		});
		await sql`
			delete from user_book ub
			where ub.user_id = ${userId}::uuid
				and ub.book_id = ${bookId || 0}
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
