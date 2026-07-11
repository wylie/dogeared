import { getNeonSql } from "./neon.ts";
import { canonicalizeCatalogAuthor, canonicalizeCatalogTitle } from "./catalogKeys.ts";

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
	averageRating?: number;
	ratingCount?: number;
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
	previousBook: SeriesBookItem | null;
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

type KnownSeriesBook = {
	title: string;
	order: number;
	aliases?: string[];
};

type KnownSeries = {
	name: string;
	slug: string;
	totalBooks: number;
	displayAuthor: string;
	authors: string[];
	books: KnownSeriesBook[];
};

export type InferredSeriesMetadata = {
	seriesName: string;
	seriesSlug: string;
	seriesTotalBooks: number;
	bookOrder: number;
};

type UpsertKnownSeriesInput = {
	bookId: number;
	workId?: number;
	title?: unknown;
	author?: unknown;
	coverUrl?: unknown;
	publishedYear?: unknown;
};

type KnownSeriesFallbackInput = {
	title?: unknown;
	author?: unknown;
	coverUrl?: unknown;
	synopsis?: unknown;
	language?: unknown;
	isbn10?: unknown;
	isbn13?: unknown;
	googleBooksId?: unknown;
	publishedLabel?: unknown;
	pageCount?: unknown;
	averageRating?: unknown;
	ratingCount?: unknown;
};

const KNOWN_SERIES: KnownSeries[] = [
	{
		name: "Harry Potter",
		slug: "harry-potter",
		totalBooks: 7,
		displayAuthor: "J.K. Rowling",
		authors: ["j k rowling", "jk rowling"],
		books: [
			{ title: "Harry Potter and the Sorcerer's Stone", order: 1, aliases: ["Harry Potter and the Philosopher's Stone"] },
			{ title: "Harry Potter and the Chamber of Secrets", order: 2 },
			{ title: "Harry Potter and the Prisoner of Azkaban", order: 3 },
			{ title: "Harry Potter and the Goblet of Fire", order: 4 },
			{ title: "Harry Potter and the Order of the Phoenix", order: 5 },
			{ title: "Harry Potter and the Half-Blood Prince", order: 6 },
			{ title: "Harry Potter and the Deathly Hallows", order: 7 }
		]
	},
	{
		name: "The Lord of the Rings",
		slug: "the-lord-of-the-rings",
		totalBooks: 3,
		displayAuthor: "J.R.R. Tolkien",
		authors: ["j r r tolkien", "jrr tolkien"],
		books: [
			{ title: "The Fellowship of the Ring", order: 1, aliases: ["Fellowship of the Ring"] },
			{ title: "The Two Towers", order: 2 },
			{ title: "The Return of the King", order: 3 }
		]
	},
	{
		name: "The Empyrean",
		slug: "the-empyrean",
		totalBooks: 3,
		displayAuthor: "Rebecca Yarros",
		authors: ["rebecca yarros"],
		books: [
			{ title: "Fourth Wing", order: 1 },
			{ title: "Iron Flame", order: 2 },
			{ title: "Onyx Storm", order: 3 }
		]
	},
	{
		name: "Wings of Fire",
		slug: "wings-of-fire",
		totalBooks: 16,
		displayAuthor: "Tui T. Sutherland",
		authors: ["tui t sutherland"],
		books: [
			{ title: "The Dragonet Prophecy", order: 1 },
			{ title: "The Lost Heir", order: 2 },
			{ title: "The Hidden Kingdom", order: 3 },
			{ title: "The Dark Secret", order: 4 },
			{ title: "The Brightest Night", order: 5 },
			{ title: "Moon Rising", order: 6 },
			{ title: "Winter Turning", order: 7 },
			{ title: "Escaping Peril", order: 8 },
			{ title: "Talons of Power", order: 9 },
			{ title: "Darkness of Dragons", order: 10 },
			{ title: "The Lost Continent", order: 11 },
			{ title: "The Hive Queen", order: 12 },
			{ title: "The Poison Jungle", order: 13 },
			{ title: "The Dangerous Gift", order: 14 },
			{ title: "The Flames of Hope", order: 15 }
		]
	},
	{
		name: "A Series of Unfortunate Events",
		slug: "a-series-of-unfortunate-events",
		totalBooks: 13,
		displayAuthor: "Lemony Snicket",
		authors: ["lemony snicket"],
		books: [
			{ title: "The Bad Beginning", order: 1 },
			{ title: "The Reptile Room", order: 2 },
			{ title: "The Wide Window", order: 3 },
			{ title: "The Miserable Mill", order: 4 },
			{ title: "The Austere Academy", order: 5 },
			{ title: "The Ersatz Elevator", order: 6 },
			{ title: "The Vile Village", order: 7 },
			{ title: "The Hostile Hospital", order: 8 },
			{ title: "The Carnivorous Carnival", order: 9 },
			{ title: "The Slippery Slope", order: 10 },
			{ title: "The Grim Grotto", order: 11 },
			{ title: "The Penultimate Peril", order: 12 },
			{ title: "The End", order: 13 }
		]
	},
	{
		name: "Mistborn",
		slug: "mistborn",
		totalBooks: 7,
		displayAuthor: "Brandon Sanderson",
		authors: ["brandon sanderson"],
		books: [
			{ title: "Mistborn: The Final Empire", order: 1, aliases: ["The Final Empire", "Mistborn"] },
			{ title: "The Well of Ascension", order: 2 },
			{ title: "The Hero of Ages", order: 3 },
			{ title: "The Alloy of Law", order: 4 },
			{ title: "Shadows of Self", order: 5 },
			{ title: "The Bands of Mourning", order: 6 },
			{ title: "The Lost Metal", order: 7 }
		]
	}
];

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function numericOrder(value: unknown) {
	const numeric = Number(value || 0);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function seriesTitleKeys(book: KnownSeriesBook) {
	return [book.title, ...(book.aliases || [])].map((title) => canonicalizeCatalogTitle(title)).filter(Boolean);
}

function findKnownSeriesBySlug(slug: string) {
	return KNOWN_SERIES.find((series) => series.slug === slug) || null;
}

export function inferKnownSeriesMetadata(input: { title?: unknown; author?: unknown }): InferredSeriesMetadata | null {
	const title = canonicalizeCatalogTitle(input.title);
	const author = canonicalizeCatalogAuthor(input.author);
	if (!title) return null;
	for (const series of KNOWN_SERIES) {
		const authorMatches = !author || series.authors.some((knownAuthor) => author === knownAuthor || author.includes(knownAuthor) || knownAuthor.includes(author));
		for (const book of series.books) {
			const titleMatches = seriesTitleKeys(book).some((knownTitle) => title === knownTitle || title.includes(knownTitle) || knownTitle.includes(title));
			if (!titleMatches) continue;
			if (!authorMatches && author) continue;
			return {
				seriesName: series.name,
				seriesSlug: series.slug,
				seriesTotalBooks: series.totalBooks,
				bookOrder: book.order
			};
		}
	}
	return null;
}

export async function upsertKnownSeriesForBook(
	sql: SeriesSql,
	input: UpsertKnownSeriesInput
): Promise<InferredSeriesMetadata | null> {
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	if (bookId <= 0) return null;
	const inferred = inferKnownSeriesMetadata(input);
	if (!inferred) return null;
	const knownSeries = findKnownSeriesBySlug(inferred.seriesSlug);
	if (!knownSeries) return null;
	await ensureSeriesSchema(sql);
	const seriesRows = await sql<Array<{ id: number }>>`
		insert into series (
			name,
			slug,
			total_books,
			cover_url,
			metadata
		)
		values (
			${knownSeries.name},
			${knownSeries.slug},
			${knownSeries.totalBooks},
			${normalizeText(input.coverUrl)},
			jsonb_build_object('source', 'known-series-v1')
		)
		on conflict (slug) do update set
			name = excluded.name,
			total_books = greatest(series.total_books, excluded.total_books),
			cover_url = case when excluded.cover_url <> '' then excluded.cover_url else series.cover_url end,
			metadata = series.metadata || excluded.metadata,
			updated_at = now()
		returning id
	`;
	const seriesId = Number(seriesRows[0]?.id || 0);
	if (seriesId <= 0) return null;
	const displayAuthor = knownSeries.displayAuthor || knownSeries.authors[0] || "";
	for (const book of knownSeries.books) {
		await sql`
			update series_book
			set
				title_override = ${book.title},
				book_order = ${book.order},
				publication_order = ${book.order},
				chronological_order = ${book.order},
				metadata = metadata || jsonb_build_object('author', ${displayAuthor}::text),
				updated_at = now()
			where series_id = ${seriesId}
				and book_id is null
				and book_order = ${book.order}
		`;
		await sql`
			insert into series_book (
				series_id,
				book_id,
				title_override,
				book_order,
				publication_order,
				chronological_order,
				metadata
			)
			select
				${seriesId},
				null,
				${book.title},
				${book.order},
				${book.order},
				${book.order},
				jsonb_build_object('source', 'known-series-v1', 'author', ${displayAuthor}::text)
			where not exists (
				select 1
				from series_book existing
				where existing.series_id = ${seriesId}
					and existing.book_id is null
					and existing.book_order = ${book.order}
			)
		`;
	}
	await sql`
		insert into series_book (
			series_id,
			book_id,
			title_override,
			book_order,
			publication_order,
			chronological_order,
			metadata
		)
		values (
			${seriesId},
			${bookId},
			'',
			${inferred.bookOrder},
			${inferred.bookOrder},
			${inferred.bookOrder},
			jsonb_build_object('source', 'known-series-v1')
		)
		on conflict do nothing
	`;
	await sql`
		update series_book
		set
			title_override = '',
			book_order = ${inferred.bookOrder},
			publication_order = ${inferred.bookOrder},
			chronological_order = ${inferred.bookOrder},
			updated_at = now()
		where series_id = ${seriesId}
			and book_id = ${bookId}
	`;
	await sql`
		delete from series_book placeholder
		where placeholder.series_id = ${seriesId}
			and placeholder.book_id is null
			and placeholder.book_order = ${inferred.bookOrder}
			and exists (
				select 1
				from series_book real_entry
				where real_entry.series_id = placeholder.series_id
					and real_entry.book_id is not null
					and real_entry.book_order = placeholder.book_order
			)
	`;
	const workId = Math.max(0, Number(input.workId || 0) || 0);
	if (workId > 0) {
		await sql`
			update book_work
			set
				series_id = ${seriesId},
				series_position = ${inferred.bookOrder},
				updated_at = now()
			where id = ${workId}
		`;
	}
	return inferred;
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
	const previousBook = currentIndex >= 0
		? (ordered.slice(0, currentIndex).reverse().find((book) => book.bookId > 0) || null)
		: null;
	const nextBook = currentIndex >= 0
		? (ordered.slice(currentIndex + 1).find((book) => book.bookId > 0) || null)
		: null;
	return {
		series: input.series,
		books: ordered,
		currentBook,
		previousBook,
		nextBook
	};
}

function publicationYearFromLabel(value: unknown) {
	const match = normalizeText(value).match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
	return match ? numericOrder(match[1]) : 0;
}

export async function loadKnownSeriesFallbackContext(
	sql: SeriesSql,
	input: KnownSeriesFallbackInput
): Promise<BookSeriesContext | null> {
	const inferred = inferKnownSeriesMetadata(input);
	if (!inferred) return null;
	const knownSeries = findKnownSeriesBySlug(inferred.seriesSlug);
	if (!knownSeries) return null;
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
		average_rating: number | null;
		rating_count: number | null;
		book_order: string | null;
		publication_order: string | null;
		chronological_order: string | null;
	}>>`
		select
			s.id as series_id,
			s.name as series_name,
			coalesce(s.description, '') as series_description,
			coalesce(s.cover_url, '') as series_cover_url,
			coalesce(nullif(s.total_books, 0), count(*) over (partition by s.id))::int as series_total_books,
			sb.book_id,
			coalesce(nullif(trim(b.title), ''), nullif(trim(sb.title_override), ''), 'Untitled') as title,
			coalesce(nullif(trim(b.primary_author), ''), nullif(trim(sb.metadata ->> 'author'), ''), ${knownSeries.displayAuthor}) as primary_author,
			b.author_id,
			coalesce(nullif(trim(b.cover_url), ''), nullif(trim(bw.preferred_cover_url), ''), nullif(trim(sb.metadata ->> 'coverUrl'), ''), '') as cover_url,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			coalesce(nullif(trim(b.language), ''), '') as language,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			b.published_year,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(rt.average_rating, 0) as average_rating,
			coalesce(rt.rating_count, 0)::int as rating_count,
			sb.book_order::text as book_order,
			sb.publication_order::text as publication_order,
			sb.chronological_order::text as chronological_order
		from series s
		join series_book sb on sb.series_id = s.id
		left join book b on b.id = sb.book_id
		left join book_work bw on bw.id = b.work_id
		left join lateral (
			select
				round(avg(ubr.rating)::numeric, 2) as average_rating,
				count(*) filter (where ubr.rating is not null)::int as rating_count
			from user_book ubr
			where ubr.book_id = b.id
		) rt on true
		where s.slug = ${inferred.seriesSlug}
		order by
			nullif(sb.book_order::text, '')::numeric nulls last,
			nullif(sb.publication_order::text, '')::numeric nulls last,
			nullif(sb.chronological_order::text, '')::numeric nulls last,
			b.published_year nulls last,
			title asc
	`;
	if (rows.length === 0) return null;
	const first = rows[0];
	const externalTitle = normalizeText(input.title);
	const externalAuthor = normalizeText(input.author);
	const externalCover = normalizeText(input.coverUrl);
	const externalPublishedYear = publicationYearFromLabel(input.publishedLabel);
	const externalPageCount = numericOrder(input.pageCount);
	const externalAverageRating = Math.max(0, Math.min(5, Number(input.averageRating || 0) || 0));
	const externalRatingCount = Math.max(0, Number(input.ratingCount || 0) || 0);
	const books = orderSeriesBooks(rows.map((row) => {
		const bookOrder = numericOrder(row.book_order);
		const isCurrent = bookOrder === inferred.bookOrder;
		return {
			seriesId: Number(row.series_id || 0),
			seriesName: normalizeText(row.series_name),
			seriesDescription: normalizeText(row.series_description),
			seriesCoverUrl: normalizeText(row.series_cover_url),
			seriesTotalBooks: Math.max(0, Number(row.series_total_books || 0)),
			bookId: Math.max(0, Number(row.book_id || 0) || 0),
			title: isCurrent && externalTitle ? externalTitle : normalizeText(row.title),
			author: isCurrent && externalAuthor ? externalAuthor : normalizeText(row.primary_author),
			authorId: Math.max(0, Number(row.author_id || 0) || 0),
			coverUrl: isCurrent && externalCover ? externalCover : normalizeText(row.cover_url),
			synopsis: isCurrent ? normalizeText(input.synopsis) : normalizeText(row.synopsis),
			language: isCurrent ? normalizeText(input.language) : normalizeText(row.language),
			isbn10: isCurrent ? normalizeText(input.isbn10) : normalizeText(row.isbn10),
			isbn13: isCurrent ? normalizeText(input.isbn13) : normalizeText(row.isbn13),
			googleBooksId: isCurrent ? normalizeText(input.googleBooksId) : normalizeText(row.google_books_id),
			publishedYear: isCurrent && externalPublishedYear > 0 ? externalPublishedYear : Math.max(0, Number(row.published_year || 0) || 0),
			pageCount: isCurrent && externalPageCount > 0 ? externalPageCount : Math.max(0, Number(row.page_count || 0) || 0),
			averageRating: isCurrent && externalAverageRating > 0 ? externalAverageRating : Math.max(0, Math.min(5, Number(row.average_rating || 0) || 0)),
			ratingCount: isCurrent && externalRatingCount > 0 ? externalRatingCount : Math.max(0, Number(row.rating_count || 0) || 0),
			bookOrder,
			publicationOrder: numericOrder(row.publication_order),
			chronologicalOrder: numericOrder(row.chronological_order),
			shelfStatus: "" as ShelfStatus
		};
	})).map((book) => ({
		...book,
		orderLabel: formatSeriesBookLabel(book),
		isCurrent: numericOrder(book.bookOrder) === inferred.bookOrder,
		canOpenBook: book.bookId > 0,
		bookHref: book.bookId > 0 ? `/book?bookId=${encodeURIComponent(String(book.bookId))}` : ""
	}));
	const currentIndex = books.findIndex((book) => book.isCurrent);
	return {
		series: {
			id: Number(first.series_id || 0),
			name: normalizeText(first.series_name),
			description: normalizeText(first.series_description),
			coverUrl: normalizeText(first.series_cover_url),
			totalBooks: Math.max(0, Number(first.series_total_books || rows.length) || rows.length)
		},
		books,
		currentBook: currentIndex >= 0 ? books[currentIndex] : null,
		previousBook: currentIndex >= 0 ? (books.slice(0, currentIndex).reverse().find((book) => book.bookId > 0) || null) : null,
		nextBook: currentIndex >= 0 ? (books.slice(currentIndex + 1).find((book) => book.bookId > 0) || null) : null
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
		average_rating: number | null;
		rating_count: number | null;
		book_order: string | null;
		publication_order: string | null;
		chronological_order: string | null;
		viewer_status: ShelfStatus | null;
	}>>`
		with direct_book as (
			select
				b.id as book_id,
				bw.series_id as work_series_id,
				bw.series_position as work_series_position
			from book b
			left join book_work bw on bw.id = b.work_id
			where b.id = ${currentBookId}
			limit 1
		),
		current_series as (
			select sb.series_id
			from series_book sb
			where sb.book_id = ${currentBookId}
			union
			select db.work_series_id
			from direct_book db
			where db.work_series_id is not null
			order by series_id asc
			limit 1
		),
		series_rows as (
			select
				s.id as series_id,
				s.name as series_name,
				coalesce(s.description, '') as series_description,
				coalesce(s.cover_url, '') as series_cover_url,
				coalesce(nullif(s.total_books, 0), count(*) over (partition by s.id))::int as series_total_books,
				sb.book_id,
				coalesce(nullif(trim(b.title), ''), nullif(trim(sb.title_override), ''), 'Untitled') as title,
				coalesce(nullif(trim(b.primary_author), ''), nullif(trim(sb.metadata ->> 'author'), ''), '') as primary_author,
				b.author_id,
				coalesce(
					nullif(trim(b.cover_url), ''),
					nullif(trim(bw.preferred_cover_url), ''),
					nullif(trim(be.cover_url), ''),
					nullif(trim(sb.metadata ->> 'coverUrl'), ''),
					''
				) as cover_url,
				coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
				coalesce(nullif(trim(b.language), ''), '') as language,
				coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
				coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
				coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
				b.published_year,
				coalesce(nullif(b.page_count, 0), 0)::int as page_count,
				coalesce(rt.average_rating, 0) as average_rating,
				coalesce(rt.rating_count, 0)::int as rating_count,
				sb.book_order::text as book_order,
				sb.publication_order::text as publication_order,
				sb.chronological_order::text as chronological_order,
				coalesce(ub.status, '') as viewer_status
			from current_series cs
			join series s on s.id = cs.series_id
			join series_book sb on sb.series_id = s.id
			left join book b on b.id = sb.book_id
			left join book_work bw on bw.id = b.work_id
			left join lateral (
				select candidate.cover_url
				from book_edition candidate
				where candidate.work_id = b.work_id
					and nullif(trim(candidate.cover_url), '') is not null
				order by
					case when candidate.book_id = b.id then 0 else 1 end,
					candidate.updated_at desc,
					candidate.id desc
				limit 1
			) be on true
			left join lateral (
				select
					round(avg(ubr.rating)::numeric, 2) as average_rating,
					count(*) filter (where ubr.rating is not null)::int as rating_count
				from user_book ubr
				where ubr.book_id = b.id
			) rt on true
			left join user_book ub on ub.book_id = sb.book_id
				and ${viewerUserId} <> ''
				and ub.user_id = ${viewerUserId || "00000000-0000-0000-0000-000000000000"}::uuid
			union all
			select
				s.id as series_id,
				s.name as series_name,
				coalesce(s.description, '') as series_description,
				coalesce(s.cover_url, '') as series_cover_url,
				coalesce(nullif(s.total_books, 0), 1)::int as series_total_books,
				b.id as book_id,
				coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
				coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
				b.author_id,
				coalesce(
					nullif(trim(b.cover_url), ''),
					nullif(trim(bw.preferred_cover_url), ''),
					nullif(trim(be.cover_url), ''),
					''
				) as cover_url,
				coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
				coalesce(nullif(trim(b.language), ''), '') as language,
				coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
				coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
				coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
				b.published_year,
				coalesce(nullif(b.page_count, 0), 0)::int as page_count,
				coalesce(rt.average_rating, 0) as average_rating,
				coalesce(rt.rating_count, 0)::int as rating_count,
				db.work_series_position::text as book_order,
				db.work_series_position::text as publication_order,
				db.work_series_position::text as chronological_order,
				coalesce(ub.status, '') as viewer_status
			from current_series cs
			join direct_book db on db.work_series_id = cs.series_id
			join series s on s.id = cs.series_id
			join book b on b.id = db.book_id
			left join book_work bw on bw.id = b.work_id
			left join lateral (
				select candidate.cover_url
				from book_edition candidate
				where candidate.work_id = b.work_id
					and nullif(trim(candidate.cover_url), '') is not null
				order by
					case when candidate.book_id = b.id then 0 else 1 end,
					candidate.updated_at desc,
					candidate.id desc
				limit 1
			) be on true
			left join lateral (
				select
					round(avg(ubr.rating)::numeric, 2) as average_rating,
					count(*) filter (where ubr.rating is not null)::int as rating_count
				from user_book ubr
				where ubr.book_id = b.id
			) rt on true
			left join user_book ub on ub.book_id = b.id
				and ${viewerUserId} <> ''
				and ub.user_id = ${viewerUserId || "00000000-0000-0000-0000-000000000000"}::uuid
			where not exists (
				select 1
				from series_book existing
				where existing.series_id = s.id
					and existing.book_id = b.id
			)
		)
		select
			*
		from series_rows
		order by
			nullif(book_order, '')::numeric nulls last,
			nullif(publication_order, '')::numeric nulls last,
			nullif(chronological_order, '')::numeric nulls last,
			published_year nulls last,
			title asc
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
			averageRating: Math.max(0, Math.min(5, Number(row.average_rating || 0) || 0)),
			ratingCount: Math.max(0, Number(row.rating_count || 0) || 0),
			bookOrder: numericOrder(row.book_order),
			publicationOrder: numericOrder(row.publication_order),
			chronologicalOrder: numericOrder(row.chronological_order),
			shelfStatus: row.viewer_status || ""
		}))
	});
}
