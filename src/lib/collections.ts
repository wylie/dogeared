import type { NeonQueryFunction } from "@neondatabase/serverless";

export type CollectionPublicationState = "draft" | "published" | "archived";

export type CollectionRecord = {
	id: number;
	title: string;
	slug: string;
	subtitle: string;
	description: string;
	editorialIntroduction: string;
	heroImage: string;
	category: string;
	featured: boolean;
	publicationState: CollectionPublicationState;
	sortOrder: number;
	bookCount: number;
	updatedAt: string;
};

export type CollectionBook = {
	collectionId: number;
	bookId: number;
	title: string;
	author: string;
	authorId: number;
	coverUrl: string;
	synopsis: string;
	pageCount: number;
	publishedYear: number;
	language: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	sortOrder: number;
	editorNote: string;
	featuredQuote: string;
	averageRating: number;
	ratingCount: number;
};

export type CollectionDetail = CollectionRecord & {
	books: CollectionBook[];
};

export type CollectionBookInput = {
	bookId: unknown;
	sortOrder?: unknown;
	editorNote?: unknown;
	featuredQuote?: unknown;
};

export type CollectionInput = {
	id?: unknown;
	title?: unknown;
	slug?: unknown;
	subtitle?: unknown;
	description?: unknown;
	editorialIntroduction?: unknown;
	heroImage?: unknown;
	category?: unknown;
	featured?: unknown;
	publicationState?: unknown;
	sortOrder?: unknown;
	books?: CollectionBookInput[];
};

function normalizeText(value: unknown, maxLength = 10000) {
	return String(value || "").trim().slice(0, maxLength);
}

function toCount(value: unknown) {
	return Math.max(0, Number(value || 0) || 0);
}

function toSortOrder(value: unknown) {
	const parsed = Number.parseInt(String(value || "0"), 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function slugifyCollection(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96) || "collection";
}

export function normalizeCollectionState(value: unknown): CollectionPublicationState {
	const state = normalizeText(value).toLowerCase();
	if (state === "published" || state === "archived") return state;
	return "draft";
}

export function isPublishedCollection(collection: Pick<CollectionRecord, "publicationState">) {
	return collection.publicationState === "published";
}

export function orderCollectionBooks<T extends { sortOrder?: number; title?: string }>(books: T[]) {
	return [...books].sort((a, b) => (
		toSortOrder(a.sortOrder) - toSortOrder(b.sortOrder)
		|| normalizeText(a.title).localeCompare(normalizeText(b.title))
	));
}

export function selectFeaturedCollections<T extends Pick<CollectionRecord, "featured" | "publicationState" | "sortOrder" | "title">>(collections: T[], limit = 2) {
	return [...collections]
		.filter((collection) => collection.featured && isPublishedCollection(collection))
		.sort((a, b) => toSortOrder(a.sortOrder) - toSortOrder(b.sortOrder) || a.title.localeCompare(b.title))
		.slice(0, Math.max(0, Number(limit) || 0));
}

function normalizeCollectionRow(row: any): CollectionRecord {
	return {
		id: toCount(row?.id),
		title: normalizeText(row?.title, 180),
		slug: slugifyCollection(row?.slug || row?.title),
		subtitle: normalizeText(row?.subtitle, 220),
		description: normalizeText(row?.description, 2000),
		editorialIntroduction: normalizeText(row?.editorial_introduction, 6000),
		heroImage: normalizeText(row?.hero_image, 1000),
		category: normalizeText(row?.category, 120),
		featured: !!row?.featured,
		publicationState: normalizeCollectionState(row?.publication_state),
		sortOrder: toSortOrder(row?.sort_order),
		bookCount: toCount(row?.book_count),
		updatedAt: normalizeText(row?.updated_at)
	};
}

function normalizeCollectionBookRow(row: any): CollectionBook {
	return {
		collectionId: toCount(row?.collection_id),
		bookId: toCount(row?.book_id),
		title: normalizeText(row?.title, 300) || "Untitled",
		author: normalizeText(row?.primary_author, 200) || "Unknown Author",
		authorId: toCount(row?.author_id),
		coverUrl: normalizeText(row?.cover_url, 1000),
		synopsis: normalizeText(row?.synopsis, 3000),
		pageCount: toCount(row?.page_count),
		publishedYear: toCount(row?.published_year),
		language: normalizeText(row?.language, 80),
		isbn10: normalizeText(row?.isbn10, 20),
		isbn13: normalizeText(row?.isbn13, 20),
		googleBooksId: normalizeText(row?.google_books_id, 120),
		sortOrder: toSortOrder(row?.sort_order),
		editorNote: normalizeText(row?.editor_note, 1200),
		featuredQuote: normalizeText(row?.featured_quote, 800),
		averageRating: Math.max(0, Math.min(5, Number(row?.average_rating || 0) || 0)),
		ratingCount: toCount(row?.rating_count)
	};
}

export async function ensureCollectionSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists collection (
			id bigserial primary key,
			title text not null,
			slug text not null unique,
			subtitle text not null default '',
			description text not null default '',
			editorial_introduction text not null default '',
			hero_image text not null default '',
			category text not null default '',
			featured boolean not null default false,
			publication_state text not null default 'draft' check (publication_state in ('draft', 'published', 'archived')),
			sort_order int not null default 0,
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`
		create table if not exists collection_book (
			collection_id bigint not null references collection(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			sort_order int not null default 0,
			editor_note text not null default '',
			featured_quote text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (collection_id, book_id)
		)
	`;
	await Promise.all([
		sql`create index if not exists idx_collection_public on collection(publication_state, featured, sort_order, title)`,
		sql`create index if not exists idx_collection_slug on collection(slug)`,
		sql`create index if not exists idx_collection_book_collection_order on collection_book(collection_id, sort_order, book_id)`,
		sql`create index if not exists idx_collection_book_book on collection_book(book_id)`
	]);
}

async function loadCollectionBooks(sql: NeonQueryFunction<false, false>, collectionIds: number[]) {
	const ids = Array.from(new Set(collectionIds.map((id) => toCount(id)).filter((id) => id > 0)));
	if (ids.length === 0) return new Map<number, CollectionBook[]>();
	const rows = await sql<any[]>`
		select
			cb.collection_id,
			cb.book_id,
			cb.sort_order,
			cb.editor_note,
			cb.featured_quote,
			b.title,
			b.primary_author,
			coalesce(b.author_id, 0)::bigint as author_id,
			coalesce(b.cover_url, '') as cover_url,
			coalesce(b.synopsis, '') as synopsis,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(b.published_year, 0)::int as published_year,
			coalesce(b.language, '') as language,
			coalesce(b.isbn10, '') as isbn10,
			coalesce(b.isbn13, '') as isbn13,
			coalesce(b.google_books_id, '') as google_books_id,
			coalesce(rt.average_rating, 0) as average_rating,
			coalesce(rt.rating_count, 0)::int as rating_count
		from collection_book cb
		join book b on b.id = cb.book_id
		left join lateral (
			select
				round(avg(ub.rating)::numeric, 2) as average_rating,
				count(*) filter (where ub.rating is not null)::int as rating_count
			from user_book ub
			where ub.book_id = b.id
		) rt on true
		where cb.collection_id = any(${ids}::bigint[])
		order by cb.collection_id asc, cb.sort_order asc, b.title asc
	`;
	const map = new Map<number, CollectionBook[]>();
	for (const row of rows) {
		const book = normalizeCollectionBookRow(row);
		const current = map.get(book.collectionId) || [];
		current.push(book);
		map.set(book.collectionId, current);
	}
	for (const [id, books] of map) map.set(id, orderCollectionBooks(books));
	return map;
}

export async function loadFeaturedCollections(sql: NeonQueryFunction<false, false>, limit = 2): Promise<CollectionDetail[]> {
	await ensureCollectionSchema(sql);
	const rows = await sql<any[]>`
		select
			c.*,
			(select count(*)::int from collection_book cb where cb.collection_id = c.id) as book_count
		from collection c
		where c.publication_state = 'published'
			and c.featured = true
		order by c.sort_order asc, c.updated_at desc, c.title asc
		limit ${Math.max(1, Math.min(4, Number(limit) || 2))}
	`;
	const collections = rows.map(normalizeCollectionRow);
	const bookMap = await loadCollectionBooks(sql, collections.map((collection) => collection.id));
	return collections.map((collection) => ({ ...collection, books: bookMap.get(collection.id) || [] }));
}

export async function loadPublishedCollections(sql: NeonQueryFunction<false, false>, limit = 60): Promise<CollectionRecord[]> {
	await ensureCollectionSchema(sql);
	const rows = await sql<any[]>`
		select
			c.*,
			(select count(*)::int from collection_book cb where cb.collection_id = c.id) as book_count
		from collection c
		where c.publication_state = 'published'
		order by c.featured desc, c.sort_order asc, c.updated_at desc, c.title asc
		limit ${Math.max(1, Math.min(100, Number(limit) || 60))}
	`;
	return rows.map(normalizeCollectionRow);
}

export async function loadCollectionBySlug(sql: NeonQueryFunction<false, false>, slug: string, options: { includeUnpublished?: boolean } = {}): Promise<CollectionDetail | null> {
	await ensureCollectionSchema(sql);
	const normalizedSlug = slugifyCollection(slug);
	if (!normalizedSlug) return null;
	const rows = await sql<any[]>`
		select
			c.*,
			(select count(*)::int from collection_book cb where cb.collection_id = c.id) as book_count
		from collection c
		where c.slug = ${normalizedSlug}
			and (${!!options.includeUnpublished}::boolean or c.publication_state = 'published')
		limit 1
	`;
	const collection = rows[0] ? normalizeCollectionRow(rows[0]) : null;
	if (!collection) return null;
	const bookMap = await loadCollectionBooks(sql, [collection.id]);
	return { ...collection, books: bookMap.get(collection.id) || [] };
}

export async function loadCollectionsForAuthor(
	sql: NeonQueryFunction<false, false>,
	input: { authorId?: number; authorName?: string },
	limit = 4,
	options: { ensureSchema?: boolean } = {}
): Promise<CollectionRecord[]> {
	if (options.ensureSchema !== false) await ensureCollectionSchema(sql);
	const authorId = toCount(input.authorId);
	const authorName = normalizeText(input.authorName).toLowerCase();
	if (authorId <= 0 && !authorName) return [];
	const rows = await sql<any[]>`
		select distinct
			c.*,
			(select count(*)::int from collection_book cb2 where cb2.collection_id = c.id) as book_count
		from collection c
		join collection_book cb on cb.collection_id = c.id
		join book b on b.id = cb.book_id
		where c.publication_state = 'published'
			and (
				(${authorId}::bigint > 0 and b.author_id = ${authorId}::bigint)
				or (${authorId}::bigint <= 0 and ${authorName} <> '' and lower(coalesce(b.primary_author, '')) = ${authorName})
			)
		order by c.featured desc, c.sort_order asc, c.title asc
		limit ${Math.max(1, Math.min(12, Number(limit) || 4))}
	`;
	return rows.map(normalizeCollectionRow);
}

export async function searchCollections(sql: NeonQueryFunction<false, false>, query: string, limit = 4): Promise<CollectionRecord[]> {
	await ensureCollectionSchema(sql);
	const normalized = normalizeText(query);
	if (!normalized) return [];
	const pattern = `%${normalized}%`;
	const rows = await sql<any[]>`
		select
			c.*,
			(select count(*)::int from collection_book cb where cb.collection_id = c.id) as book_count
		from collection c
		where c.publication_state = 'published'
			and (
				c.title ilike ${pattern}
				or c.subtitle ilike ${pattern}
				or c.description ilike ${pattern}
				or c.category ilike ${pattern}
			)
		order by
			case
				when lower(c.title) = lower(${normalized}) then 0
				when lower(c.title) like lower(${`${normalized}%`}) then 1
				else 9
			end,
			c.featured desc,
			c.sort_order asc,
			c.title asc
		limit ${Math.max(1, Math.min(12, Number(limit) || 4))}
	`;
	return rows.map(normalizeCollectionRow);
}

export async function loadAdminCollections(sql: NeonQueryFunction<false, false>): Promise<CollectionRecord[]> {
	await ensureCollectionSchema(sql);
	const rows = await sql<any[]>`
		select
			c.*,
			(select count(*)::int from collection_book cb where cb.collection_id = c.id) as book_count
		from collection c
		order by c.publication_state = 'published' desc, c.sort_order asc, c.updated_at desc, c.title asc
	`;
	return rows.map(normalizeCollectionRow);
}

export function parseCollectionBookLines(value: unknown): CollectionBookInput[] {
	return String(value || "")
		.split(/\r?\n/)
		.map((line, index) => {
			const [bookId, editorNote = "", featuredQuote = "", explicitOrder = ""] = line.split("|").map((part) => part.trim());
			return {
				bookId,
				editorNote,
				featuredQuote,
				sortOrder: explicitOrder || index + 1
			};
		})
		.filter((row) => toCount(row.bookId) > 0);
}

function normalizeCollectionInput(input: CollectionInput) {
	const title = normalizeText(input.title, 180);
	const slug = slugifyCollection(input.slug || title);
	return {
		id: toCount(input.id),
		title,
		slug,
		subtitle: normalizeText(input.subtitle, 220),
		description: normalizeText(input.description, 2000),
		editorialIntroduction: normalizeText(input.editorialIntroduction, 6000),
		heroImage: normalizeText(input.heroImage, 1000),
		category: normalizeText(input.category, 120),
		featured: input.featured === true || input.featured === "on" || input.featured === "true",
		publicationState: normalizeCollectionState(input.publicationState),
		sortOrder: toSortOrder(input.sortOrder),
		books: Array.isArray(input.books) ? input.books : []
	};
}

export async function saveCollection(sql: NeonQueryFunction<false, false>, input: CollectionInput) {
	await ensureCollectionSchema(sql);
	const normalized = normalizeCollectionInput(input);
	if (!normalized.title) return { ok: false, message: "Title is required.", collectionId: 0 };
	const rows = normalized.id > 0
		? await sql<Array<{ id: number }>>`
			update collection
			set
				title = ${normalized.title},
				slug = ${normalized.slug},
				subtitle = ${normalized.subtitle},
				description = ${normalized.description},
				editorial_introduction = ${normalized.editorialIntroduction},
				hero_image = ${normalized.heroImage},
				category = ${normalized.category},
				featured = ${normalized.featured},
				publication_state = ${normalized.publicationState},
				sort_order = ${normalized.sortOrder},
				updated_at = now()
			where id = ${normalized.id}
			returning id
		`
		: await sql<Array<{ id: number }>>`
			insert into collection (
				title, slug, subtitle, description, editorial_introduction, hero_image,
				category, featured, publication_state, sort_order
			)
			values (
				${normalized.title}, ${normalized.slug}, ${normalized.subtitle}, ${normalized.description}, ${normalized.editorialIntroduction}, ${normalized.heroImage},
				${normalized.category}, ${normalized.featured}, ${normalized.publicationState}, ${normalized.sortOrder}
			)
			returning id
		`;
	const collectionId = toCount(rows[0]?.id);
	if (collectionId <= 0) return { ok: false, message: "Collection was not saved.", collectionId: 0 };
	await sql`delete from collection_book where collection_id = ${collectionId}`;
	const books = normalized.books
		.map((book, index) => ({
			bookId: toCount(book.bookId),
			sortOrder: toSortOrder(book.sortOrder) || index + 1,
			editorNote: normalizeText(book.editorNote, 1200),
			featuredQuote: normalizeText(book.featuredQuote, 800)
		}))
		.filter((book) => book.bookId > 0);
	for (const book of books) {
		await sql`
			insert into collection_book (collection_id, book_id, sort_order, editor_note, featured_quote)
			values (${collectionId}, ${book.bookId}, ${book.sortOrder}, ${book.editorNote}, ${book.featuredQuote})
			on conflict (collection_id, book_id) do update set
				sort_order = excluded.sort_order,
				editor_note = excluded.editor_note,
				featured_quote = excluded.featured_quote,
				updated_at = now()
		`;
	}
	return { ok: true, message: "Collection saved.", collectionId };
}
