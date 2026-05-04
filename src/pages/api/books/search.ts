import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

type SearchResult = {
	title: string;
	subtitle: string;
	authors: string[];
	description: string;
	publisher: string;
	publishedDate: string;
	printType: string;
	pageCount: number | null;
	categories: string[];
	language: string;
	thumbnail: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	bookId?: number;
	authorId?: number;
	variantCount?: number;
	variants?: Array<{
		title: string;
		author: string;
		pageCount: number;
		thumbnail: string;
		language: string;
		publishedDate: string;
		publisher: string;
		isbn10: string;
		isbn13: string;
		googleBooksId: string;
		bookId?: number;
		authorId?: number;
		format: string;
		optionLabel: string;
		detailLabel: string;
	}>;
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
		author: result.authors[0] || "",
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
	return score;
}

function tokenizeQuery(queryText: string) {
	return normalizeText(queryText)
		.split(" ")
		.filter((token) => token.length >= 2);
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

function dedupeVariants(input: SearchResult[], queryText: string) {
	const grouped = new Map<string, SearchResult[]>();
	for (const [index, result] of input.entries()) {
		const primaryAuthor = result.authors[0] || "";
		const canonicalTitle = canonicalizeTitle(result.title);
		const canonicalAuthor = canonicalizeAuthor(primaryAuthor);
		const isbnGroup = String(result.isbn13 || result.isbn10 || "").trim();
		const googleGroup = String(result.googleBooksId || "").trim();
		const key = isbnGroup
			? `isbn:${isbnGroup}`
			: (googleGroup
				? `gid:${googleGroup}`
				: (canonicalTitle ? `${canonicalTitle}|${canonicalAuthor}` : `ungrouped_${index}`));
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
		deduped.push(best);
	}

	return deduped.sort((a, b) => scoreResult(b, queryText) - scoreResult(a, queryText));
}

export const GET: APIRoute = async ({ url }) => {
	const query = String(url.searchParams.get("q") || "").trim();
	const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
	const pageSize = Math.min(40, Math.max(10, Number(url.searchParams.get("pageSize") || 20) || 20));
	if (!query) {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const apiKey = String(import.meta.env.GOOGLE_BOOKS_API_KEY || "").trim();
	if (!apiKey) {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const startIndex = (page - 1) * pageSize;

	try {
		const fetchItems = async (q: string) => {
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

		const baseItems = await fetchItems(query);
		const byId = new Map<string, any>();
		for (const item of baseItems) {
			const id = String(item?.id || "");
			if (!id) continue;
			if (!byId.has(id)) byId.set(id, item);
		}
		const items = Array.from(byId.values());
		const mapped: SearchResult[] = items.map((item) => {
			const info = item.volumeInfo ?? {};
			const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
			const isbn13 = String(
				(identifiers.find((entry) => String(entry?.type || "") === "ISBN_13")?.identifier || "")
			).replace(/[^0-9Xx]/g, "").toUpperCase();
			const isbn10 = String(
				(identifiers.find((entry) => String(entry?.type || "") === "ISBN_10")?.identifier || "")
			).replace(/[^0-9Xx]/g, "").toUpperCase();
			return {
				title: info.title ?? "Untitled",
				subtitle: info.subtitle ?? "",
				authors: Array.isArray(info.authors) ? info.authors : [],
				description: info.description ?? "",
				publisher: info.publisher ?? "",
				publishedDate: info.publishedDate ?? "",
				printType: info.printType ?? "",
				pageCount: typeof info.pageCount === "number" ? info.pageCount : null,
				categories: Array.isArray(info.categories) ? info.categories : [],
				language: info.language ?? "",
				thumbnail: info.imageLinks?.thumbnail ?? "",
				isbn10,
				isbn13,
				googleBooksId: String(item?.id || "").trim()
			};
		}).filter((result) => isLikelyMatch(result, query));
		const sql = getNeonSql();
		const googleIds = Array.from(new Set(mapped.map((item) => String(item.googleBooksId || "").trim()).filter(Boolean)));
		const isbn13s = Array.from(new Set(mapped.map((item) => String(item.isbn13 || "").trim()).filter(Boolean)));
		const isbn10s = Array.from(new Set(mapped.map((item) => String(item.isbn10 || "").trim()).filter(Boolean)));
		const catalogRows = await sql<Array<{
			id: number;
			author_id: number | null;
			google_books_id: string;
			isbn13: string;
			isbn10: string;
		}>>`
			select
				b.id,
				b.author_id,
				coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
				coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
				coalesce(nullif(trim(b.isbn10), ''), '') as isbn10
			from book b
			where
				(array_length(${googleIds}::text[], 1) is not null and b.google_books_id = any(${googleIds}::text[]))
				or (array_length(${isbn13s}::text[], 1) is not null and b.isbn13 = any(${isbn13s}::text[]))
				or (array_length(${isbn10s}::text[], 1) is not null and b.isbn10 = any(${isbn10s}::text[]))
		`;
		const byGoogleId = new Map<string, { bookId: number; authorId: number }>();
		const byIsbn13 = new Map<string, { bookId: number; authorId: number }>();
		const byIsbn10 = new Map<string, { bookId: number; authorId: number }>();
		for (const row of catalogRows) {
			const pair = { bookId: Number(row.id || 0), authorId: Number(row.author_id || 0) || 0 };
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
			return {
				...item,
				bookId: match?.bookId || 0,
				authorId: match?.authorId || 0
			};
		});
		const results = dedupeVariants(mappedWithIds, query);
		const hasMore = baseItems.length >= pageSize;
		return new Response(JSON.stringify({ results, hasMore, page }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch {
		return new Response(JSON.stringify({ results: [], hasMore: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}
};
