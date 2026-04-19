import type { APIRoute } from "astro";

export const prerender = false;

function normalizeIsbn(value: unknown) {
	return String(value || "")
		.replace(/[^0-9Xx]/g, "")
		.toUpperCase();
}

function normalizeText(value: string) {
	return String(value || "")
		.toLowerCase()
		.replace(/[\W_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function toHttps(value: unknown) {
	const input = String(value || "").trim();
	if (!input) return "";
	if (input.startsWith("http://")) return `https://${input.slice(7)}`;
	return input;
}

function getGoogleCover(imageLinks: Record<string, unknown> | null | undefined) {
	if (!imageLinks || typeof imageLinks !== "object") return "";
	return toHttps(
		imageLinks.extraLarge ||
		imageLinks.large ||
		imageLinks.medium ||
		imageLinks.small ||
		imageLinks.thumbnail ||
		imageLinks.smallThumbnail
	);
}

function scoreGoogleItem(item: Record<string, unknown>, query: string) {
	const info = (item?.volumeInfo && typeof item.volumeInfo === "object")
		? item.volumeInfo as Record<string, unknown>
		: {};
	const title = normalizeText(String(info.title || ""));
	const q = normalizeText(query);
	if (!title || !q) return -1;

	let score = 0;
	if (title === q) score += 1200;
	if (title.startsWith(`${q} `) || title.startsWith(q)) score += 900;
	if (title.includes(` ${q} `)) score += 700;
	if (title.includes(q)) score += 450;

	const qTokens = q.split(" ").filter(Boolean);
	const tokenMatches = qTokens.filter((token) => title.includes(token)).length;
	score += tokenMatches * 80;

	const authors = Array.isArray(info.authors) ? info.authors : [];
	if (authors.length) score += 60;
	const imageLinks = (info.imageLinks && typeof info.imageLinks === "object")
		? info.imageLinks as Record<string, unknown>
		: null;
	if (getGoogleCover(imageLinks)) score += 90;

	return score;
}

function mapGoogleSuggestion(item: Record<string, unknown>) {
	const info = (item?.volumeInfo && typeof item.volumeInfo === "object")
		? item.volumeInfo as Record<string, unknown>
		: {};
	const title = String(info.title || "").trim();
	if (!title) return null;

	const authors = Array.isArray(info.authors) ? info.authors : [];
	const author = String(authors[0] || "").trim();
	const publishedDate = String(info.publishedDate || "").trim();
	const yearMatch = publishedDate.match(/\d{4}/);
	const year = yearMatch ? yearMatch[0] : "";
	const label = year ? `${title} (${year})` : title;

	const pageCount = Math.max(0, Number(info.pageCount) || 0);
	const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
	const isbn13 = normalizeIsbn(
		identifiers.find((entry) => String((entry as Record<string, unknown>)?.type || "") === "ISBN_13")
		&& (identifiers.find((entry) => String((entry as Record<string, unknown>)?.type || "") === "ISBN_13") as Record<string, unknown>)?.identifier
	);
	const isbn10 = normalizeIsbn(
		identifiers.find((entry) => String((entry as Record<string, unknown>)?.type || "") === "ISBN_10")
		&& (identifiers.find((entry) => String((entry as Record<string, unknown>)?.type || "") === "ISBN_10") as Record<string, unknown>)?.identifier
	);
	const isbn = isbn13 || isbn10;

	const imageLinks = (info.imageLinks && typeof info.imageLinks === "object")
		? info.imageLinks as Record<string, unknown>
		: null;
	const coverUrl = getGoogleCover(imageLinks);
	const pageText = pageCount > 0 ? `${pageCount} pages` : "";
	const subtitle = [author, pageText].filter(Boolean).join(" • ");

	return {
		label,
		value: title,
		author,
		totalPages: pageCount,
		coverUrl,
		isbn13,
		isbn,
		googleBooksId: String(item?.id || "").trim(),
		subtitle,
		source: "google_books"
	};
}

async function searchGoogleBooks(query: string, apiKey: string) {
	const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
	endpoint.searchParams.set("q", query);
	endpoint.searchParams.set("maxResults", "12");
	endpoint.searchParams.set("printType", "books");
	endpoint.searchParams.set("langRestrict", "en");
	endpoint.searchParams.set("key", apiKey);

	const res = await fetch(endpoint.toString(), {
		headers: { Accept: "application/json" }
	});
	if (!res.ok) return [];
	const data = await res.json();
	const items = Array.isArray(data?.items) ? data.items : [];
	return items
		.map((item: Record<string, unknown>) => ({ item, score: scoreGoogleItem(item, query) }))
		.filter((entry) => entry.score >= 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 8)
		.map((entry) => mapGoogleSuggestion(entry.item))
		.filter(Boolean);
}

export const GET: APIRoute = async ({ url }) => {
	const query = String(url.searchParams.get("q") || "").trim();
	if (query.length < 2) {
		return new Response(JSON.stringify({ suggestions: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	const googleBooksApiKey = String(import.meta.env.GOOGLE_BOOKS_API_KEY || "").trim();
	if (!googleBooksApiKey) {
		return new Response(JSON.stringify({ suggestions: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}

	try {
		const suggestions = await searchGoogleBooks(query, googleBooksApiKey);
		return new Response(JSON.stringify({ suggestions }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	} catch {
		return new Response(JSON.stringify({ suggestions: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}
};
