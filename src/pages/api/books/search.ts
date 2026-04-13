import type { APIRoute } from "astro";

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
	if (/\b(audiobook|audio book|audio cd|audible)\b/.test(haystack)) return "Audiobook";
	if (/\b(ebook|e-book|kindle|digital edition)\b/.test(haystack)) return "Ebook";
	if (/\bpaperback\b/.test(haystack)) return "Paperback";
	if (/\b(hardcover|hardback)\b/.test(haystack)) return "Hardcover";
	return "Book";
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
	if (result.thumbnail) score += 50;
	if (result.pageCount && result.pageCount > 0) score += 20;
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
		const key = canonicalTitle ? `${canonicalTitle}|${canonicalAuthor}` : `ungrouped_${index}`;
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
				canonicalizeTitle(variant.title),
				canonicalizeAuthor(variant.author),
				normalizeText(variant.format),
				normalizeText(variant.language),
				normalizeText(variant.publishedDate)
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

		const [baseItems, audiobookItems] = await Promise.all([
			fetchItems(query),
			fetchItems(`${query} audiobook`)
		]);
		const byId = new Map<string, any>();
		for (const item of [...baseItems, ...audiobookItems]) {
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
				isbn13
			};
		}).filter((result) => isLikelyMatch(result, query));
		const results = dedupeVariants(mapped, query);
		const hasMore = baseItems.length >= pageSize || audiobookItems.length >= pageSize;
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
