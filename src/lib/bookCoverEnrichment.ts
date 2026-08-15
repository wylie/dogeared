import { googleBooksCoverUrl, normalizeBookCoverUrl } from "./bookCovers.ts";
import { canonicalizeCatalogAuthor, canonicalizeCatalogTitle, normalizeCatalogIsbn, normalizeCatalogText } from "./catalogKeys.ts";
import { ensureCanonicalWorkSchema } from "./catalogWorks.ts";
import { ensureSeriesSchema } from "./series.ts";
import type { getNeonSql } from "./neon.ts";

type Sql = ReturnType<typeof getNeonSql>;

export type CoverEnrichmentBook = {
	seriesId?: number;
	bookId?: number;
	title?: string;
	author?: string;
	coverUrl?: string;
	isbn10?: string;
	isbn13?: string;
	googleBooksId?: string;
	bookOrder?: number;
};

type CoverLookupResult = {
	coverUrl: string;
	provider: string;
	metadata?: Record<string, unknown>;
};

const COVER_NO_RESULT_TTL_DAYS = 30;
const COVER_FAILURE_TTL_DAYS = 1;
const COVER_SUCCESS_TTL_DAYS = 365;
const MAX_SERIES_COVER_ENRICHMENTS_PER_PASS = 4;
const GOOGLE_BOOKS_API_KEY = normalizeCatalogText((import.meta as { env?: Record<string, unknown> }).env?.GOOGLE_BOOKS_API_KEY);

let coverSchemaReady: Promise<void> | null = null;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizePositiveNumber(value: unknown) {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function validCoverUrl(value: unknown) {
	const normalized = normalizeBookCoverUrl(value);
	if (!normalized) return "";
	if (!/^https?:\/\//i.test(normalized)) return "";
	return normalized;
}

export function buildCoverEnrichmentCacheKey(input: CoverEnrichmentBook) {
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	if (bookId > 0) return `book:${bookId}`;
	const seriesId = Math.max(0, Number(input.seriesId || 0) || 0);
	const order = normalizePositiveNumber(input.bookOrder);
	const title = canonicalizeCatalogTitle(input.title || "") || "untitled";
	const author = canonicalizeCatalogAuthor(input.author || "") || "unknown";
	return `series:${seriesId}:${order || "unknown"}:${title}:${author}`;
}

export async function ensureBookCoverEnrichmentSchema(sql: Sql) {
	if (!coverSchemaReady) {
		coverSchemaReady = (async () => {
			await ensureCanonicalWorkSchema(sql);
			await ensureSeriesSchema(sql);
			await sql`
				create table if not exists book_cover_enrichment_cache (
					cache_key text primary key,
					book_id bigint references book(id) on delete cascade,
					series_id bigint references series(id) on delete cascade,
					book_order numeric,
					title text not null default '',
					author text not null default '',
					status text not null default 'pending',
					provider text not null default '',
					cover_url text not null default '',
					attempt_count int not null default 0,
					attempted_at timestamptz,
					retry_after timestamptz,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now()
				)
			`;
			await sql`create index if not exists idx_book_cover_enrichment_retry on book_cover_enrichment_cache(status, retry_after)`;
			await sql`create index if not exists idx_book_cover_enrichment_book on book_cover_enrichment_cache(book_id) where book_id is not null`;
			await sql`create index if not exists idx_book_cover_enrichment_series on book_cover_enrichment_cache(series_id, book_order)`;
		})();
	}
	await coverSchemaReady;
}

async function loadExistingDogEaredCover(sql: Sql, input: CoverEnrichmentBook) {
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	if (bookId > 0) {
		const rows = await sql<Array<{ cover_url: string }>>`
			select coalesce(
				nullif(trim(b.cover_url), ''),
				nullif(trim(be.cover_url), ''),
				nullif(trim(bw.preferred_cover_url), ''),
				nullif(trim(sb.metadata ->> 'coverUrl'), ''),
				''
			) as cover_url
			from book b
			left join book_work bw on bw.id = b.work_id
			left join lateral (
				select cover_url
				from book_edition candidate
				where candidate.work_id = b.work_id
					and nullif(trim(candidate.cover_url), '') is not null
				order by
					case when candidate.book_id = b.id then 0 else 1 end,
					candidate.updated_at desc,
					candidate.id desc
				limit 1
			) be on true
			left join series_book sb on sb.book_id = b.id
				and (${Math.max(0, Number(input.seriesId || 0) || 0)} <= 0 or sb.series_id = ${Math.max(0, Number(input.seriesId || 0) || 0)})
			where b.id = ${bookId}
			limit 1
		`;
		return validCoverUrl(rows[0]?.cover_url);
	}
	const seriesId = Math.max(0, Number(input.seriesId || 0) || 0);
	const bookOrder = normalizePositiveNumber(input.bookOrder);
	if (seriesId <= 0 || bookOrder <= 0) return "";
	const rows = await sql<Array<{ cover_url: string }>>`
		select coalesce(nullif(trim(metadata ->> 'coverUrl'), ''), '') as cover_url
		from series_book
		where series_id = ${seriesId}
			and book_id is null
			and book_order = ${bookOrder}
		limit 1
	`;
	return validCoverUrl(rows[0]?.cover_url);
}

async function persistCover(sql: Sql, input: CoverEnrichmentBook, result: CoverLookupResult) {
	const coverUrl = validCoverUrl(result.coverUrl);
	if (!coverUrl) return;
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	const seriesId = Math.max(0, Number(input.seriesId || 0) || 0);
	const bookOrder = normalizePositiveNumber(input.bookOrder);
	if (bookId > 0) {
		await sql`
			update book
			set
				cover_url = case when nullif(trim(cover_url), '') is null then ${coverUrl} else cover_url end,
				updated_at = now()
			where id = ${bookId}
		`;
		await sql`
			update book_work bw
			set
				preferred_cover_url = case when nullif(trim(bw.preferred_cover_url), '') is null then ${coverUrl} else bw.preferred_cover_url end,
				metadata = bw.metadata || jsonb_build_object('coverEnrichment', jsonb_build_object('provider', ${result.provider}, 'updatedAt', now())),
				updated_at = now()
			from book b
			where b.id = ${bookId}
				and bw.id = b.work_id
		`;
		await sql`
			update book_edition
			set
				cover_url = case when nullif(trim(cover_url), '') is null then ${coverUrl} else cover_url end,
				metadata = metadata || jsonb_build_object('coverEnrichment', jsonb_build_object('provider', ${result.provider}, 'updatedAt', now())),
				updated_at = now()
			where book_id = ${bookId}
		`;
	}
	if (seriesId > 0 && bookOrder > 0) {
		if (bookId > 0) {
			await sql`
				update series_book
					set
						metadata = metadata || jsonb_build_object(
							'coverUrl', ${coverUrl}::text,
							'coverProvider', ${result.provider}::text,
							'coverEnrichedAt', now()
						),
					updated_at = now()
				where series_id = ${seriesId}
					and book_order = ${bookOrder}
					and book_id = ${bookId}
			`;
		} else {
			await sql`
				update series_book
					set
						metadata = metadata || jsonb_build_object(
							'coverUrl', ${coverUrl}::text,
							'coverProvider', ${result.provider}::text,
							'coverEnrichedAt', now()
						),
					updated_at = now()
				where series_id = ${seriesId}
					and book_order = ${bookOrder}
					and book_id is null
			`;
		}
	}
}

async function fetchJson(url: string) {
	try {
		const response = await fetch(url, { headers: { "User-Agent": "DogEared metadata enrichment" } });
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

async function lookupOpenLibraryCover(input: CoverEnrichmentBook): Promise<CoverLookupResult | null> {
	const isbn13 = normalizeCatalogIsbn(input.isbn13);
	const isbn10 = normalizeCatalogIsbn(input.isbn10);
	for (const isbn of [isbn13, isbn10].filter(Boolean)) {
		const bibkey = `ISBN:${isbn}`;
		const data = await fetchJson(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibkey)}&format=json&jscmd=data`);
		const row = data?.[bibkey];
		const coverUrl = validCoverUrl(row?.cover?.large || row?.cover?.medium || row?.cover?.small);
		if (coverUrl) return { coverUrl, provider: "open_library", metadata: { lookup: "isbn", isbn } };
	}
	const title = normalizeText(input.title);
	const author = normalizeText(input.author);
	if (!title) return null;
	const searchParams = new URLSearchParams({
		title,
		limit: "8"
	});
	if (author) searchParams.set("author", author);
	const data = await fetchJson(`https://openlibrary.org/search.json?${searchParams.toString()}`);
	const docs = Array.isArray(data?.docs) ? data.docs : [];
	const targetTitle = canonicalizeCatalogTitle(title);
	const targetAuthor = canonicalizeCatalogAuthor(author);
	let bestDoc: any = null;
	let bestScore = -1;
	for (const doc of docs) {
		const docTitle = canonicalizeCatalogTitle(doc?.title || "");
		const docAuthor = canonicalizeCatalogAuthor(Array.isArray(doc?.author_name) ? doc.author_name[0] : "");
		let score = 0;
		if (docTitle && targetTitle && docTitle === targetTitle) score += 120;
		if (docTitle && targetTitle && docTitle.includes(targetTitle)) score += 60;
		if (targetTitle && docTitle && targetTitle.includes(docTitle)) score += 40;
		if (docAuthor && targetAuthor && docAuthor === targetAuthor) score += 70;
		if (docAuthor && targetAuthor && docAuthor.includes(targetAuthor)) score += 30;
		if (Number(doc?.cover_i || 0) > 0) score += 30;
		if (score > bestScore) {
			bestScore = score;
			bestDoc = doc;
		}
	}
	const coverId = Math.max(0, Number(bestDoc?.cover_i || 0) || 0);
	if (coverId > 0) {
		return {
			coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`,
			provider: "open_library",
			metadata: { lookup: "search", key: normalizeText(bestDoc?.key) }
		};
	}
	return null;
}

async function fetchGoogleBooksJson(pathOrUrl: string) {
	const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `https://www.googleapis.com/books/v1/${pathOrUrl}`);
	if (GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
	return fetchJson(url.toString());
}

async function lookupGoogleBooksCover(input: CoverEnrichmentBook): Promise<CoverLookupResult | null> {
	const googleBooksId = normalizeCatalogText(input.googleBooksId);
	if (googleBooksId) {
		const direct = await fetchGoogleBooksJson(`volumes/${encodeURIComponent(googleBooksId)}`);
		const coverUrl = validCoverUrl(googleBooksCoverUrl(direct?.volumeInfo?.imageLinks, "card"));
		if (coverUrl) return { coverUrl, provider: "google_books", metadata: { lookup: "id", googleBooksId } };
	}
	const queries = [
		normalizeCatalogIsbn(input.isbn13) ? `isbn:${normalizeCatalogIsbn(input.isbn13)}` : "",
		normalizeCatalogIsbn(input.isbn10) ? `isbn:${normalizeCatalogIsbn(input.isbn10)}` : "",
		input.title && input.author ? `intitle:${normalizeText(input.title)} inauthor:${normalizeText(input.author)}` : "",
		input.title ? `intitle:${normalizeText(input.title)}` : ""
	].filter(Boolean);
	for (const query of queries) {
		const params = new URLSearchParams({ q: query, maxResults: "5", printType: "books" });
		const data = await fetchGoogleBooksJson(`volumes?${params.toString()}`);
		const items = Array.isArray(data?.items) ? data.items : [];
		for (const item of items) {
			const coverUrl = validCoverUrl(googleBooksCoverUrl(item?.volumeInfo?.imageLinks, "card"));
			if (coverUrl) {
				return {
					coverUrl,
					provider: "google_books",
					metadata: { lookup: "search", googleBooksId: normalizeCatalogText(item?.id) }
				};
			}
		}
	}
	return null;
}

async function readActiveCache(sql: Sql, cacheKey: string) {
	const rows = await sql<Array<{ status: string; cover_url: string; provider: string; retry_open: boolean }>>`
		select
			status,
			coalesce(cover_url, '') as cover_url,
			coalesce(provider, '') as provider,
			(retry_after is null or retry_after <= now()) as retry_open
		from book_cover_enrichment_cache
		where cache_key = ${cacheKey}
		limit 1
	`;
	const row = rows[0];
	if (!row) return null;
	const coverUrl = validCoverUrl(row.cover_url);
	if (coverUrl) return { status: row.status, coverUrl, provider: row.provider, retryOpen: row.retry_open };
	return { status: row.status, coverUrl: "", provider: row.provider, retryOpen: row.retry_open };
}

async function writeCache(sql: Sql, input: CoverEnrichmentBook, status: "found" | "none" | "failed", result?: CoverLookupResult) {
	const cacheKey = buildCoverEnrichmentCacheKey(input);
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	const seriesId = Math.max(0, Number(input.seriesId || 0) || 0);
	const bookOrder = normalizePositiveNumber(input.bookOrder);
	const retryDays = status === "found" ? COVER_SUCCESS_TTL_DAYS : (status === "none" ? COVER_NO_RESULT_TTL_DAYS : COVER_FAILURE_TTL_DAYS);
	await sql`
		insert into book_cover_enrichment_cache (
			cache_key,
			book_id,
			series_id,
			book_order,
			title,
			author,
			status,
			provider,
			cover_url,
			attempt_count,
			attempted_at,
			retry_after,
			metadata,
			updated_at
		)
		values (
			${cacheKey},
			${bookId > 0 ? bookId : null},
			${seriesId > 0 ? seriesId : null},
			${bookOrder > 0 ? bookOrder : null},
			${normalizeText(input.title)},
			${normalizeText(input.author)},
			${status},
			${result?.provider || ""},
			${validCoverUrl(result?.coverUrl)},
			1,
			now(),
			now() + (${retryDays} * interval '1 day'),
			${JSON.stringify(result?.metadata || {})}::jsonb,
			now()
		)
		on conflict (cache_key) do update set
			book_id = coalesce(excluded.book_id, book_cover_enrichment_cache.book_id),
			series_id = coalesce(excluded.series_id, book_cover_enrichment_cache.series_id),
			book_order = coalesce(excluded.book_order, book_cover_enrichment_cache.book_order),
			title = case when excluded.title <> '' then excluded.title else book_cover_enrichment_cache.title end,
			author = case when excluded.author <> '' then excluded.author else book_cover_enrichment_cache.author end,
			status = excluded.status,
			provider = excluded.provider,
			cover_url = excluded.cover_url,
			attempt_count = book_cover_enrichment_cache.attempt_count + 1,
			attempted_at = now(),
			retry_after = excluded.retry_after,
			metadata = book_cover_enrichment_cache.metadata || excluded.metadata,
			updated_at = now()
	`;
}

export async function enrichBookCover(sql: Sql, input: CoverEnrichmentBook) {
	await ensureBookCoverEnrichmentSchema(sql);
	const cacheKey = buildCoverEnrichmentCacheKey(input);
	const existing = validCoverUrl(input.coverUrl) || await loadExistingDogEaredCover(sql, input);
	if (existing) {
		const result = { coverUrl: existing, provider: "dogeared" };
		await persistCover(sql, input, result);
		await writeCache(sql, input, "found", result);
		return result;
	}
	const cached = await readActiveCache(sql, cacheKey);
	if (cached?.coverUrl) {
		const result = { coverUrl: cached.coverUrl, provider: cached.provider || "dogeared_cache" };
		await persistCover(sql, input, result);
		return result;
	}
	if (cached && !cached.retryOpen) return null;
	const openLibrary = await lookupOpenLibraryCover(input);
	if (openLibrary?.coverUrl) {
		await persistCover(sql, input, openLibrary);
		await writeCache(sql, input, "found", openLibrary);
		return openLibrary;
	}
	const googleBooks = await lookupGoogleBooksCover(input);
	if (googleBooks?.coverUrl) {
		await persistCover(sql, input, googleBooks);
		await writeCache(sql, input, "found", googleBooks);
		return googleBooks;
	}
	await writeCache(sql, input, "none");
	return null;
}

export async function enrichMissingSeriesBookCovers(sql: Sql, books: CoverEnrichmentBook[]) {
	await ensureBookCoverEnrichmentSchema(sql);
	const missing = books
		.filter((book) => !validCoverUrl(book.coverUrl) && normalizeText(book.title));
	let attempted = 0;
	for (const book of missing) {
		try {
			const cached = await readActiveCache(sql, buildCoverEnrichmentCacheKey(book));
			if (cached && !cached.coverUrl && !cached.retryOpen) continue;
			if (attempted >= MAX_SERIES_COVER_ENRICHMENTS_PER_PASS) break;
			attempted += 1;
			await enrichBookCover(sql, book);
		} catch (error) {
			console.error("[book.cover.enrichment]", error);
			await writeCache(sql, book, "failed").catch(() => {});
		}
	}
}
