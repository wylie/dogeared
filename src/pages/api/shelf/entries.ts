import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";
import { googleBooksCoverUrl } from "../../../lib/bookCovers";
import { fromShelfEntryInput } from "../../../lib/bookPayload";
import { ensureAuthorEnriched } from "../../../lib/authorEnrichment";
import {
	normalizeCatalogText,
	normalizeCatalogIsbn,
	canonicalCatalogWorkKey,
	canonicalizeCatalogTitle,
	canonicalizeCatalogAuthor,
	normalizeRedundantSeriesTitle,
	resolveCanonicalCatalogWork,
	resolveBestCatalogBookId,
	upsertBookSources,
	type CatalogSourceInput
} from "../../../lib/catalog";
import { normalizeGenreList } from "../../../lib/genres";
import { normalizeTopicTagList } from "../../../lib/genres";
import { ensureCustomShelfSchema } from "../../../lib/customShelves";
import { monitorEvent } from "../../../lib/monitoring";
import { ensureReviewSchema, normalizeReviewBody, normalizeReviewTitle } from "../../../lib/bookReviews";
import { ensureCanonicalWorkSchema, upsertWorkAndEdition } from "../../../lib/catalogWorks";
import { inferKnownSeriesMetadata, upsertKnownSeriesForBook } from "../../../lib/series";
import { createReadingMilestoneNotifications } from "../../../lib/notifications";
import { withSqlDebug, type SqlDebugParam } from "../../../lib/sqlDebug";
import { normalizeProgressInputMode, type ProgressInputMode } from "../../../lib/readingProgress";
import { recordPerformanceEventSafe } from "../../../lib/performanceTelemetry";

export const prerender = false;

type ShelfStatus = "want_to_read" | "reading" | "finished";

type ShelfEntryInput = {
	bookId?: unknown;
	title?: unknown;
	author?: unknown;
	description?: unknown;
	status?: unknown;
	rating?: unknown;
	totalPages?: unknown;
	currentPage?: unknown;
	preferredProgressType?: unknown;
	progressType?: unknown;
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
	finishedReflection?: unknown;
	reviewTitle?: unknown;
	reviewSpoiler?: unknown;
};

const GOOGLE_BOOKS_API_KEY = normalizeCatalogText(import.meta.env.GOOGLE_BOOKS_API_KEY);
let shelfSchemaReady: Promise<void> | null = null;

type ExistingShelfCatalogBook = {
	bookId: number;
	workId: number;
	editionId: number;
	title: string;
	author: string;
	authorId: number;
	synopsis: string;
	coverUrl: string;
	language: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	publisher: string;
	pageCount: number;
	publishedYear: number | null;
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

function normalizeCatalogPageCount(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	const rounded = Math.floor(parsed);
	return rounded > 0 ? rounded : 0;
}

function normalizeRating(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function userBookUpsertDebugParams(input: {
	userId: string;
	bookId: number;
	status: ShelfStatus;
	rating: number | null;
	effectiveTotalPages: number;
	currentPage: number;
	preferredProgressType: ProgressInputMode | "";
	finishedDate: string | null;
	finishedReflection: string;
	reviewTitle: string;
	reviewSpoiler: boolean;
	editionId: number | null;
}): SqlDebugParam[] {
	return [
		{ name: "userId", pgType: "uuid", value: input.userId },
		{ name: "bookId", pgType: "bigint", value: input.bookId },
		{ name: "status", pgType: "text", value: input.status },
		{ name: "rating", pgType: "int", value: input.rating },
		{ name: "totalPages", pgType: "int", value: input.effectiveTotalPages },
		{ name: "currentPage", pgType: "int", value: input.currentPage },
		{ name: "preferredProgressType", pgType: "text", value: input.preferredProgressType },
		{ name: "finishedDate", pgType: "date", value: input.finishedDate },
		{ name: "finishedReflection", pgType: "text", value: input.finishedReflection },
		{ name: "reviewTitle", pgType: "text", value: input.reviewTitle },
		{ name: "reviewSpoiler", pgType: "boolean", value: input.reviewSpoiler },
		{ name: "editionId", pgType: "bigint", value: input.editionId },
		{ name: "reviewTitle_presence_check", pgType: "text", value: input.reviewTitle },
		{ name: "finishedReflection_presence_check", pgType: "text", value: input.finishedReflection }
	];
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
		pageCount: 0,
		publisher: "",
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
		out.coverUrl = googleBooksCoverUrl(info.imageLinks, "card");
		out.language = normalizeText(info.language);
		out.publishedYear = publishedMatch ? Number(publishedMatch[0]) : null;
		out.pageCount = normalizeCatalogPageCount(info.pageCount);
		out.publisher = normalizeText(info.publisher);
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
					if (!out.pageCount) out.pageCount = normalizeCatalogPageCount(row.number_of_pages);
					if (!out.publisher) {
						const openPublisher = Array.isArray(row.publishers)
							? row.publishers.map((item: any) => normalizeText(item?.name || item)).find(Boolean)
							: normalizeText(row.publishers?.name || row.publishers || "");
						out.publisher = openPublisher || out.publisher;
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
	if (!shelfSchemaReady) {
		shelfSchemaReady = (async () => {
			const sql = getNeonSql();
			await ensureReviewSchema(sql);
			await sql`alter table book add column if not exists synopsis text not null default ''`;
			await sql`alter table book add column if not exists page_count int not null default 0`;
			await sql`alter table book add column if not exists publisher text not null default ''`;
			await sql`
				create table if not exists book_tag (
					book_id bigint not null references book(id) on delete cascade,
					tag_slug text not null,
					tag_name text not null,
					primary key (book_id, tag_slug)
				)
			`;
			await sql`
				create table if not exists user_reading_progress_event (
					id bigserial primary key,
					user_id uuid not null references app_user(id) on delete cascade,
					book_id bigint not null references book(id) on delete cascade,
					from_page int not null default 0,
					to_page int not null default 0,
					page_delta int not null default 0,
					recorded_at timestamptz not null default now()
				)
			`;
			await sql`create index if not exists idx_progress_event_user_recorded_at on user_reading_progress_event(user_id, recorded_at desc)`;
			await sql`alter table user_book add column if not exists preferred_progress_type text not null default 'page'`;
		})();
	}
	try {
		await shelfSchemaReady;
	} catch (error) {
		shelfSchemaReady = null;
		throw error;
	}
}

async function resolveExistingShelfCatalogBook(
	sql: ReturnType<typeof getNeonSql>,
	bookId: number
): Promise<ExistingShelfCatalogBook | null> {
	const normalizedBookId = normalizePositiveInt(bookId);
	if (normalizedBookId <= 0) return null;
	const rows = await sql<Array<{
		book_id: number;
		work_id: number | null;
		edition_id: number | null;
		title: string;
		primary_author: string;
		author_id: number | null;
		synopsis: string;
		cover_url: string;
		language: string;
		isbn10: string;
		isbn13: string;
		google_books_id: string;
		publisher: string;
		page_count: number;
		published_year: number | null;
	}>>`
		with target as (
			select id, work_id
			from book
			where id = ${normalizedBookId}
			limit 1
		),
		representative as (
			select
				b.id,
				b.work_id,
				b.author_id,
				coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
				coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
				coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
				coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
				coalesce(nullif(trim(b.language), ''), '') as language,
				coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
				coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
				coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
				coalesce(nullif(trim(b.publisher), ''), '') as publisher,
				coalesce(nullif(b.page_count, 0), 0)::int as page_count,
				b.published_year,
				coalesce(sc.shelf_count, 0)::int as shelf_count,
				coalesce(sc.rating_count, 0)::int as rating_count
			from target t
			join book b on (
				(t.work_id is not null and b.work_id = t.work_id)
				or (t.work_id is null and b.id = t.id)
			)
			left join lateral (
				select
					count(*)::int as shelf_count,
					count(*) filter (where rating is not null)::int as rating_count
				from user_book ub
				where ub.book_id = b.id
			) sc on true
			order by
				coalesce(sc.shelf_count, 0) desc,
				coalesce(sc.rating_count, 0) desc,
				(nullif(trim(coalesce(b.cover_url, '')), '') is not null) desc,
				(nullif(trim(coalesce(b.synopsis, '')), '') is not null) desc,
				b.id asc
			limit 1
		)
		select
			r.id as book_id,
			r.work_id,
			be.id as edition_id,
			r.title,
			r.primary_author,
			r.author_id,
			r.synopsis,
			r.cover_url,
			r.language,
			r.isbn10,
			r.isbn13,
			r.google_books_id,
			r.publisher,
			r.page_count,
			r.published_year
		from representative r
		left join lateral (
			select id
			from book_edition
			where book_id = r.id
			order by id asc
			limit 1
		) be on true
		limit 1
	`;
	const row = rows[0];
	if (!row) return null;
	return {
		bookId: Number(row.book_id || 0) || 0,
		workId: Number(row.work_id || 0) || 0,
		editionId: Number(row.edition_id || 0) || 0,
		title: row.title || "",
		author: row.primary_author || "",
		authorId: Number(row.author_id || 0) || 0,
		synopsis: row.synopsis || "",
		coverUrl: row.cover_url || "",
		language: row.language || "",
		isbn10: row.isbn10 || "",
		isbn13: row.isbn13 || "",
		googleBooksId: row.google_books_id || "",
		publisher: row.publisher || "",
		pageCount: normalizeCatalogPageCount(row.page_count),
		publishedYear: row.published_year ? Number(row.published_year) : null
	};
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
			preferred_progress_type: string;
			finished_date: string | null;
			finished_reflection: string;
			review_title: string;
			review_spoiler: boolean;
			review_updated_at: string | null;
			first_added_at: string;
			updated_at: string;
			progress_updates: number;
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
				coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages,
				ub.current_page,
				coalesce(nullif(trim(ub.preferred_progress_type), ''), 'page') as preferred_progress_type,
				ub.finished_date::text as finished_date,
				coalesce(ub.finished_reflection, '') as finished_reflection,
				coalesce(ub.review_title, '') as review_title,
				coalesce(ub.review_spoiler, false) as review_spoiler,
				ub.review_updated_at::text as review_updated_at,
				ub.first_added_at::text as first_added_at,
				ub.updated_at::text as updated_at,
				coalesce((
					select count(*)::int
					from user_reading_progress_event pe
					where pe.user_id = ub.user_id
						and pe.book_id = ub.book_id
				), 0)::int as progress_updates,
				array_agg(bg.genre_name order by bg.genre_name asc) filter (where bg.genre_name is not null) as genres,
				b.isbn10,
				b.isbn13
			from user_book ub
			join book b on b.id = ub.book_id
			left join book_genre bg on bg.book_id = b.id
			where ub.user_id = ${userId}::uuid
			group by b.id, ub.user_id, ub.book_id, ub.status, ub.rating, ub.total_pages, ub.current_page, ub.preferred_progress_type, ub.finished_date, ub.first_added_at, ub.updated_at, ub.finished_reflection, ub.review_title, ub.review_spoiler, ub.review_updated_at
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
			preferredProgressType: normalizeProgressInputMode(row.preferred_progress_type),
			finishedDate: row.finished_date || "",
			finishedReflection: row.finished_reflection || "",
			reviewTitle: row.review_title || "",
			reviewSpoiler: !!row.review_spoiler,
			reviewUpdatedAt: row.review_updated_at || "",
			addedAt: Date.parse(row.first_added_at || "") || Date.now(),
			coverUrl: row.cover_url || "",
			format: "",
			language: row.language || "",
			isbn10: row.isbn10 || "",
			isbn13: row.isbn13 || "",
			categories: Array.isArray(row.genres) ? row.genres : [],
			progressUpdates: Math.max(0, Number(row.progress_updates || 0) || 0),
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
	let debugStage = "start";
	let debugContext: Record<string, unknown> = {};
	const perfStartedAt = performance.now();
	const perfStages: Record<string, number> = {};
	const markPerfStage = (stage: string) => {
		perfStages[stage] = Math.round((performance.now() - perfStartedAt) * 10) / 10;
	};
	const logPerf = (outcome: string, extra: Record<string, unknown> = {}) => {
		if (!import.meta.env.DEV) return;
		console.info("[perf.shelf.upsert]", {
			outcome,
			stage: debugStage,
			totalMs: Math.round((performance.now() - perfStartedAt) * 10) / 10,
			stages: perfStages,
			...extra
		});
	};
	const recordShelfPerformance = (
		success: boolean,
		httpStatus: number,
		metadata: Record<string, unknown> = {}
	) => {
		recordPerformanceEventSafe({
			operationName: "shelf.mutate",
			route: "/api/shelf/entries",
			totalMs: performance.now() - perfStartedAt,
			success,
			httpStatus,
			spans: perfStages,
			metadata: {
				action: "upsert",
				stage: debugStage,
				...metadata
			}
		});
	};
	try {
		await ensureShelfSchema();
		debugStage = "session";
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			recordShelfPerformance(false, 401);
			return new Response(JSON.stringify({ error: "You must be logged in to save shelf entries." }), { status: 401, headers: { "Content-Type": "application/json" } });
		}
		debugStage = "parse_body";
		const body = await request.json() as { entry?: ShelfEntryInput };
		const entry = body?.entry || {};
		markPerfStage("schema_session_body");
		debugContext.rawEntry = entry;
		const directBookId = normalizePositiveInt(entry.bookId);
		const bookPayload = fromShelfEntryInput(entry);
		const rawTitle = bookPayload.title;
		if (!rawTitle) {
			recordShelfPerformance(false, 400);
			return new Response(JSON.stringify({ error: "Missing title." }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}

		let author = bookPayload.author;
		const inferredSeries = inferKnownSeriesMetadata({ title: rawTitle, author });
		let title = normalizeRedundantSeriesTitle({
			title: rawTitle,
			seriesName: inferredSeries?.seriesName || "",
			bookOrder: inferredSeries?.bookOrder || 0
		}).title || rawTitle;
		const status = normalizeStatus(entry.status);
		const rating = status === "finished" ? normalizeRating(entry.rating) : null;
		const totalPages = normalizePositiveInt(entry.totalPages);
		const currentPage = normalizePositiveInt(entry.currentPage);
		const rawPreferredProgressType = entry.preferredProgressType ?? entry.progressType;
		const hasPreferredProgressType = rawPreferredProgressType !== undefined
			&& rawPreferredProgressType !== null
			&& normalizeText(rawPreferredProgressType) !== "";
		const preferredProgressType = hasPreferredProgressType
			? normalizeProgressInputMode(rawPreferredProgressType)
			: "";
		const finishedDateRaw = normalizeText(entry.finishedDate);
		const finishedDate = status === "finished" && finishedDateRaw ? finishedDateRaw : "";
		const finishedReflection = status === "finished"
			? normalizeReviewBody(entry.finishedReflection)
			: "";
		const reviewTitle = status === "finished" ? normalizeReviewTitle(entry.reviewTitle) : "";
		const reviewSpoiler = status === "finished" && entry.reviewSpoiler === true;
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
		let pageCount = totalPages;
		let publisher = normalizeText(bookPayload.publisher);
		const userId = session.userId;
		const sql = getNeonSql();
		debugStage = "resolve_existing_book";
		const existingCatalogBook = directBookId > 0
			? await resolveExistingShelfCatalogBook(sql, directBookId)
			: null;
		const hasExistingCatalogBook = !!existingCatalogBook?.bookId;
		if (existingCatalogBook) {
			title = existingCatalogBook.title || title;
			author = existingCatalogBook.author || author;
			coverUrl = existingCatalogBook.coverUrl || coverUrl;
			language = existingCatalogBook.language || language;
			synopsis = existingCatalogBook.synopsis || synopsis;
			isbn10 = existingCatalogBook.isbn10 || isbn10;
			isbn13 = existingCatalogBook.isbn13 || isbn13;
			googleBooksId = existingCatalogBook.googleBooksId || googleBooksId;
			pageCount = Math.max(pageCount, existingCatalogBook.pageCount || 0);
			publisher = existingCatalogBook.publisher || publisher;
			publishedYear = existingCatalogBook.publishedYear || publishedYear;
		}
		markPerfStage(hasExistingCatalogBook ? "existing_catalog_ready" : "existing_catalog_miss");
		const authorId = hasExistingCatalogBook
			? Math.max(0, Number(existingCatalogBook?.authorId || 0) || 0)
			: await ensureAuthorEnriched(author);
		debugContext = {
			directBookId,
			hasExistingCatalogBook,
			title,
			author,
			status,
			totalPages,
			currentPage,
			preferredProgressType,
			isbn13,
			googleBooksId
		};
		const shouldAttemptMetadataEnrichment = !hasExistingCatalogBook && directBookId <= 0;
		if (shouldAttemptMetadataEnrichment && (!synopsis || !coverUrl || !publishedYear || !language || !publisher || (!isbn10 && !isbn13) || !googleBooksId)) {
			const enriched = await inferMetadataForBook({ title, author, isbn10, isbn13, googleBooksId });
			if (!synopsis) synopsis = enriched.synopsis || synopsis;
			if (!coverUrl) coverUrl = enriched.coverUrl || coverUrl;
			if (!language) language = enriched.language || language;
			if (!publishedYear) publishedYear = enriched.publishedYear || publishedYear;
			if (!isbn13) isbn13 = enriched.isbn13 || isbn13;
			if (!isbn10) isbn10 = enriched.isbn10 || isbn10;
			if (!googleBooksId) googleBooksId = enriched.googleBooksId || googleBooksId;
			if (!pageCount && enriched.pageCount > 0) pageCount = enriched.pageCount;
			if (!publisher) publisher = enriched.publisher || publisher;
		}
		markPerfStage("metadata_ready");
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
		let resolvedBookId = Number(existingCatalogBook?.bookId || 0) || 0;
		let resolvedWorkId = Number(existingCatalogBook?.workId || 0) || 0;
		if (resolvedBookId <= 0) {
			debugStage = "ensure_canonical_schema";
			await ensureCanonicalWorkSchema(sql);
			const resolution = await resolveCanonicalCatalogWork(sql, {
				canonicalWorkKey: workKey,
				title,
				author,
				isbn10,
				isbn13,
				googleBooksId,
				sources,
				seriesName: inferredSeries?.seriesName || "",
				seriesBookOrder: inferredSeries?.bookOrder || 0,
				pageCount,
				publishedYear
			});
			resolvedBookId = Number(resolution?.bookId || 0) || 0;
			resolvedWorkId = Number(resolution?.workId || 0) || 0;
		}
		markPerfStage("canonical_resolution_complete");

		const previousRows = await sql<Array<{
			status: ShelfStatus;
			rating: number | null;
			total_pages: number;
			current_page: number;
			first_added_at: string | null;
			progress_updates: number;
		}>>`
			select
				status,
				rating,
				total_pages,
				current_page,
				first_added_at::text as first_added_at,
				coalesce((
					select count(*)::int
					from user_reading_progress_event pe
					where pe.user_id = user_book.user_id
						and pe.book_id = user_book.book_id
				), 0)::int as progress_updates
			from user_book
			where user_id = ${userId}::uuid
				and book_id = ${resolvedBookId || 0}
			limit 1
		`;
		const previousStatus = String(previousRows[0]?.status || "").trim() as ShelfStatus | "";
		const previousRating = normalizeRating(previousRows[0]?.rating);
		const previousTotalPages = normalizePositiveInt(previousRows[0]?.total_pages);
		const previousCurrentPage = normalizePositiveInt(previousRows[0]?.current_page);
		const previousFirstAddedAt = previousRows[0]?.first_added_at || "";
		const previousProgressUpdates = normalizePositiveInt(previousRows[0]?.progress_updates);

		let bookId = resolvedBookId;
		let canonicalPageCount = Math.max(0, Number(pageCount || 0) || 0);
		let workEdition = {
			workId: resolvedWorkId,
			editionId: Math.max(0, Number(existingCatalogBook?.editionId || 0) || 0),
			representativeBookId: bookId
		};
		if (hasExistingCatalogBook && bookId > 0) {
			debugStage = "reuse_existing_catalog";
			canonicalPageCount = Math.max(canonicalPageCount, existingCatalogBook?.pageCount || 0);
			markPerfStage("catalog_reused");
		} else if (bookId > 0) {
			debugStage = "update_book";
			const updatedBookRows = await sql<Array<{ page_count: number }>>`
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
					publisher = case when ${publisher} <> '' then ${publisher} else book.publisher end,
					page_count = case
						when ${pageCount} > 0 and (book.page_count <= 0 or ${pageCount} > book.page_count) then ${pageCount}
						else book.page_count
					end,
					published_year = coalesce(${publishedYear}, book.published_year),
					updated_at = now()
				where id = ${bookId}
				returning coalesce(nullif(page_count, 0), 0)::int as page_count
			`;
			canonicalPageCount = Math.max(canonicalPageCount, Number(updatedBookRows[0]?.page_count || 0) || 0);
		} else {
			debugStage = "insert_book";
			const bookRows = await sql<Array<{ id: number; page_count: number }>>`
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
					publisher,
					page_count,
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
					${publisher},
					${pageCount},
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
					publisher = case when excluded.publisher <> '' then excluded.publisher else book.publisher end,
					page_count = case
						when excluded.page_count > 0 and (book.page_count <= 0 or excluded.page_count > book.page_count) then excluded.page_count
						else book.page_count
					end,
					published_year = coalesce(excluded.published_year, book.published_year),
					updated_at = now()
					returning id, coalesce(nullif(page_count, 0), 0)::int as page_count
				`;
				bookId = Number(bookRows[0]?.id || 0);
			canonicalPageCount = Math.max(canonicalPageCount, Number(bookRows[0]?.page_count || 0) || 0);
		}
		if (!bookId) throw new Error("Book upsert failed.");
		debugContext.bookId = bookId;
		if (!hasExistingCatalogBook) {
			debugStage = "upsert_sources";
			await upsertBookSources(sql, bookId, sources);
			debugStage = "upsert_work_edition";
			workEdition = await upsertWorkAndEdition(sql, {
				bookId,
				resolvedWorkId,
				title,
				canonicalTitle: title,
				editionTitle: rawTitle,
				author,
				authorId,
				description: synopsis,
				genres: genres.map((genre) => genre.name),
				topics: tags.map((tag) => tag.name),
				coverUrl,
				isbn10,
				isbn13,
				seriesId: 0,
				seriesPosition: inferredSeries?.bookOrder || 0,
				publisher,
				format: normalizeText(entry.format) || "Book",
				language,
				publicationDate: publishedDate,
				publicationYear: publishedYear,
				originalPublicationYear: publishedYear,
				pageCount,
				googleBooksId,
				sources
			});
			if (workEdition.representativeBookId > 0 && workEdition.representativeBookId !== bookId) {
				bookId = workEdition.representativeBookId;
			}
			debugContext.workEdition = workEdition;
			if (workEdition.editionId > 0) {
				debugStage = "canonical_page_count";
				const canonicalPageRows = await sql<Array<{ page_count: number }>>`
					select
						coalesce(
							nullif(be.page_count, 0),
							nullif(b.page_count, 0),
							0
						)::int as page_count
					from book_edition be
					left join book b on b.id = ${bookId}
					where be.id = ${workEdition.editionId}
					limit 1
				`;
				canonicalPageCount = Math.max(canonicalPageCount, Number(canonicalPageRows[0]?.page_count || 0) || 0);
			}
			markPerfStage("catalog_writes_complete");
			debugStage = "upsert_series";
			await upsertKnownSeriesForBook(sql, {
				bookId,
				workId: workEdition.workId,
				title,
				author,
				coverUrl,
				publishedYear
			});
		}

		const effectiveTotalPages = Math.max(
			0,
			totalPages || 0,
			previousTotalPages || 0,
			canonicalPageCount || 0
		);

		if (!hasExistingCatalogBook) {
			for (const genre of genres) {
				debugStage = "upsert_genres";
				await sql`
					insert into book_genre (book_id, genre_slug, genre_name)
					values (${bookId}, ${genre.slug}, ${genre.name})
					on conflict (book_id, genre_slug) do update set
						genre_name = excluded.genre_name
				`;
			}
			for (const tag of tags) {
				debugStage = "upsert_tags";
				await sql`
					insert into book_tag (book_id, tag_slug, tag_name)
					values (${bookId}, ${tag.slug}, ${tag.name})
					on conflict (book_id, tag_slug) do update set
						tag_name = excluded.tag_name
				`;
			}

			if (genres.length === 0) {
				debugStage = "infer_genres";
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
		}

		debugStage = "upsert_user_book";
		const finishedDateParam = finishedDate ? finishedDate : null;
		const editionIdParam = workEdition.editionId > 0 ? workEdition.editionId : null;
		await withSqlDebug(
			"shelfEntries.userBook.upsert",
			userBookUpsertDebugParams({
				userId,
				bookId,
				status,
				rating,
				effectiveTotalPages,
				currentPage,
				preferredProgressType,
				finishedDate: finishedDateParam,
				finishedReflection,
				reviewTitle,
				reviewSpoiler,
				editionId: editionIdParam
			}),
			() => sql`
			insert into user_book (
				user_id,
				book_id,
				status,
				rating,
				total_pages,
				current_page,
				preferred_progress_type,
				finished_date,
				finished_reflection,
				review_title,
				review_spoiler,
				edition_id,
				review_updated_at,
				first_added_at,
				updated_at
			)
			values (
				${userId}::uuid,
				${bookId}::bigint,
				${status}::text,
				${rating}::int,
				${effectiveTotalPages}::int,
				${currentPage}::int,
				${(preferredProgressType || "page")}::text,
				${finishedDateParam}::date,
				${finishedReflection}::text,
				${reviewTitle}::text,
				${reviewSpoiler}::boolean,
				${editionIdParam}::bigint,
				case when ${reviewTitle}::text <> '' or ${finishedReflection}::text <> '' then now() else null end,
				now(),
				now()
			)
			on conflict (user_id, book_id) do update set
				status = excluded.status,
				rating = excluded.rating,
				total_pages = case
					when excluded.total_pages > 0 then excluded.total_pages
					else user_book.total_pages
				end,
				current_page = excluded.current_page,
				preferred_progress_type = case
					when ${preferredProgressType}::text <> '' then ${preferredProgressType}::text
					else user_book.preferred_progress_type
				end,
				finished_date = excluded.finished_date,
				finished_reflection = excluded.finished_reflection,
				review_title = excluded.review_title,
				review_spoiler = excluded.review_spoiler,
				edition_id = coalesce(excluded.edition_id, user_book.edition_id),
				review_updated_at = case
					when excluded.review_title <> user_book.review_title
						or excluded.finished_reflection <> user_book.finished_reflection
						or excluded.review_spoiler <> user_book.review_spoiler
					then excluded.review_updated_at
					else user_book.review_updated_at
				end,
				updated_at = now()
			`);
		markPerfStage("user_book_upsert_complete");
		const nextCurrentPage = normalizePositiveInt(currentPage);
		const deltaPages = Math.max(0, nextCurrentPage - previousCurrentPage);
		const requiredFollowups: Promise<unknown>[] = [];
		// Single-shelf mode: putting a book on a default shelf removes it from
		// all custom shelves for this user.
		debugStage = "authoritative_followups";
		requiredFollowups.push(sql`
			delete from user_custom_shelf_book
			where user_id = ${userId}::uuid
				and book_id = ${bookId}
		`);
		if (!previousStatus || previousStatus !== status) {
			debugStage = "activity_status";
			requiredFollowups.push(sql`
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
			`);
		}
		if (rating !== null && previousRating !== rating) {
			debugStage = "activity_rating";
			requiredFollowups.push(sql`
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
			`);
		}

		if (deltaPages > 0 && (status === "reading" || status === "finished")) {
			debugStage = "insert_progress_event";
			requiredFollowups.push(sql`
				insert into user_reading_progress_event (
					user_id,
					book_id,
					from_page,
					to_page,
					page_delta
				)
				values (
					${userId}::uuid,
					${bookId},
					${previousCurrentPage},
					${nextCurrentPage},
					${deltaPages}
				)
			`);
		}
		await Promise.all(requiredFollowups);
		markPerfStage("authoritative_followups_complete");
		if (status === "finished" || deltaPages > 0) {
			debugStage = "reading_milestone_notifications";
			await createReadingMilestoneNotifications(sql, userId, {
				status,
				bookId,
				title
			});
		}
		markPerfStage("notifications_complete");

		const nowMs = Date.now();
		const persistedEntry = {
			id: `book_${bookId}`,
			bookId,
			title,
			author,
			status,
			rating,
			totalPages: effectiveTotalPages,
			currentPage,
			preferredProgressType: normalizeProgressInputMode(preferredProgressType || "page"),
			finishedDate,
			addedAt: Date.parse(previousFirstAddedAt || "") || nowMs,
			coverUrl,
			format: "",
			language,
			isbn10,
			isbn13,
			googleBooksId,
			publisher,
			description: synopsis,
			finishedReflection,
			reviewTitle,
			reviewSpoiler,
			reviewUpdatedAt: reviewTitle || finishedReflection ? new Date(nowMs).toISOString() : "",
			categories: genres.map((genre) => genre.name),
			progressUpdates: previousProgressUpdates + (deltaPages > 0 ? 1 : 0),
			updatedAt: nowMs
		};

		monitorEvent("shelf.upsert.success", { userId, bookId, status, rating: rating ?? 0, hasProgressDelta: deltaPages > 0 });
		logPerf("success", { bookId, status });
		recordShelfPerformance(true, 200, {
			status,
			hasExistingCatalogBook,
			hasDirectBookId: directBookId > 0,
			hasProgressDelta: deltaPages > 0
		});
		return new Response(JSON.stringify({ ok: true, bookId, entry: persistedEntry }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logPerf("error", { error: message });
		if (import.meta.env.DEV) {
			console.error("[shelf.upsert.debug]", {
				stage: debugStage,
				context: debugContext,
				error: message
			});
		}
		monitorEvent("shelf.upsert.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		recordShelfPerformance(false, 500);
		return new Response(JSON.stringify({
			error: "Failed to save shelf entry.",
			detail: import.meta.env.DEV && debugStage
				? `[${debugStage}] ${message}`
				: "Please try again."
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	const perfStartedAt = performance.now();
	const perfStages: Record<string, number> = {};
	let debugStage = "start";
	const markPerfStage = (stage: string) => {
		perfStages[stage] = Math.round((performance.now() - perfStartedAt) * 10) / 10;
		return stage;
	};
	const recordShelfRemovePerformance = (
		success: boolean,
		httpStatus: number,
		metadata: Record<string, unknown> = {}
	) => {
		recordPerformanceEventSafe({
			operationName: "shelf.mutate",
			route: "/api/shelf/entries",
			totalMs: performance.now() - perfStartedAt,
			success,
			httpStatus,
			spans: perfStages,
			metadata: {
				action: "remove",
				stage: debugStage,
				...metadata
			}
		});
	};
	try {
		await ensureShelfSchema();
		debugStage = markPerfStage("schema_ready");
		const session = await resolveUserBySession(request);
		debugStage = markPerfStage("session_loaded");
		if (!session?.userId) {
			recordShelfRemovePerformance(false, 401);
			return new Response(JSON.stringify({ error: "You must be logged in to delete shelf entries." }), { status: 401, headers: { "Content-Type": "application/json" } });
		}
		await ensureCustomShelfSchema(getNeonSql());
		const body = await request.json().catch(() => ({})) as { entry?: ShelfEntryInput; bookId?: unknown };
		debugStage = markPerfStage("body_loaded");
		const directBookId = Math.max(0, Number(body.bookId || 0) || 0);
		const userId = session.userId;
		const sql = getNeonSql();
		if (directBookId > 0) {
			const [removedDefault, removedCustom] = await Promise.all([
				sql<Array<{ book_id: number }>>`
					delete from user_book
					where user_id = ${userId}::uuid
						and book_id = ${directBookId}
					returning book_id
				`,
				sql<Array<{ book_id: number }>>`
					delete from user_custom_shelf_book
					where user_id = ${userId}::uuid
						and book_id = ${directBookId}
					returning book_id
				`
			]);
			if (removedDefault.length === 0 && removedCustom.length === 0) {
				monitorEvent("shelf.remove.noop", { userId, bookId: directBookId }, "warn");
				debugStage = markPerfStage("remove_noop");
				recordShelfRemovePerformance(false, 404, { directBookId: true });
				return new Response(JSON.stringify({ error: "Book is not on your shelves." }), {
					status: 404,
					headers: { "Content-Type": "application/json" }
				});
			}
			monitorEvent("shelf.remove.success", { userId, bookId: directBookId, removedDefault: removedDefault.length, removedCustom: removedCustom.length });
			debugStage = markPerfStage("removed_direct");
			recordShelfRemovePerformance(true, 200, {
				directBookId: true,
				removedDefault: removedDefault.length,
				removedCustom: removedCustom.length
			});
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" }
			});
		}
		const entry = body?.entry || {};
		const title = normalizeText(entry.title);
		const author = normalizeText(entry.author);
		const isbn10 = normalizeIsbn(entry.isbn10);
		const isbn13 = normalizeIsbn(entry.isbn13);
		const workKey = canonicalCatalogWorkKey({ title, author, isbn10, isbn13 });

		const googleBooksId = normalizeCatalogText(entry.googleBooksId);
		if (!workKey && !googleBooksId) {
			monitorEvent("shelf.remove.invalid_identity", { userId }, "warn");
			debugStage = markPerfStage("invalid_identity");
			recordShelfRemovePerformance(false, 400, { directBookId: false });
			return new Response(JSON.stringify({ error: "Book identity is required to remove shelf entries." }), {
				status: 400,
				headers: { "Content-Type": "application/json" }
			});
		}
		let bookId = await resolveBestCatalogBookId(sql, {
			canonicalWorkKey: workKey,
			title,
			author,
			isbn10,
			isbn13,
			googleBooksId
		});
		debugStage = markPerfStage("catalog_identity_resolved");
		if (!(bookId > 0) && title) {
			const fallbackRows = await sql<Array<{ book_id: number }>>`
				select ub.book_id
				from user_book ub
				join book b on b.id = ub.book_id
				where ub.user_id = ${userId}::uuid
					and lower(trim(b.title)) = lower(${title})
					and (
						${author} = ''
						or lower(trim(b.primary_author)) = lower(${author})
					)
				order by ub.updated_at desc
				limit 1
			`;
			bookId = Math.max(0, Number(fallbackRows[0]?.book_id || 0) || 0);
		}
		if (!(bookId > 0)) {
			monitorEvent("shelf.remove.invalid_identity", { userId, title, author }, "warn");
			debugStage = markPerfStage("book_not_found");
			recordShelfRemovePerformance(false, 404, { directBookId: false });
			return new Response(JSON.stringify({ error: "Could not find this book on your shelves." }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}
		const [removedDefault, removedCustom] = await Promise.all([
			sql<Array<{ book_id: number }>>`
				delete from user_book ub
				where ub.user_id = ${userId}::uuid
					and ub.book_id = ${bookId}
				returning ub.book_id
			`,
			sql<Array<{ book_id: number }>>`
				delete from user_custom_shelf_book
				where user_id = ${userId}::uuid
					and book_id = ${bookId}
				returning book_id
			`
		]);
		if (removedDefault.length === 0 && removedCustom.length === 0) {
			monitorEvent("shelf.remove.noop", { userId, bookId }, "warn");
			debugStage = markPerfStage("remove_noop");
			recordShelfRemovePerformance(false, 404, { directBookId: false });
			return new Response(JSON.stringify({ error: "Book is not on your shelves." }), {
				status: 404,
				headers: { "Content-Type": "application/json" }
			});
		}
		monitorEvent("shelf.remove.success", { userId, bookId, removedDefault: removedDefault.length, removedCustom: removedCustom.length });
		debugStage = markPerfStage("removed_resolved");
		recordShelfRemovePerformance(true, 200, {
			directBookId: false,
			removedDefault: removedDefault.length,
			removedCustom: removedCustom.length
		});

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		monitorEvent("shelf.remove.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		recordShelfRemovePerformance(false, 500);
		return new Response(JSON.stringify({
			error: "Failed to delete shelf entry.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
