import type { APIRoute } from "astro";
import { googleBooksCoverUrl } from "../../../lib/bookCovers";
import { getNeonSql } from "../../../lib/neon";
import { createPublicCacheControl, withRuntimeCache } from "../../../lib/runtimeCache";
import { ensureSeriesSchema, inferKnownSeriesMetadata } from "../../../lib/series";
import { searchCollections } from "../../../lib/collections";
import { resolveUserBySession } from "../../../lib/auth";
import { classifySearchAnalyticsSubject, recordProductAnalyticsEventSafe } from "../../../lib/productAnalytics";
import { normalizeSearchResult, type SearchResult } from "../../../lib/searchResults";

export const prerender = false;

type CollectionSearchResult = {
	title: string;
	slug: string;
	subtitle: string;
	description: string;
	heroImage: string;
	category: string;
	bookCount: number;
	featured: boolean;
};

function normalizeText(value: string) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s:]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalizeTitle(value: string) {
	let text = normalizeText(value);
	text = text.replace(/\([^)]*\)/g, " ");
	text = text.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition|spanish edition|french edition|german edition)\b/g, " ");
	text = text.split(":")[0] || text;
	text = text.replace(/^(the|a|an)\s+/g, "");
	return text.replace(/\s+/g, " ").trim();
}

function canonicalizeAuthor(value: string) {
	return normalizeText(value).replace(/^(by\s+)/, "").trim();
}

function detectFormat(input: {
	title?: string;
	subtitle?: string;
	description?: string;
	categories?: string[];
}): string {
	const haystack = normalizeText([
		input.title || "",
		input.subtitle || "",
		input.description || "",
		Array.isArray(input.categories) ? input.categories.join(" ") : ""
	].join(" "));
	if (/\b(ebook|e-book|kindle|digital edition)\b/.test(haystack)) return "Ebook";
	if (/\bpaperback\b/.test(haystack)) return "Paperback";
	if (/\b(hardcover|hardback)\b/.test(haystack)) return "Hardcover";
	return "Book";
}

function normalizedCoverKey(url: string) {
	const value = String(url || "").trim();
	if (!value) return "";
	try {
		const parsed = new URL(value);
		parsed.searchParams.delete("zoom");
		parsed.searchParams.delete("edge");
		parsed.searchParams.delete("source");
		parsed.searchParams.delete("imgtk");
		return parsed.toString();
	} catch {
		return value;
	}
}

function toVariant(result: SearchResult) {
	const authors = Array.isArray(result.authors) ? result.authors : [];
	const language = String(result.language || "").trim().toUpperCase();
	const year = String(result.publishedDate || "").match(/\d{4}/)?.[0] || "";
	const format = detectFormat({
		title: result.title,
		subtitle: result.subtitle,
		description: result.description,
		categories: result.categories
	});
	const summaryParts = [format, language || "Unknown language", year || "Unknown year"].filter(Boolean);
	const detailParts = [
		result.publisher ? `Publisher: ${result.publisher}` : "",
		result.pageCount && result.pageCount > 0 ? `${result.pageCount} pages` : "",
		result.isbn13 ? `ISBN-13 ${result.isbn13}` : (result.isbn10 ? `ISBN-10 ${result.isbn10}` : ""),
		String(result.publishedDate || "").trim() ? `Published ${String(result.publishedDate || "").trim()}` : ""
	].filter(Boolean);
	return {
		title: result.title,
		author: authors[0] || "",
		pageCount: Math.max(0, Number(result.pageCount) || 0),
		thumbnail: result.thumbnail || "",
		language: String(result.language || "").trim(),
		publishedDate: String(result.publishedDate || "").trim(),
		publisher: String(result.publisher || "").trim(),
		isbn10: String(result.isbn10 || "").trim(),
		isbn13: String(result.isbn13 || "").trim(),
		googleBooksId: String(result.googleBooksId || "").trim(),
		bookId: Number(result.bookId || 0) || 0,
		authorId: Number(result.authorId || 0) || 0,
		format,
		optionLabel: summaryParts.join(" • "),
		detailLabel: [format, ...detailParts].join(" • ")
	};
}

function scoreResult(result: SearchResult, queryText: string) {
	let score = 0;
	const q = normalizeText(queryText);
	const title = normalizeText(result.title);
	if (q && title.includes(q)) score += 140;
	if (q && title.startsWith(q)) score += 120;
	if (result.thumbnail) score += 65;
	if (result.isbn13) score += 55;
	else if (result.isbn10) score += 35;
	if (result.googleBooksId) score += 40;
	if (result.pageCount && result.pageCount > 0) score += 20;
	if (result.publisher) score += 14;
	if (result.publishedDate) score += 12;
	if (Array.isArray(result.authors) && result.authors.length > 0) score += 12;
	if (Array.isArray(result.categories) && result.categories.length > 0) score += 10;
	if (String(result.language || "").toLowerCase() === "en") score += 10;
	if (result.source === "dbd") score += 300;
	else if (result.source === "google_books") score += 200;
	else if (result.source === "open_library") score += 100;
	return score;
}

function tokenizeQuery(queryText: string) {
	return normalizeText(queryText)
		.split(" ")
		.filter((token) => token.length >= 2);
}

function expandedQueryVariants(queryText: string) {
	const normalized = normalizeText(queryText);
	const canonical = canonicalizeTitle(queryText);
	const tokens = normalized.split(" ").filter(Boolean);
	const nonStop = tokens.filter((token) => !["the", "a", "an", "of", "and", "for", "to", "in", "on", "at", "by", "with"].includes(token));
	const variants = [
		queryText,
		canonical,
		nonStop.slice(0, 4).join(" "),
		nonStop.slice(0, 3).join(" ")
	]
		.map((value) => String(value || "").trim())
		.filter(Boolean);
	return Array.from(new Set(variants));
}

function titleStem(value: string) {
	const tokens = canonicalizeTitle(value)
		.split(" ")
		.map((token) => token.trim())
		.filter(Boolean)
		.filter((token) => !["the", "a", "an", "of", "and", "for", "to", "in", "on", "at", "by", "with"].includes(token));
	return tokens.slice(0, 3).join(" ");
}

function isLikelyMatch(result: SearchResult, queryText: string) {
	const tokens = tokenizeQuery(queryText);
	if (tokens.length === 0) return true;
	const haystack = normalizeText([
		result.title,
		result.subtitle,
		...(Array.isArray(result.authors) ? result.authors : [])
	].join(" "));
	const strongTokens = tokens.filter((token) => token.length >= 4);
	if (strongTokens.length > 0) {
		return strongTokens.some((token) => haystack.includes(token));
	}
	return tokens.some((token) => haystack.includes(token));
}

function passesQualityGate(result: SearchResult) {
	const title = String(result.title || "").trim();
	const hasCover = !!String(result.thumbnail || "").trim();
	const hasDescription = !!String(result.description || "").trim();
	const hasIdentifier = !!String(result.isbn13 || result.isbn10 || result.googleBooksId || "").trim();
	// Keep this intentionally permissive: only drop extreme low-signal records.
	if (!hasCover && !hasDescription && !hasIdentifier && title.length > 220) return false;
	return true;
}

function formatSeriesSearchLabel(seriesName: string, bookOrder: number) {
	const name = String(seriesName || "").trim();
	if (!name) return "";
	const order = Number(bookOrder || 0);
	return order > 0 ? `${name} • Book ${order}` : name;
}

function dedupeVariants(input: SearchResult[], queryText: string) {
	const grouped = new Map<string, SearchResult[]>();
	for (const [index, result] of input.entries()) {
		const authors = Array.isArray(result.authors) ? result.authors : [];
		const primaryAuthor = authors[0] || "";
		const canonicalTitle = canonicalizeTitle(result.title);
		const stem = titleStem(result.title);
		const canonicalAuthor = canonicalizeAuthor(primaryAuthor);
		const isbnGroup = String(result.isbn13 || result.isbn10 || "").trim();
		const googleGroup = String(result.googleBooksId || "").trim();
		const workGroup = stem
			? `work:${stem}|${canonicalAuthor}`
			: (canonicalTitle ? `work:${canonicalTitle}|${canonicalAuthor}` : "");
		const key = workGroup || (isbnGroup
			? `isbn:${isbnGroup}`
			: (googleGroup ? `gid:${googleGroup}` : `ungrouped_${index}`));
		const existing = grouped.get(key) || [];
		existing.push(result);
		grouped.set(key, existing);
	}

	const deduped: SearchResult[] = [];
	for (const items of grouped.values()) {
		const sorted = [...items].sort((a, b) => scoreResult(b, queryText) - scoreResult(a, queryText));
		const seenVariantKeys = new Set<string>();
		const variants = sorted.map((item) => toVariant(item)).filter((variant) => {
			const key = [
				normalizeText(variant.googleBooksId),
				normalizeText(variant.isbn13 || variant.isbn10),
				canonicalizeTitle(variant.title),
				canonicalizeAuthor(variant.author),
				normalizeText(variant.format),
				normalizeText(variant.language),
				normalizeText(variant.publishedDate),
				normalizedCoverKey(variant.thumbnail)
			].join("|");
			if (seenVariantKeys.has(key)) return false;
			seenVariantKeys.add(key);
			return true;
		});
		const best = { ...sorted[0], variantCount: variants.length, variants };
		const seriesCarrier = sorted.find((item) => item.seriesName || item.seriesBookOrder || item.seriesLabel);
		if (seriesCarrier) {
			best.seriesName ||= seriesCarrier.seriesName;
			best.seriesBookOrder ||= seriesCarrier.seriesBookOrder;
			best.seriesLabel ||= seriesCarrier.seriesLabel;
		}
		deduped.push(best);
	}

	const sorted = deduped.sort((a, b) => scoreResult(b, queryText) - scoreResult(a, queryText));

	// Second-pass merge for near-duplicate editions that differ only by subtitle expansion.
	const merged: SearchResult[] = [];
	for (const candidate of sorted) {
		const candidateAuthors = Array.isArray(candidate.authors) ? candidate.authors : [];
		const candidateAuthor = canonicalizeAuthor(candidateAuthors[0] || "");
		const candidateTitle = canonicalizeTitle(candidate.title);
		const candidateStem = titleStem(candidate.title);
		let matched = false;
		for (let i = 0; i < merged.length; i += 1) {
			const existing = merged[i];
			const existingAuthors = Array.isArray(existing.authors) ? existing.authors : [];
			const existingAuthor = canonicalizeAuthor(existingAuthors[0] || "");
			if (!candidateAuthor || !existingAuthor || candidateAuthor !== existingAuthor) continue;
			const existingTitle = canonicalizeTitle(existing.title);
			const existingStem = titleStem(existing.title);
			const sameStem = candidateStem && existingStem && candidateStem === existingStem;
			const titleContains = candidateTitle && existingTitle && (
				candidateTitle.includes(existingTitle) || existingTitle.includes(candidateTitle)
			);
			if (sameStem || titleContains) {
				// Keep the higher-scored representative (already ordered), optionally backfill missing fields.
				const representative = existing;
				if (!representative.thumbnail && candidate.thumbnail) representative.thumbnail = candidate.thumbnail;
				if (!representative.description && candidate.description) representative.description = candidate.description;
				if (!representative.pageCount && candidate.pageCount) representative.pageCount = candidate.pageCount;
				if (!representative.publisher && candidate.publisher) representative.publisher = candidate.publisher;
				if (!representative.seriesName && candidate.seriesName) representative.seriesName = candidate.seriesName;
				if (!representative.seriesBookOrder && candidate.seriesBookOrder) representative.seriesBookOrder = candidate.seriesBookOrder;
				if (!representative.seriesLabel && candidate.seriesLabel) representative.seriesLabel = candidate.seriesLabel;
				matched = true;
				break;
			}
		}
		if (!matched) merged.push(candidate);
	}

	return merged;
}

export const GET: APIRoute = async ({ request, url }) => {
	const query = String(url.searchParams.get("q") || "").trim();
	const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
	const pageSize = Math.min(40, Math.max(10, Number(url.searchParams.get("pageSize") || 20) || 20));
	if (!query) {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const startIndex = (page - 1) * pageSize;
	const apiKey = String(import.meta.env.GOOGLE_BOOKS_API_KEY || "").trim();

	try {
		const sql = getNeonSql();
		await sql`alter table book add column if not exists publisher text not null default ''`;
		await ensureSeriesSchema(sql);
		const collectionResultsPromise = page === 1
			? searchCollections(sql, query, 4).then((collections): CollectionSearchResult[] => collections.map((collection) => ({
				title: collection.title,
				slug: collection.slug,
				subtitle: collection.subtitle,
				description: collection.description,
				heroImage: collection.heroImage,
				category: collection.category,
				bookCount: collection.bookCount,
				featured: collection.featured
			}))).catch(() => [])
			: Promise.resolve([] as CollectionSearchResult[]);
		const queryLike = `%${query}%`;
		const queryDigits = query.replace(/[^0-9Xx]/g, "").toUpperCase();
		const dbdRows = await withRuntimeCache(
			`search:dbd:${query.toLowerCase()}:${page}:${pageSize}`,
			20_000,
			() => sql<Array<{
				id: number;
				author_id: number | null;
				title: string;
				primary_author: string;
				synopsis: string;
				published_year: number | null;
				language: string;
				cover_url: string;
				isbn10: string;
				isbn13: string;
				google_books_id: string;
				page_count: number;
				publisher: string;
				series_name: string;
				series_book_order: number;
			}>>`
				select
					b.id,
					b.author_id,
					coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
					coalesce(nullif(trim(b.primary_author), ''), 'Unknown') as primary_author,
					coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
					b.published_year,
					coalesce(nullif(trim(b.language), ''), '') as language,
					coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
					coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
					coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
					coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
					coalesce(nullif(trim(b.publisher), ''), '') as publisher,
					coalesce(s.name, '') as series_name,
					coalesce(sb.book_order, 0)::numeric as series_book_order,
					coalesce(nullif(b.page_count, 0), 0)::int as page_count
				from book b
				left join series_book sb on sb.book_id = b.id
				left join series s on s.id = sb.series_id
				where
					b.title ilike ${queryLike}
					or b.primary_author ilike ${queryLike}
					or s.name ilike ${queryLike}
					or (${queryDigits} <> '' and (replace(coalesce(b.isbn13, ''), '-', '') = ${queryDigits} or replace(coalesce(b.isbn10, ''), '-', '') = ${queryDigits}))
				order by
					case
						when lower(coalesce(b.title, '')) = lower(${query}) then 0
						when lower(coalesce(b.title, '')) like lower(${`${query}%`}) then 1
						when lower(coalesce(b.primary_author, '')) = lower(${query}) then 2
						when lower(coalesce(s.name, '')) = lower(${query}) then 3
						else 9
					end,
					b.updated_at desc,
					b.id desc
				limit ${pageSize}
				offset ${startIndex}
			`
		);
		const dbdMapped: SearchResult[] = dbdRows.map((row) => ({
			source: "dbd",
			title: row.title,
			subtitle: "",
			authors: [String(row.primary_author || "").trim()].filter(Boolean),
			description: row.synopsis || "",
			publisher: row.publisher || "",
			publishedDate: row.published_year ? String(row.published_year) : "",
			printType: "BOOK",
			pageCount: Number(row.page_count || 0) || null,
			categories: [],
			language: row.language || "",
			thumbnail: row.cover_url || "",
			isbn10: row.isbn10 || "",
			isbn13: row.isbn13 || "",
			googleBooksId: row.google_books_id || "",
			bookId: Number(row.id || 0) || 0,
			authorId: Number(row.author_id || 0) || 0,
			seriesName: String(row.series_name || "").trim(),
			seriesBookOrder: Number(row.series_book_order || 0) || 0,
			seriesLabel: formatSeriesSearchLabel(String(row.series_name || ""), Number(row.series_book_order || 0) || 0)
		}));

		const fetchGoogleItems = async (q: string) => {
			if (!apiKey) return [] as any[];
			const params = new URLSearchParams({
				q,
				key: apiKey,
				maxResults: String(pageSize),
				startIndex: String(startIndex),
				printType: "books",
				orderBy: "relevance",
				langRestrict: "en"
			});
			const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
			if (!response.ok) return [];
			const data = await response.json();
			return Array.isArray(data.items) ? data.items : [];
		};

		const googleQueries = expandedQueryVariants(query);
		const googleFetchedSets = await Promise.all(
			googleQueries.map((q) => withRuntimeCache(
				`search:google:${q.toLowerCase()}:${page}:${pageSize}`,
				45_000,
				() => fetchGoogleItems(q)
			))
		);
		const byId = new Map<string, any>();
		for (const set of googleFetchedSets) {
			for (const item of Array.isArray(set) ? set : []) {
				const id = String(item?.id || "");
				if (!id) continue;
				if (!byId.has(id)) byId.set(id, item);
			}
		}
		const items = Array.from(byId.values());
		const googleMapped: SearchResult[] = items.map((item) => {
			const info = item.volumeInfo ?? {};
			const authors = Array.isArray(info.authors) ? info.authors : [];
			const inferredSeries = inferKnownSeriesMetadata({ title: info.title ?? "", author: authors[0] || "" });
			const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
			const isbn13 = String(
				(identifiers.find((entry) => String(entry?.type || "") === "ISBN_13")?.identifier || "")
			).replace(/[^0-9Xx]/g, "").toUpperCase();
			const isbn10 = String(
				(identifiers.find((entry) => String(entry?.type || "") === "ISBN_10")?.identifier || "")
			).replace(/[^0-9Xx]/g, "").toUpperCase();
			return {
				source: "google_books",
				title: info.title ?? "Untitled",
				subtitle: info.subtitle ?? "",
				authors,
				description: info.description ?? "",
				publisher: info.publisher ?? "",
				publishedDate: info.publishedDate ?? "",
				printType: info.printType ?? "",
				pageCount: typeof info.pageCount === "number" ? info.pageCount : null,
				categories: Array.isArray(info.categories) ? info.categories : [],
				language: info.language ?? "",
				thumbnail: googleBooksCoverUrl(info.imageLinks, "card"),
				isbn10,
				isbn13,
				googleBooksId: String(item?.id || "").trim(),
				seriesName: inferredSeries?.seriesName || "",
				seriesBookOrder: inferredSeries?.bookOrder || 0,
				seriesLabel: formatSeriesSearchLabel(inferredSeries?.seriesName || "", inferredSeries?.bookOrder || 0)
			};
		});

		const fetchOpenLibraryItems = async (q: string) => {
			const params = new URLSearchParams({
				q,
				limit: String(pageSize),
				offset: String(startIndex)
			});
			const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
			if (!response.ok) return [] as any[];
			const payload = await response.json().catch(() => null) as { docs?: any[] } | null;
			return Array.isArray(payload?.docs) ? payload.docs : [];
		};

		const openQueries = expandedQueryVariants(query);
		const openFetchedSets = await Promise.all(
			openQueries.map((q) => withRuntimeCache(
				`search:openlibrary:${q.toLowerCase()}:${page}:${pageSize}`,
				45_000,
				() => fetchOpenLibraryItems(q)
			))
		);
		const openByWork = new Map<string, any>();
		for (const set of openFetchedSets) {
			for (const doc of Array.isArray(set) ? set : []) {
				const key = String(doc?.key || "").trim() || [
					normalizeText(doc?.title),
					normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : ""),
					normalizeText(Array.isArray(doc?.isbn) ? doc.isbn[0] : "")
				].join("|");
				if (!openByWork.has(key)) openByWork.set(key, doc);
			}
		}
		const openItems = Array.from(openByWork.values());
		const openLibraryMapped: SearchResult[] = openItems.map((doc) => {
			const authorNames = Array.isArray(doc?.author_name) ? doc.author_name.map((v: unknown) => String(v || "").trim()).filter(Boolean) : [];
			const inferredSeries = inferKnownSeriesMetadata({ title: doc?.title || "", author: authorNames[0] || "" });
			const isbns = Array.isArray(doc?.isbn) ? doc.isbn.map((v: unknown) => String(v || "").replace(/[^0-9Xx]/g, "").toUpperCase()).filter(Boolean) : [];
			const isbn13 = isbns.find((value: string) => value.length === 13) || "";
			const isbn10 = isbns.find((value: string) => value.length === 10) || "";
			const coverId = Number(doc?.cover_i || 0) || 0;
			const pageCount = Number(doc?.number_of_pages_median || 0) || 0;
			return {
				source: "open_library",
				title: String(doc?.title || "Untitled").trim(),
				subtitle: "",
				authors: authorNames,
				description: "",
				publisher: Array.isArray(doc?.publisher) ? String(doc.publisher[0] || "").trim() : "",
				publishedDate: doc?.first_publish_year ? String(doc.first_publish_year) : "",
				printType: "BOOK",
				pageCount: pageCount > 0 ? pageCount : null,
				categories: Array.isArray(doc?.subject) ? doc.subject.slice(0, 5).map((v: unknown) => String(v || "").trim()).filter(Boolean) : [],
				language: Array.isArray(doc?.language) ? String(doc.language[0] || "").trim() : "",
				thumbnail: coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "",
				isbn10,
				isbn13,
				googleBooksId: "",
				seriesName: inferredSeries?.seriesName || "",
				seriesBookOrder: inferredSeries?.bookOrder || 0,
				seriesLabel: formatSeriesSearchLabel(inferredSeries?.seriesName || "", inferredSeries?.bookOrder || 0)
			};
		});

		const normalizedMapped = [...dbdMapped, ...googleMapped, ...openLibraryMapped]
			.map((result, index) => normalizeSearchResult(result, { source: "api.books.search", index, query }))
			.filter((result): result is SearchResult => !!result);

		const mapped = normalizedMapped
			.filter((result) => isLikelyMatch(result, query))
			.filter((result) => passesQualityGate(result));

		const googleIds = Array.from(new Set(mapped.map((item) => String(item.googleBooksId || "").trim()).filter(Boolean)));
		const isbn13s = Array.from(new Set(mapped.map((item) => String(item.isbn13 || "").trim()).filter(Boolean)));
		const isbn10s = Array.from(new Set(mapped.map((item) => String(item.isbn10 || "").trim()).filter(Boolean)));
		const catalogRows = await withRuntimeCache(
			`search:catalog:${googleIds.join(",")}:${isbn13s.join(",")}:${isbn10s.join(",")}`,
			20_000,
			() => sql<Array<{
				id: number;
				author_id: number | null;
				google_books_id: string;
				isbn13: string;
				isbn10: string;
				series_name: string;
				series_book_order: number;
			}>>`
				select
					b.id,
					b.author_id,
					coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
					coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
					coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
					coalesce(s.name, '') as series_name,
					coalesce(sb.book_order, 0)::numeric as series_book_order
				from book b
				left join series_book sb on sb.book_id = b.id
				left join series s on s.id = sb.series_id
				where
					(array_length(${googleIds}::text[], 1) is not null and b.google_books_id = any(${googleIds}::text[]))
					or (array_length(${isbn13s}::text[], 1) is not null and b.isbn13 = any(${isbn13s}::text[]))
					or (array_length(${isbn10s}::text[], 1) is not null and b.isbn10 = any(${isbn10s}::text[]))
			`
		);
		const byGoogleId = new Map<string, { bookId: number; authorId: number; seriesName: string; seriesBookOrder: number; seriesLabel: string }>();
		const byIsbn13 = new Map<string, { bookId: number; authorId: number; seriesName: string; seriesBookOrder: number; seriesLabel: string }>();
		const byIsbn10 = new Map<string, { bookId: number; authorId: number; seriesName: string; seriesBookOrder: number; seriesLabel: string }>();
		for (const row of catalogRows) {
			const seriesName = String(row.series_name || "").trim();
			const seriesBookOrder = Number(row.series_book_order || 0) || 0;
			const pair = {
				bookId: Number(row.id || 0),
				authorId: Number(row.author_id || 0) || 0,
				seriesName,
				seriesBookOrder,
				seriesLabel: formatSeriesSearchLabel(seriesName, seriesBookOrder)
			};
			if (pair.bookId <= 0) continue;
			const gid = String(row.google_books_id || "").trim();
			const i13 = String(row.isbn13 || "").trim();
			const i10 = String(row.isbn10 || "").trim();
			if (gid && !byGoogleId.has(gid)) byGoogleId.set(gid, pair);
			if (i13 && !byIsbn13.has(i13)) byIsbn13.set(i13, pair);
			if (i10 && !byIsbn10.has(i10)) byIsbn10.set(i10, pair);
		}
		const mappedWithIds = mapped.map((item) => {
			const match = byGoogleId.get(item.googleBooksId) || byIsbn13.get(item.isbn13) || byIsbn10.get(item.isbn10);
			const authors = Array.isArray(item.authors) ? item.authors : [];
			const inferredSeries = item.seriesName ? null : inferKnownSeriesMetadata({ title: item.title, author: authors[0] || "" });
			const seriesName = item.seriesName || match?.seriesName || inferredSeries?.seriesName || "";
			const seriesBookOrder = Number(item.seriesBookOrder || 0) > 0
				? Number(item.seriesBookOrder || 0)
				: (match?.seriesBookOrder || inferredSeries?.bookOrder || 0);
			return {
				...item,
				bookId: Number(item.bookId || 0) > 0 ? Number(item.bookId || 0) : (match?.bookId || 0),
				authorId: Number(item.authorId || 0) > 0 ? Number(item.authorId || 0) : (match?.authorId || 0),
				seriesName,
				seriesBookOrder,
				seriesLabel: item.seriesLabel || match?.seriesLabel || formatSeriesSearchLabel(seriesName, seriesBookOrder)
			};
		})
			.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.catalog", index, query }))
			.filter((result): result is SearchResult => !!result);
		const results = dedupeVariants(mappedWithIds, query)
			.map((result, index) => normalizeSearchResult(result, { source: "api.books.search.dedupe", index, query }))
			.filter((result): result is SearchResult => !!result);
		const collectionResults = await collectionResultsPromise;
		const hasMore = dbdRows.length >= pageSize || items.length >= pageSize || openItems.length >= pageSize;
		const session = await resolveUserBySession(request).catch(() => null);
		await recordProductAnalyticsEventSafe(sql, {
			eventName: "search_performed",
			eventGroup: "search",
			userId: session?.userId || "",
			route: "/search",
			source: "book_search",
			subjectType: classifySearchAnalyticsSubject({ query, results }),
			query,
			resultCount: results.length + collectionResults.length,
			metadata: {
				page,
				hasCollections: collectionResults.length > 0,
				hasMore
			}
		});
		return new Response(JSON.stringify({ results, collectionResults, hasMore, page }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": createPublicCacheControl(30, 120)
			}
		});
	} catch {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}
};
