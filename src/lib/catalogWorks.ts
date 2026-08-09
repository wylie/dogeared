import { canonicalCatalogEditionKey, canonicalCatalogWorkKey, normalizeCatalogIsbn, normalizeCatalogText, type CatalogSourceInput } from "./catalogKeys.ts";
import { normalizeRedundantEditionTitle, normalizeRedundantSeriesTitle } from "./canonicalTitles.ts";
import type { getNeonSql } from "./neon.ts";
import { withSqlDebug, type SqlDebugParam } from "./sqlDebug.ts";

type Sql = ReturnType<typeof getNeonSql>;

export type CatalogEditionInput = {
	bookId: number;
	resolvedWorkId?: number;
	title: string;
	canonicalTitle?: string;
	editionTitle?: string;
	author: string;
	authorId?: number;
	description?: string;
	genres?: string[];
	topics?: string[];
	seriesId?: number;
	seriesPosition?: number;
	originalPublicationYear?: number | null;
	coverUrl?: string;
	isbn10?: string;
	isbn13?: string;
	publisher?: string;
	format?: string;
	language?: string;
	publicationDate?: string;
	publicationYear?: number | null;
	pageCount?: number;
	googleBooksId?: string;
	sources?: CatalogSourceInput[];
};

let schemaReady: Promise<void> | null = null;
let backfillReady: Promise<void> | null = null;

type CanonicalWorkBackfillRow = {
	id: number;
	title: string;
	primary_author: string;
	author_id: number | null;
	synopsis: string;
	cover_url: string;
	published_year: number | null;
	page_count: number | null;
	language: string;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	publisher: string;
	series_id: number | null;
	series_name: string;
	book_order: number | null;
	shelf_count: number;
	rating_count: number;
};

type CanonicalWorkBackfillBook = CanonicalWorkBackfillRow & {
	workKey: string;
	canonicalTitle: string;
	editionTitle: string;
};

export type CanonicalWorkBackfillPlan = {
	workKey: string;
	canonicalTitle: string;
	representative: CanonicalWorkBackfillBook;
	books: CanonicalWorkBackfillBook[];
};

export async function ensureCanonicalWorkSchema(sql: Sql, options: { backfill?: boolean } = {}) {
	if (!schemaReady) {
		schemaReady = (async () => {
			await sql`
				create table if not exists book_work (
					id bigserial primary key,
					work_key text not null unique,
					title text not null,
					canonical_title text not null default '',
					primary_author text not null default '',
					author_id bigint references author(id) on delete set null,
					description text not null default '',
					subjects text[] not null default '{}',
					genres text[] not null default '{}',
					series_id bigint,
					series_position numeric,
					original_publication_year int,
					preferred_cover_url text not null default '',
					rating_average numeric,
					rating_count int not null default 0,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now()
				)
			`;
			await sql`alter table book add column if not exists work_id bigint references book_work(id) on delete set null`;
			await sql`
				create table if not exists book_edition (
					id bigserial primary key,
					work_id bigint not null references book_work(id) on delete cascade,
					book_id bigint references book(id) on delete set null,
					edition_key text not null,
					isbn10 text not null default '',
					isbn13 text not null default '',
					publisher text not null default '',
					format text not null default '',
					language text not null default '',
					publication_date text not null default '',
					publication_year int,
					page_count int not null default 0,
					cover_url text not null default '',
					google_books_id text not null default '',
					open_library_work_id text not null default '',
					open_library_edition_id text not null default '',
					external_ids jsonb not null default '{}'::jsonb,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now(),
					unique (work_id, edition_key)
				)
			`;
			await sql`alter table user_book add column if not exists edition_id bigint references book_edition(id) on delete set null`;
			await sql`create index if not exists idx_book_work_id on book(work_id)`;
			await sql`create index if not exists idx_book_edition_work on book_edition(work_id)`;
			await sql`create unique index if not exists idx_book_edition_book on book_edition(book_id) where book_id is not null`;
			await sql`create index if not exists idx_user_book_edition on user_book(edition_id) where edition_id is not null`;
		})();
	}
	try {
		await schemaReady;
	} catch (error) {
		schemaReady = null;
		throw error;
	}
	if (options.backfill === false) return;
	if (!backfillReady) {
		backfillReady = (async () => {
			const backfillRows = await sql<Array<{ needs_backfill: boolean }>>`
				select exists (
					select 1
					from book b
					left join book_edition be on be.book_id = b.id
					where b.work_id is null
						or be.id is null
					limit 1
				) as needs_backfill
			`;
			if (backfillRows[0]?.needs_backfill) {
				await backfillCanonicalWorks(sql);
			}
		})();
	}
	try {
		await backfillReady;
	} catch (error) {
		backfillReady = null;
		throw error;
	}
}

function numeric(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function bookEditionUpdateDebugParams(input: {
	workId: number;
	bookId: number;
	editionKey: string;
	normalizedIsbn10: string;
	normalizedIsbn13: string;
	normalizedPublisher: string;
	normalizedFormat: string;
	normalizedLanguage: string;
	normalizedPublicationDate: string;
	publicationYear: number | null;
	normalizedPageCount: number;
	normalizedCoverUrl: string;
	normalizedGoogleBooksId: string;
	normalizedOpenLibraryWorkId: string;
	normalizedOpenLibraryEditionId: string;
	normalizedExternalIds: string;
	editionTitle: string;
	targetEditionId: number;
}): SqlDebugParam[] {
	return [
		{ name: "workId", pgType: "bigint", value: input.workId },
		{ name: "bookId", pgType: "bigint", value: input.bookId },
		{ name: "editionKey", pgType: "text", value: input.editionKey },
		{ name: "isbn10_presence_check", pgType: "text", value: input.normalizedIsbn10 },
		{ name: "isbn10_value", pgType: "text", value: input.normalizedIsbn10 },
		{ name: "isbn13_presence_check", pgType: "text", value: input.normalizedIsbn13 },
		{ name: "isbn13_value", pgType: "text", value: input.normalizedIsbn13 },
		{ name: "publisher_presence_check", pgType: "text", value: input.normalizedPublisher },
		{ name: "publisher_value", pgType: "text", value: input.normalizedPublisher },
		{ name: "format_presence_check", pgType: "text", value: input.normalizedFormat },
		{ name: "format_value", pgType: "text", value: input.normalizedFormat },
		{ name: "language_presence_check", pgType: "text", value: input.normalizedLanguage },
		{ name: "language_value", pgType: "text", value: input.normalizedLanguage },
		{ name: "publicationDate_presence_check", pgType: "text", value: input.normalizedPublicationDate },
		{ name: "publicationDate_value", pgType: "text", value: input.normalizedPublicationDate },
		{ name: "publicationYear", pgType: "int", value: input.publicationYear },
		{ name: "pageCount", pgType: "int", value: input.normalizedPageCount },
		{ name: "coverUrl_presence_check", pgType: "text", value: input.normalizedCoverUrl },
		{ name: "coverUrl_value", pgType: "text", value: input.normalizedCoverUrl },
		{ name: "googleBooksId_presence_check", pgType: "text", value: input.normalizedGoogleBooksId },
		{ name: "googleBooksId_value", pgType: "text", value: input.normalizedGoogleBooksId },
		{ name: "openLibraryWorkId_presence_check", pgType: "text", value: input.normalizedOpenLibraryWorkId },
		{ name: "openLibraryWorkId_value", pgType: "text", value: input.normalizedOpenLibraryWorkId },
		{ name: "openLibraryEditionId_presence_check", pgType: "text", value: input.normalizedOpenLibraryEditionId },
		{ name: "openLibraryEditionId_value", pgType: "text", value: input.normalizedOpenLibraryEditionId },
		{ name: "externalIds", pgType: "jsonb", value: input.normalizedExternalIds },
		{ name: "editionTitle", pgType: "text", value: input.editionTitle },
		{ name: "targetEditionId", pgType: "bigint", value: input.targetEditionId }
	];
}

function bookEditionInsertDebugParams(input: {
	workId: number;
	bookId: number;
	editionKey: string;
	normalizedIsbn10: string;
	normalizedIsbn13: string;
	normalizedPublisher: string;
	normalizedFormat: string;
	normalizedLanguage: string;
	normalizedPublicationDate: string;
	publicationYear: number | null;
	normalizedPageCount: number;
	normalizedCoverUrl: string;
	normalizedGoogleBooksId: string;
	normalizedOpenLibraryWorkId: string;
	normalizedOpenLibraryEditionId: string;
	normalizedExternalIds: string;
	editionTitle: string;
}): SqlDebugParam[] {
	return [
		{ name: "workId", pgType: "bigint", value: input.workId },
		{ name: "bookId", pgType: "bigint", value: input.bookId },
		{ name: "editionKey", pgType: "text", value: input.editionKey },
		{ name: "isbn10", pgType: "text", value: input.normalizedIsbn10 },
		{ name: "isbn13", pgType: "text", value: input.normalizedIsbn13 },
		{ name: "publisher", pgType: "text", value: input.normalizedPublisher },
		{ name: "format", pgType: "text", value: input.normalizedFormat },
		{ name: "language", pgType: "text", value: input.normalizedLanguage },
		{ name: "publicationDate", pgType: "text", value: input.normalizedPublicationDate },
		{ name: "publicationYear", pgType: "int", value: input.publicationYear },
		{ name: "pageCount", pgType: "int", value: input.normalizedPageCount },
		{ name: "coverUrl", pgType: "text", value: input.normalizedCoverUrl },
		{ name: "googleBooksId", pgType: "text", value: input.normalizedGoogleBooksId },
		{ name: "openLibraryWorkId", pgType: "text", value: input.normalizedOpenLibraryWorkId },
		{ name: "openLibraryEditionId", pgType: "text", value: input.normalizedOpenLibraryEditionId },
		{ name: "externalIds", pgType: "jsonb", value: input.normalizedExternalIds },
		{ name: "editionTitle", pgType: "text", value: input.editionTitle }
	];
}

function canonicalWorkTitleForBackfill(row: CanonicalWorkBackfillRow) {
	const rawTitle = normalizeCatalogText(row.title) || "Untitled";
	const seriesTitle = normalizeRedundantSeriesTitle({
		title: rawTitle,
		seriesName: row.series_name,
		bookOrder: row.book_order
	});
	const editionTitle = normalizeRedundantEditionTitle({ title: seriesTitle.title || rawTitle });
	return editionTitle.title || seriesTitle.title || rawTitle;
}

function backfillQuality(book: CanonicalWorkBackfillBook) {
	return numeric(book.shelf_count) * 8
		+ numeric(book.rating_count) * 4
		+ (normalizeCatalogText(book.cover_url) ? 3 : 0)
		+ (normalizeCatalogText(book.synopsis) ? 2 : 0)
		+ (numeric(book.series_id) > 0 && numeric(book.book_order) > 0 ? 2 : 0)
		+ (normalizeCatalogIsbn(book.isbn13) || normalizeCatalogIsbn(book.isbn10) ? 1 : 0);
}

export function buildCanonicalWorkBackfillPlan(rows: CanonicalWorkBackfillRow[]): CanonicalWorkBackfillPlan[] {
	const groups = new Map<string, CanonicalWorkBackfillBook[]>();
	for (const row of rows) {
		const canonicalTitle = canonicalWorkTitleForBackfill(row);
		const author = normalizeCatalogText(row.primary_author);
		const workKey = canonicalCatalogWorkKey({ title: canonicalTitle, author });
		if (!workKey) continue;
		const book: CanonicalWorkBackfillBook = {
			...row,
			workKey,
			canonicalTitle,
			editionTitle: normalizeCatalogText(row.title) || canonicalTitle
		};
		groups.set(workKey, [...(groups.get(workKey) || []), book]);
	}
	return Array.from(groups.entries()).map(([workKey, books]) => {
		const representative = [...books].sort((a, b) => backfillQuality(b) - backfillQuality(a) || numeric(a.id) - numeric(b.id))[0];
		return {
			workKey,
			canonicalTitle: representative.canonicalTitle,
			representative,
			books
		};
	});
}

async function backfillCanonicalWorks(sql: Sql) {
	const rows = await sql<CanonicalWorkBackfillRow[]>`
		select
			b.id,
			coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			b.author_id,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
			b.published_year,
			b.page_count,
			coalesce(nullif(trim(b.language), ''), '') as language,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			coalesce(nullif(trim(b.publisher), ''), '') as publisher,
			sb.series_id,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			sb.book_order,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(sc.rating_count, 0)::int as rating_count
		from book b
		left join series_book sb on sb.book_id = b.id
		left join series s on s.id = sb.series_id
		left join lateral (
			select
				count(*)::int as shelf_count,
				count(*) filter (where rating is not null)::int as rating_count
			from user_book ub
			where ub.book_id = b.id
		) sc on true
	`;
	const plans = buildCanonicalWorkBackfillPlan(rows);
	for (const plan of plans) {
		const representative = plan.representative;
		const workRows = await sql<Array<{ id: number }>>`
			insert into book_work (
				work_key,
				title,
				canonical_title,
				primary_author,
				author_id,
				description,
				series_id,
				series_position,
				original_publication_year,
				preferred_cover_url,
				updated_at
			)
			values (
				${plan.workKey},
				${plan.canonicalTitle},
				${plan.canonicalTitle},
				${normalizeCatalogText(representative.primary_author)},
				${numeric(representative.author_id) > 0 ? numeric(representative.author_id) : null},
				${normalizeCatalogText(representative.synopsis)},
				${numeric(representative.series_id) > 0 ? numeric(representative.series_id) : null},
				${numeric(representative.book_order) > 0 ? numeric(representative.book_order) : null},
				${numeric(representative.published_year) > 0 ? numeric(representative.published_year) : null},
				${normalizeCatalogText(representative.cover_url)},
				now()
			)
			on conflict (work_key) do update set
				title = case when excluded.title <> '' then excluded.title else book_work.title end,
				canonical_title = case when excluded.canonical_title <> '' then excluded.canonical_title else book_work.canonical_title end,
				primary_author = case when excluded.primary_author <> '' then excluded.primary_author else book_work.primary_author end,
				author_id = coalesce(excluded.author_id, book_work.author_id),
				description = case when excluded.description <> '' then excluded.description else book_work.description end,
				series_id = coalesce(book_work.series_id, excluded.series_id),
				series_position = coalesce(book_work.series_position, excluded.series_position),
				original_publication_year = coalesce(book_work.original_publication_year, excluded.original_publication_year),
				preferred_cover_url = case when excluded.preferred_cover_url <> '' then excluded.preferred_cover_url else book_work.preferred_cover_url end,
				updated_at = now()
			returning id
		`;
		const workId = numeric(workRows[0]?.id);
		if (workId <= 0) continue;
		for (const book of plan.books) {
			await sql`
				update book
				set work_id = ${workId}, updated_at = now()
				where id = ${numeric(book.id)}
					and (work_id is distinct from ${workId})
			`;
		}
	}
	await sql`
		update book_edition be
		set
			work_id = b.work_id,
			isbn10 = case when coalesce(nullif(trim(b.isbn10), ''), '') <> '' then coalesce(nullif(trim(b.isbn10), ''), '') else be.isbn10 end,
			isbn13 = case when coalesce(nullif(trim(b.isbn13), ''), '') <> '' then coalesce(nullif(trim(b.isbn13), ''), '') else be.isbn13 end,
			publisher = case when coalesce(nullif(trim(b.publisher), ''), '') <> '' then coalesce(nullif(trim(b.publisher), ''), '') else be.publisher end,
			language = case when coalesce(nullif(trim(b.language), ''), '') <> '' then coalesce(nullif(trim(b.language), ''), '') else be.language end,
			publication_year = coalesce(be.publication_year, b.published_year),
			page_count = greatest(be.page_count, coalesce(nullif(b.page_count, 0), 0)::int),
			cover_url = case when coalesce(nullif(trim(b.cover_url), ''), '') <> '' then coalesce(nullif(trim(b.cover_url), ''), '') else be.cover_url end,
			google_books_id = case when coalesce(nullif(trim(b.google_books_id), ''), '') <> '' then coalesce(nullif(trim(b.google_books_id), ''), '') else be.google_books_id end,
			updated_at = now()
		from book b
		where be.book_id = b.id
			and b.work_id is not null
	`;
	await sql`
		insert into book_edition (
			work_id,
			book_id,
			edition_key,
			isbn10,
			isbn13,
			publisher,
			language,
			publication_year,
			page_count,
			cover_url,
			google_books_id
		)
		select
			b.work_id,
			b.id,
			'book:' || b.id::text,
			coalesce(nullif(trim(b.isbn10), ''), ''),
			coalesce(nullif(trim(b.isbn13), ''), ''),
			coalesce(nullif(trim(b.publisher), ''), ''),
			coalesce(nullif(trim(b.language), ''), ''),
			b.published_year,
			coalesce(nullif(b.page_count, 0), 0)::int,
			coalesce(nullif(trim(b.cover_url), ''), ''),
			coalesce(nullif(trim(b.google_books_id), ''), '')
		from book b
		left join book_edition existing on existing.book_id = b.id
		where b.work_id is not null
			and existing.id is null
		on conflict (work_id, edition_key) do update set
			book_id = coalesce(book_edition.book_id, excluded.book_id),
			isbn10 = case when excluded.isbn10 <> '' then excluded.isbn10 else book_edition.isbn10 end,
			isbn13 = case when excluded.isbn13 <> '' then excluded.isbn13 else book_edition.isbn13 end,
			publisher = case when excluded.publisher <> '' then excluded.publisher else book_edition.publisher end,
			language = case when excluded.language <> '' then excluded.language else book_edition.language end,
			publication_year = coalesce(excluded.publication_year, book_edition.publication_year),
			page_count = greatest(book_edition.page_count, excluded.page_count),
			cover_url = case when excluded.cover_url <> '' then excluded.cover_url else book_edition.cover_url end,
			google_books_id = case when excluded.google_books_id <> '' then excluded.google_books_id else book_edition.google_books_id end,
			updated_at = now()
	`;
	await sql`
		update user_book ub
		set edition_id = be.id
		from book_edition be
		where be.book_id = ub.book_id
			and ub.edition_id is null
	`;
}

export async function resolveRepresentativeBookId(sql: Sql, bookId: number, options: { skipSchemaBackfill?: boolean } = {}) {
	const normalizedBookId = Math.max(0, Number(bookId || 0) || 0);
	if (!normalizedBookId) return 0;
	await ensureCanonicalWorkSchema(sql, { backfill: options.skipSchemaBackfill !== true });
	const rows = await sql<Array<{ representative_book_id: number }>>`
		with target as (
			select work_id
			from book
			where id = ${normalizedBookId}
			limit 1
		)
		select b.id as representative_book_id
		from book b
		join target t on t.work_id = b.work_id
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
	`;
	return Number(rows[0]?.representative_book_id || normalizedBookId);
}

export async function upsertWorkAndEdition(sql: Sql, input: CatalogEditionInput) {
	await ensureCanonicalWorkSchema(sql);
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	if (!bookId) return { workId: 0, editionId: 0, representativeBookId: 0 };
	const resolvedWorkId = Math.max(0, Number(input.resolvedWorkId || 0) || 0);
	const rawWorkTitle = normalizeCatalogText(input.canonicalTitle || input.title) || "Untitled";
	const workTitle = normalizeRedundantEditionTitle({ title: rawWorkTitle }).title || rawWorkTitle;
	const editionTitle = normalizeCatalogText(input.editionTitle || input.title);
	const workKey = canonicalCatalogWorkKey({ title: workTitle, author: input.author });
	const genres = Array.from(new Set((input.genres || []).map((item) => normalizeCatalogText(item)).filter(Boolean)));
	const subjects = Array.from(new Set([...(input.topics || [])].map((item) => normalizeCatalogText(item)).filter(Boolean)));
	const sources = input.sources || [];
	const openLibrary = sources.find((source) => source.source === "open_library");
	const editionKey = canonicalCatalogEditionKey({
		isbn10: input.isbn10,
		isbn13: input.isbn13,
		googleBooksId: input.googleBooksId,
		sources,
		fallback: `book:${bookId}`
	});
	const publicationYear = Number(input.publicationYear || input.originalPublicationYear || 0) || null;
	let workId = resolvedWorkId;
	if (workId > 0) {
		const existingWorkRows = await sql<Array<{ id: number }>>`
			update book_work
			set
				author_id = coalesce(book_work.author_id, ${Number(input.authorId || 0) > 0 ? Number(input.authorId || 0) : null}),
				description = case when book_work.description = '' and ${normalizeCatalogText(input.description)} <> '' then ${normalizeCatalogText(input.description)} else book_work.description end,
				subjects = case when cardinality(book_work.subjects) = 0 and cardinality(${subjects}::text[]) > 0 then ${subjects}::text[] else book_work.subjects end,
				genres = case when cardinality(book_work.genres) = 0 and cardinality(${genres}::text[]) > 0 then ${genres}::text[] else book_work.genres end,
				series_id = coalesce(book_work.series_id, ${Number(input.seriesId || 0) > 0 ? Number(input.seriesId || 0) : null}),
				series_position = coalesce(book_work.series_position, ${Number(input.seriesPosition || 0) > 0 ? Number(input.seriesPosition || 0) : null}),
				original_publication_year = coalesce(book_work.original_publication_year, ${Number(input.originalPublicationYear || 0) > 0 ? Number(input.originalPublicationYear || 0) : publicationYear}),
				preferred_cover_url = case when book_work.preferred_cover_url = '' and ${normalizeCatalogText(input.coverUrl)} <> '' then ${normalizeCatalogText(input.coverUrl)} else book_work.preferred_cover_url end,
				updated_at = now()
			where id = ${workId}
			returning id
		`;
		workId = Number(existingWorkRows[0]?.id || 0);
	}
	if (workId <= 0) {
		const workRows = await sql<Array<{ id: number }>>`
			insert into book_work (
				work_key,
				title,
				canonical_title,
				primary_author,
				author_id,
				description,
				subjects,
				genres,
				series_id,
				series_position,
				original_publication_year,
				preferred_cover_url,
				updated_at
			)
			values (
				${workKey},
				${workTitle},
				${workTitle},
				${normalizeCatalogText(input.author)},
				${Number(input.authorId || 0) > 0 ? Number(input.authorId || 0) : null},
				${normalizeCatalogText(input.description)},
				${subjects}::text[],
				${genres}::text[],
				${Number(input.seriesId || 0) > 0 ? Number(input.seriesId || 0) : null},
				${Number(input.seriesPosition || 0) > 0 ? Number(input.seriesPosition || 0) : null},
				${Number(input.originalPublicationYear || 0) > 0 ? Number(input.originalPublicationYear || 0) : publicationYear},
				${normalizeCatalogText(input.coverUrl)},
				now()
			)
			on conflict (work_key) do update set
				title = case when excluded.title <> '' then excluded.title else book_work.title end,
				canonical_title = case when excluded.canonical_title <> '' then excluded.canonical_title else book_work.canonical_title end,
				primary_author = case when excluded.primary_author <> '' then excluded.primary_author else book_work.primary_author end,
				author_id = coalesce(excluded.author_id, book_work.author_id),
				description = case when excluded.description <> '' then excluded.description else book_work.description end,
				subjects = case when cardinality(excluded.subjects) > 0 then excluded.subjects else book_work.subjects end,
				genres = case when cardinality(excluded.genres) > 0 then excluded.genres else book_work.genres end,
				series_id = coalesce(excluded.series_id, book_work.series_id),
				series_position = coalesce(excluded.series_position, book_work.series_position),
				original_publication_year = coalesce(book_work.original_publication_year, excluded.original_publication_year),
				preferred_cover_url = case when excluded.preferred_cover_url <> '' then excluded.preferred_cover_url else book_work.preferred_cover_url end,
				updated_at = now()
			returning id
		`;
		workId = Number(workRows[0]?.id || 0);
	}
	if (!workId) return { workId: 0, editionId: 0, representativeBookId: bookId };
	await sql`
		update book
		set work_id = ${workId}
		where id = ${bookId}
			and (work_id is distinct from ${workId})
	`;
	const normalizedIsbn10 = normalizeCatalogIsbn(input.isbn10);
	const normalizedIsbn13 = normalizeCatalogIsbn(input.isbn13);
	const normalizedPublisher = normalizeCatalogText(input.publisher);
	const normalizedFormat = normalizeCatalogText(input.format) || "Book";
	const normalizedLanguage = normalizeCatalogText(input.language);
	const normalizedPublicationDate = normalizeCatalogText(input.publicationDate);
	const normalizedPageCount = Math.max(0, Number(input.pageCount || 0) || 0);
	const normalizedCoverUrl = normalizeCatalogText(input.coverUrl);
	const normalizedGoogleBooksId = normalizeCatalogText(input.googleBooksId);
	const normalizedOpenLibraryWorkId = normalizeCatalogText(openLibrary?.sourceWorkId);
	const normalizedOpenLibraryEditionId = normalizeCatalogText(openLibrary?.sourceEditionId);
	const normalizedExternalIds = JSON.stringify({
		sources: sources.map((source) => ({
			source: source.source,
			sourceWorkId: normalizeCatalogText(source.sourceWorkId),
			sourceEditionId: normalizeCatalogText(source.sourceEditionId),
			sourceUrl: normalizeCatalogText(source.sourceUrl)
		})),
		editionTitle
	});
	const editionDebugInput = {
		workId,
		bookId,
		editionKey,
		normalizedIsbn10,
		normalizedIsbn13,
		normalizedPublisher,
		normalizedFormat,
		normalizedLanguage,
		normalizedPublicationDate,
		publicationYear,
		normalizedPageCount,
		normalizedCoverUrl,
		normalizedGoogleBooksId,
		normalizedOpenLibraryWorkId,
		normalizedOpenLibraryEditionId,
		normalizedExternalIds,
		editionTitle
	};

	const existingByBookRows = await sql<Array<{ id: number }>>`
		select id
		from book_edition
		where book_id = ${bookId}
		limit 1
	`;
	const existingByKeyRows = await sql<Array<{ id: number }>>`
		select id
		from book_edition
		where work_id = ${workId}
			and edition_key = ${editionKey}
		limit 1
	`;

	let targetEditionId = Number(existingByBookRows[0]?.id || 0);
	const existingByKeyId = Number(existingByKeyRows[0]?.id || 0);

	if (targetEditionId > 0 && existingByKeyId > 0 && targetEditionId !== existingByKeyId) {
		await sql`
			update user_book
			set edition_id = ${existingByKeyId}
			where edition_id = ${targetEditionId}
		`;
		await sql`
			delete from book_edition
			where id = ${targetEditionId}
		`;
		targetEditionId = existingByKeyId;
	} else if (targetEditionId <= 0) {
		targetEditionId = existingByKeyId;
	}

	let editionRows: Array<{ id: number }> = [];
	if (targetEditionId > 0) {
		editionRows = await withSqlDebug(
			"catalogWorks.bookEdition.update",
			bookEditionUpdateDebugParams({ ...editionDebugInput, targetEditionId }),
			() => sql<Array<{ id: number }>>`
			update book_edition
			set
				work_id = ${workId},
				book_id = ${bookId},
				edition_key = ${editionKey},
				isbn10 = case when ${normalizedIsbn10} <> '' then ${normalizedIsbn10} else isbn10 end,
				isbn13 = case when ${normalizedIsbn13} <> '' then ${normalizedIsbn13} else isbn13 end,
				publisher = case when ${normalizedPublisher} <> '' then ${normalizedPublisher} else publisher end,
				format = case when ${normalizedFormat} <> '' then ${normalizedFormat} else format end,
				language = case when ${normalizedLanguage} <> '' then ${normalizedLanguage} else language end,
				publication_date = case when ${normalizedPublicationDate} <> '' then ${normalizedPublicationDate} else publication_date end,
				publication_year = coalesce(${publicationYear}, publication_year),
				page_count = greatest(page_count, ${normalizedPageCount}),
				cover_url = case when ${normalizedCoverUrl} <> '' then ${normalizedCoverUrl} else cover_url end,
				google_books_id = case when ${normalizedGoogleBooksId} <> '' then ${normalizedGoogleBooksId} else google_books_id end,
				open_library_work_id = case when ${normalizedOpenLibraryWorkId} <> '' then ${normalizedOpenLibraryWorkId} else open_library_work_id end,
				open_library_edition_id = case when ${normalizedOpenLibraryEditionId} <> '' then ${normalizedOpenLibraryEditionId} else open_library_edition_id end,
				external_ids = external_ids || ${normalizedExternalIds}::jsonb,
				metadata = metadata || jsonb_build_object('editionTitle', ${editionTitle}::text),
				updated_at = now()
			where id = ${targetEditionId}
			returning id
		`);
	} else {
		editionRows = await withSqlDebug(
			"catalogWorks.bookEdition.insert",
			bookEditionInsertDebugParams(editionDebugInput),
			() => sql<Array<{ id: number }>>`
			insert into book_edition (
				work_id,
				book_id,
				edition_key,
				isbn10,
				isbn13,
				publisher,
				format,
				language,
				publication_date,
				publication_year,
				page_count,
				cover_url,
				google_books_id,
				open_library_work_id,
				open_library_edition_id,
				external_ids,
				metadata,
				updated_at
			)
			values (
				${workId},
				${bookId},
				${editionKey},
				${normalizedIsbn10},
				${normalizedIsbn13},
				${normalizedPublisher},
				${normalizedFormat},
				${normalizedLanguage},
				${normalizedPublicationDate},
				${publicationYear},
				${normalizedPageCount},
				${normalizedCoverUrl},
				${normalizedGoogleBooksId},
				${normalizedOpenLibraryWorkId},
				${normalizedOpenLibraryEditionId},
				${normalizedExternalIds}::jsonb,
				jsonb_build_object('editionTitle', ${editionTitle}::text),
				now()
			)
			on conflict (work_id, edition_key) do update set
				book_id = coalesce(book_edition.book_id, excluded.book_id),
				isbn10 = case when excluded.isbn10 <> '' then excluded.isbn10 else book_edition.isbn10 end,
				isbn13 = case when excluded.isbn13 <> '' then excluded.isbn13 else book_edition.isbn13 end,
				publisher = case when excluded.publisher <> '' then excluded.publisher else book_edition.publisher end,
				format = case when excluded.format <> '' then excluded.format else book_edition.format end,
				language = case when excluded.language <> '' then excluded.language else book_edition.language end,
				publication_date = case when excluded.publication_date <> '' then excluded.publication_date else book_edition.publication_date end,
				publication_year = coalesce(excluded.publication_year, book_edition.publication_year),
				page_count = greatest(book_edition.page_count, excluded.page_count),
				cover_url = case when excluded.cover_url <> '' then excluded.cover_url else book_edition.cover_url end,
				google_books_id = case when excluded.google_books_id <> '' then excluded.google_books_id else book_edition.google_books_id end,
				open_library_work_id = case when excluded.open_library_work_id <> '' then excluded.open_library_work_id else book_edition.open_library_work_id end,
				open_library_edition_id = case when excluded.open_library_edition_id <> '' then excluded.open_library_edition_id else book_edition.open_library_edition_id end,
				external_ids = book_edition.external_ids || excluded.external_ids,
				metadata = book_edition.metadata || excluded.metadata,
				updated_at = now()
			returning id
		`);
	}
	return {
		workId,
		editionId: Number(editionRows[0]?.id || 0),
		representativeBookId: await resolveRepresentativeBookId(sql, bookId)
	};
}
