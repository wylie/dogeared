import { getNeonSql } from "./neon.ts";

type SeriesSql = ReturnType<typeof getNeonSql>;

export type ShelfStatus = "want_to_read" | "reading" | "finished" | "";

export type SeriesInfo = {
	id: number;
	name: string;
	description: string;
	coverUrl: string;
	totalBooks: number;
};

export type SeriesBookInput = {
	seriesId: number;
	seriesName: string;
	seriesDescription?: string;
	seriesCoverUrl?: string;
	seriesTotalBooks?: number;
	bookId: number;
	title: string;
	author?: string;
	authorId?: number;
	coverUrl?: string;
	synopsis?: string;
	language?: string;
	isbn10?: string;
	isbn13?: string;
	googleBooksId?: string;
	publishedYear?: number;
	pageCount?: number;
	bookOrder?: number;
	publicationOrder?: number;
	chronologicalOrder?: number;
	shelfStatus?: ShelfStatus;
};

export type SeriesBookItem = SeriesBookInput & {
	orderLabel: string;
	isCurrent: boolean;
	canOpenBook: boolean;
	bookHref: string;
};

export type BookSeriesContext = {
	series: SeriesInfo;
	books: SeriesBookItem[];
	currentBook: SeriesBookItem | null;
	nextBook: SeriesBookItem | null;
};

export type AuthorSeriesBook = {
	id: number;
	title: string;
	seriesId?: number;
	seriesName?: string;
	bookOrder?: number;
	publicationOrder?: number;
	chronologicalOrder?: number;
};

export type AuthorBookGroup<T extends AuthorSeriesBook = AuthorSeriesBook> = {
	id: string;
	title: string;
	kind: "series" | "standalone";
	books: T[];
};

let seriesSchemaReady: Promise<void> | null = null;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function numericOrder(value: unknown) {
	const numeric = Number(value || 0);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function formatSeriesBookLabel(book: Pick<SeriesBookInput, "bookOrder" | "publicationOrder" | "chronologicalOrder">) {
	const bookOrder = numericOrder(book.bookOrder);
	if (bookOrder > 0) return `Book ${bookOrder}`;
	const publicationOrder = numericOrder(book.publicationOrder);
	if (publicationOrder > 0) return `Publication ${publicationOrder}`;
	const chronologicalOrder = numericOrder(book.chronologicalOrder);
	if (chronologicalOrder > 0) return `Chronology ${chronologicalOrder}`;
	return "Series entry";
}

function compareSeriesBooks(a: Pick<SeriesBookInput, "bookOrder" | "publicationOrder" | "chronologicalOrder" | "publishedYear" | "title" | "bookId">, b: Pick<SeriesBookInput, "bookOrder" | "publicationOrder" | "chronologicalOrder" | "publishedYear" | "title" | "bookId">) {
	return (
		numericOrder(a.bookOrder) - numericOrder(b.bookOrder)
		|| numericOrder(a.publicationOrder) - numericOrder(b.publicationOrder)
		|| numericOrder(a.chronologicalOrder) - numericOrder(b.chronologicalOrder)
		|| numericOrder(a.publishedYear) - numericOrder(b.publishedYear)
		|| normalizeText(a.title).localeCompare(normalizeText(b.title))
		|| Number(a.bookId || 0) - Number(b.bookId || 0)
	);
}

export function orderSeriesBooks<T extends SeriesBookInput>(books: T[]): T[] {
	return [...books].sort(compareSeriesBooks);
}

export function buildBookSeriesContext(input: {
	series: SeriesInfo;
	books: SeriesBookInput[];
	currentBookId: number;
}): BookSeriesContext | null {
	const currentBookId = Number(input.currentBookId || 0);
	if (!input.series?.id || currentBookId <= 0) return null;
	const ordered = orderSeriesBooks(input.books).map((book) => {
		const bookId = Number(book.bookId || 0);
		return {
			...book,
			bookId,
			title: normalizeText(book.title),
			orderLabel: formatSeriesBookLabel(book),
			isCurrent: bookId === currentBookId,
			canOpenBook: bookId > 0,
			bookHref: bookId > 0 ? `/book?bookId=${encodeURIComponent(String(bookId))}` : ""
		};
	}).filter((book) => book.title);
	if (ordered.length === 0) return null;
	const currentIndex = ordered.findIndex((book) => book.bookId === currentBookId);
	const currentBook = currentIndex >= 0 ? ordered[currentIndex] : null;
	const nextBook = currentIndex >= 0
		? (ordered.slice(currentIndex + 1).find((book) => book.bookId > 0) || null)
		: null;
	return {
		series: input.series,
		books: ordered,
		currentBook,
		nextBook
	};
}

export function groupAuthorBooksBySeries<T extends AuthorSeriesBook>(books: T[]): AuthorBookGroup<T>[] {
	const seriesGroups = new Map<number, AuthorBookGroup<T>>();
	const standalone: T[] = [];
	for (const book of books) {
		const seriesId = Number(book.seriesId || 0);
		const seriesName = normalizeText(book.seriesName);
		if (seriesId > 0 && seriesName) {
			const existing = seriesGroups.get(seriesId) || {
				id: `series-${seriesId}`,
				title: seriesName,
				kind: "series" as const,
				books: []
			};
			existing.books.push(book);
			seriesGroups.set(seriesId, existing);
		} else {
			standalone.push(book);
		}
	}
	const groups = Array.from(seriesGroups.values()).map((group) => ({
		...group,
		books: [...group.books].sort(compareSeriesBooks)
	}));
	groups.sort((a, b) => a.title.localeCompare(b.title));
	if (standalone.length > 0) {
		groups.push({
			id: "standalone",
			title: "Standalone Books",
			kind: "standalone",
			books: [...standalone].sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title)))
		});
	}
	return groups;
}

export function ensureSeriesSchema(sql: SeriesSql = getNeonSql()) {
	if (!seriesSchemaReady) {
		seriesSchemaReady = Promise.all([
			sql`
				create table if not exists series (
					id bigserial primary key,
					name text not null,
					slug text not null unique,
					description text not null default '',
					cover_url text not null default '',
					total_books int not null default 0,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now()
				)
			`,
			sql`
				create table if not exists series_book (
					series_id bigint not null references series(id) on delete cascade,
					book_id bigint references book(id) on delete set null,
					title_override text not null default '',
					book_order numeric,
					publication_order numeric,
					chronological_order numeric,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now(),
					check (book_id is not null or trim(title_override) <> '')
				)
			`,
			sql`create index if not exists idx_series_book_series_order on series_book(series_id, book_order, publication_order, chronological_order)`,
			sql`create index if not exists idx_series_book_book on series_book(book_id) where book_id is not null`,
			sql`create unique index if not exists idx_series_book_unique_book on series_book(series_id, book_id) where book_id is not null`
		]).then(() => undefined);
	}
	return seriesSchemaReady;
}

export async function loadBookSeriesContext(
	sql: SeriesSql,
	bookId: number,
	viewerUserId = ""
): Promise<BookSeriesContext | null> {
	const currentBookId = Number(bookId || 0);
	if (currentBookId <= 0) return null;
	await ensureSeriesSchema(sql);
	const rows = await sql<Array<{
		series_id: number;
		series_name: string;
		series_description: string;
		series_cover_url: string;
		series_total_books: number;
		book_id: number | null;
		title: string;
		primary_author: string;
		author_id: number | null;
		cover_url: string;
		synopsis: string;
		language: string;
		isbn10: string;
		isbn13: string;
		google_books_id: string;
		published_year: number | null;
		page_count: number;
		book_order: string | null;
		publication_order: string | null;
		chronological_order: string | null;
		viewer_status: ShelfStatus | null;
	}>>`
		with current_series as (
			select sb.series_id
			from series_book sb
			where sb.book_id = ${currentBookId}
			order by sb.series_id asc
			limit 1
		)
		select
			s.id as series_id,
			s.name as series_name,
			coalesce(s.description, '') as series_description,
			coalesce(s.cover_url, '') as series_cover_url,
			coalesce(nullif(s.total_books, 0), count(*) over (partition by s.id))::int as series_total_books,
			sb.book_id,
			coalesce(nullif(trim(b.title), ''), nullif(trim(sb.title_override), ''), 'Untitled') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			b.author_id,
			coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			coalesce(nullif(trim(b.language), ''), '') as language,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			b.published_year,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			sb.book_order::text as book_order,
			sb.publication_order::text as publication_order,
			sb.chronological_order::text as chronological_order,
			coalesce(ub.status, '') as viewer_status
		from current_series cs
		join series s on s.id = cs.series_id
		join series_book sb on sb.series_id = s.id
		left join book b on b.id = sb.book_id
		left join user_book ub on ub.book_id = sb.book_id
			and ${viewerUserId} <> ''
			and ub.user_id = ${viewerUserId || "00000000-0000-0000-0000-000000000000"}::uuid
		order by sb.book_order nulls last, sb.publication_order nulls last, sb.chronological_order nulls last, b.published_year nulls last, title asc
	`;
	if (rows.length === 0) return null;
	const first = rows[0];
	return buildBookSeriesContext({
		currentBookId,
		series: {
			id: Number(first.series_id || 0),
			name: normalizeText(first.series_name),
			description: normalizeText(first.series_description),
			coverUrl: normalizeText(first.series_cover_url),
			totalBooks: Math.max(0, Number(first.series_total_books || rows.length) || rows.length)
		},
		books: rows.map((row) => ({
			seriesId: Number(row.series_id || 0),
			seriesName: normalizeText(row.series_name),
			seriesDescription: normalizeText(row.series_description),
			seriesCoverUrl: normalizeText(row.series_cover_url),
			seriesTotalBooks: Math.max(0, Number(row.series_total_books || 0)),
			bookId: Math.max(0, Number(row.book_id || 0) || 0),
			title: normalizeText(row.title),
			author: normalizeText(row.primary_author),
			authorId: Math.max(0, Number(row.author_id || 0) || 0),
			coverUrl: normalizeText(row.cover_url),
			synopsis: normalizeText(row.synopsis),
			language: normalizeText(row.language),
			isbn10: normalizeText(row.isbn10),
			isbn13: normalizeText(row.isbn13),
			googleBooksId: normalizeText(row.google_books_id),
			publishedYear: Math.max(0, Number(row.published_year || 0) || 0),
			pageCount: Math.max(0, Number(row.page_count || 0) || 0),
			bookOrder: numericOrder(row.book_order),
			publicationOrder: numericOrder(row.publication_order),
			chronologicalOrder: numericOrder(row.chronological_order),
			shelfStatus: row.viewer_status || ""
		}))
	});
}
