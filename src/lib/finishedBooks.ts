import type { getNeonSql } from "./neon.ts";
import { canonicalCatalogDisplayWorkKey } from "./catalogKeys.ts";
import { normalizeReadingFormat, type ReadingFormat } from "./readingFormats.ts";

type Sql = ReturnType<typeof getNeonSql>;
let finishedBooksSchemaReady: Promise<void> | null = null;

export type FinishedBookGenre = {
	slug: string;
	name: string;
};

export type CanonicalFinishedBook = {
	id: number;
	bookId: number;
	workId: number;
	canonicalWorkKey: string;
	title: string;
	author: string;
	authorId: number | null;
	coverUrl: string;
	thumbnail: string;
	language: string;
	isbn10: string;
	isbn13: string;
	pageCount: number;
	publishedYear: number | null;
	rating: number | null;
	reviewTitle: string;
	reviewBody: string;
	reviewSpoiler: boolean;
	reviewUpdatedAt: string;
	finishedDate: string;
	updatedAt: string;
	readingFormat: ReadingFormat;
	genres: FinishedBookGenre[];
	genreNames: string[];
	seriesId: number | null;
	seriesName: string;
};

type RawCanonicalFinishedBookRow = {
	book_id: number;
	work_id: number | null;
	canonical_title: string | null;
	canonical_author: string | null;
	title: string | null;
	primary_author: string | null;
	author_id: number | null;
	cover_url: string | null;
	language: string | null;
	isbn10: string | null;
	isbn13: string | null;
	page_count: number | null;
	published_year: number | null;
	rating: number | null;
	review_title: string | null;
	finished_reflection: string | null;
	review_spoiler: boolean | null;
	review_updated_at: string | null;
	finished_date: string | null;
	updated_at: string | null;
	reading_format: string | null;
	genres: FinishedBookGenre[] | string | null;
	series_id: number | null;
	series_name: string | null;
};

function cleanText(value: unknown) {
	return String(value || "").trim();
}

function toDateKey(value: unknown) {
	const text = cleanText(value);
	if (!text) return "";
	const parsed = new Date(text);
	if (!Number.isFinite(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
}

function toTimestamp(value: unknown) {
	const time = new Date(cleanText(value)).getTime();
	return Number.isFinite(time) ? time : 0;
}

function parseGenres(value: RawCanonicalFinishedBookRow["genres"]): FinishedBookGenre[] {
	let raw: unknown = value;
	if (typeof value === "string") {
		try {
			raw = JSON.parse(value || "[]");
		} catch {
			raw = [];
		}
	}
	if (!Array.isArray(raw)) return [];
	const byName = new Map<string, FinishedBookGenre>();
	for (const item of raw) {
		const genre = item as FinishedBookGenre;
		const name = cleanText(genre?.name);
		if (!name) continue;
		const slug = cleanText(genre?.slug);
		byName.set(name.toLowerCase(), { slug, name });
	}
	return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function ensureFinishedBooksSchema(sql: Sql) {
	if (!finishedBooksSchemaReady) {
		finishedBooksSchemaReady = sql`alter table user_book add column if not exists reading_format text not null default 'unknown'`.then(() => undefined);
	}
	try {
		await finishedBooksSchemaReady;
	} catch (error) {
		finishedBooksSchemaReady = null;
		throw error;
	}
}

function canonicalFinishedBookKey(input: {
	workId?: unknown;
	title?: unknown;
	author?: unknown;
}) {
	const displayKey = canonicalCatalogDisplayWorkKey({ title: input.title, author: input.author });
	if (displayKey) return displayKey;
	const workId = Math.max(0, Number(input.workId || 0) || 0);
	return workId > 0 ? `work:${workId}` : "";
}

function finishedBookScore(book: Partial<CanonicalFinishedBook>) {
	return (
		(book.coverUrl ? 1 : 0)
		+ (Number(book.pageCount || 0) > 0 ? 1 : 0)
		+ (book.publishedYear ? 1 : 0)
		+ (Array.isArray(book.genres) ? book.genres.length : 0)
		+ (book.seriesId ? 1 : 0)
		+ (book.rating ? 1 : 0)
		+ (book.reviewTitle || book.reviewBody ? 1 : 0)
	);
}

function preferFinishedBook<T extends {
	bookId?: number;
	id?: number;
	finishedDate?: string;
	updatedAt?: string;
}>(a: T, b: T) {
	const aUpdated = toTimestamp(a.updatedAt);
	const bUpdated = toTimestamp(b.updatedAt);
	if (bUpdated !== aUpdated) return bUpdated > aUpdated ? b : a;
	const aFinished = toTimestamp(a.finishedDate);
	const bFinished = toTimestamp(b.finishedDate);
	if (bFinished !== aFinished) return bFinished > aFinished ? b : a;
	const aScore = finishedBookScore(a);
	const bScore = finishedBookScore(b);
	if (bScore !== aScore) return bScore > aScore ? b : a;
	const aId = Math.max(0, Number(a.bookId || a.id || 0) || 0);
	const bId = Math.max(0, Number(b.bookId || b.id || 0) || 0);
	return bId > 0 && (aId <= 0 || bId < aId) ? b : a;
}

export function canonicalizeFinishedBooks<T extends {
	id?: number;
	bookId?: number;
	workId?: number | null;
	canonicalWorkKey?: string;
	title: string;
	author: string;
	finishedDate?: string;
	updatedAt?: string;
}>(books: T[]) {
	const byKey = new Map<string, T>();
	for (const book of books) {
		const finishedDate = toDateKey(book.finishedDate);
		if (!finishedDate) continue;
		const key = cleanText(book.canonicalWorkKey) || canonicalFinishedBookKey({
			workId: book.workId,
			title: book.title,
			author: book.author
		});
		if (!key) continue;
		const normalized = { ...book, finishedDate, canonicalWorkKey: key };
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, normalized);
			continue;
		}
		const preferred = preferFinishedBook(existing, normalized);
		byKey.set(key, preferred);
	}
	return Array.from(byKey.values()).sort((a, b) => {
		const dateCompare = cleanText(b.finishedDate).localeCompare(cleanText(a.finishedDate));
		if (dateCompare !== 0) return dateCompare;
		return cleanText(a.title).localeCompare(cleanText(b.title));
	});
}

export function filterCanonicalFinishedBooksForYear<T extends { finishedDate?: string }>(books: T[], year: number) {
	const normalizedYear = Math.max(0, Math.floor(Number(year || 0) || 0));
	if (normalizedYear <= 0) return [];
	return books.filter((book) => {
		const key = toDateKey(book.finishedDate);
		if (!key) return false;
		return Number(key.slice(0, 4)) === normalizedYear;
	});
}

function mapFinishedBookRow(row: RawCanonicalFinishedBookRow): CanonicalFinishedBook | null {
	const finishedDate = toDateKey(row.finished_date);
	if (!finishedDate) return null;
	const title = cleanText(row.canonical_title) || cleanText(row.title) || "Untitled";
	const author = cleanText(row.canonical_author) || cleanText(row.primary_author) || "Unknown Author";
	const workId = Math.max(0, Number(row.work_id || 0) || 0);
	const canonicalWorkKey = canonicalFinishedBookKey({ workId, title, author });
	if (!canonicalWorkKey) return null;
	const genres = parseGenres(row.genres);
	const bookId = Math.max(0, Number(row.book_id || 0) || 0);
	return {
		id: bookId,
		bookId,
		workId,
		canonicalWorkKey,
		title,
		author,
		authorId: row.author_id ? Number(row.author_id) : null,
		coverUrl: cleanText(row.cover_url),
		thumbnail: cleanText(row.cover_url),
		language: cleanText(row.language),
		isbn10: cleanText(row.isbn10),
		isbn13: cleanText(row.isbn13),
		pageCount: Math.max(0, Number(row.page_count || 0) || 0),
		publishedYear: row.published_year ? Number(row.published_year) : null,
		rating: row.rating ? Number(row.rating) : null,
		reviewTitle: cleanText(row.review_title),
		reviewBody: cleanText(row.finished_reflection),
		reviewSpoiler: row.review_spoiler === true,
		reviewUpdatedAt: cleanText(row.review_updated_at),
		finishedDate,
		updatedAt: cleanText(row.updated_at),
		readingFormat: normalizeReadingFormat(row.reading_format),
		genres,
		genreNames: genres.map((genre) => genre.name),
		seriesId: row.series_id ? Number(row.series_id) : null,
		seriesName: cleanText(row.series_name)
	};
}

export async function loadFinishedBooksForReader(sql: Sql, userId: string) {
	await ensureFinishedBooksSchema(sql);
	const rows = await sql<RawCanonicalFinishedBookRow[]>`
		select
			b.id as book_id,
			coalesce(b.work_id, b.id)::bigint as work_id,
			coalesce(nullif(bw.canonical_title, ''), nullif(bw.title, ''), b.title) as canonical_title,
			coalesce(nullif(bw.primary_author, ''), b.primary_author) as canonical_author,
			b.title,
			b.primary_author,
			coalesce(bw.author_id, b.author_id) as author_id,
			coalesce(nullif(bw.preferred_cover_url, ''), b.cover_url) as cover_url,
			b.language,
			b.isbn10,
			b.isbn13,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(bw.original_publication_year, b.published_year) as published_year,
			ub.rating,
			coalesce(ub.review_title, '') as review_title,
			coalesce(ub.finished_reflection, '') as finished_reflection,
			coalesce(ub.review_spoiler, false) as review_spoiler,
			ub.review_updated_at::text as review_updated_at,
			ub.finished_date::text as finished_date,
			ub.updated_at::text as updated_at,
			coalesce(nullif(trim(ub.reading_format), ''), 'unknown') as reading_format,
			(
				select coalesce(
					json_agg(distinct jsonb_build_object('slug', bg.genre_slug, 'name', bg.genre_name))
						filter (where trim(coalesce(bg.genre_name, '')) <> ''),
					'[]'::json
				)
				from book_genre bg
				where bg.book_id = b.id
			) as genres,
			series_info.series_id,
			series_info.series_name
		from user_book ub
		join book b on b.id = ub.book_id
		left join book_work bw on bw.id = b.work_id
		left join lateral (
			select s.id as series_id, s.name as series_name
			from (
				select sb.series_id, sb.book_order, 0 as priority
				from series_book sb
				where sb.book_id = b.id
				union all
				select bw.series_id, null::numeric as book_order, 1 as priority
				where bw.series_id is not null
			) candidate
			join series s on s.id = candidate.series_id
			order by candidate.priority asc, candidate.book_order asc nulls last, s.id asc
			limit 1
		) series_info on true
		where ub.user_id = ${userId}::uuid
			and ub.status = 'finished'
			and ub.finished_date is not null
		order by ub.finished_date desc, ub.updated_at desc, b.title asc
	`;
	const mapped = rows.map(mapFinishedBookRow).filter((book): book is CanonicalFinishedBook => !!book);
	return canonicalizeFinishedBooks(mapped);
}
