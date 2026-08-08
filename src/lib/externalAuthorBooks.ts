export type ExternalAuthorBook = {
	title: string;
	author: string;
	coverUrl: string;
	publishedYear: number;
	isbn10: string;
	isbn13: string;
	sourceWorkId: string;
	sourceUrl: string;
};

type LocalAuthorBook = string | {
	title?: unknown;
	author?: unknown;
	isbn10?: unknown;
	isbn13?: unknown;
	sourceWorkId?: unknown;
};

function canonicalText(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function canonicalTitle(value: unknown) {
	return canonicalText(String(value || "")
		.replace(/\([^)]*(edition|movie tie|anniversary|revised|unabridged)[^)]*\)/gi, " ")
		.replace(/\s*:\s*[^:]*\b(edition|movie tie|anniversary|revised|unabridged)\b[^:]*$/gi, " ")
		.replace(/\b(first|second|third|revised|updated|special|deluxe) edition\b/gi, " "));
}

function normalizeIsbn(value: unknown) {
	return String(value || "").toUpperCase().replace(/[^0-9X]/g, "");
}

export function filterExternalAuthorBooks(
	rows: Array<Record<string, unknown>>,
	localBooks: LocalAuthorBook[],
	limit = 12
) {
	const localTitles = new Set<string>();
	const localTitleAuthors = new Set<string>();
	const localIsbns = new Set<string>();
	const localWorkIds = new Set<string>();
	for (const book of localBooks) {
		const record = typeof book === "string" ? { title: book } : book;
		const title = canonicalTitle(record.title);
		const author = canonicalText(record.author);
		if (title) localTitles.add(title);
		if (title && author) localTitleAuthors.add(`${title}|${author}`);
		for (const isbn of [record.isbn10, record.isbn13].map(normalizeIsbn).filter(Boolean)) localIsbns.add(isbn);
		const workId = canonicalText(record.sourceWorkId);
		if (workId) localWorkIds.add(workId);
	}
	const seen = new Set<string>();
	const results: ExternalAuthorBook[] = [];
	for (const row of rows) {
		const title = String(row.title || "").trim();
		const authorNames = Array.isArray(row.author_name) ? row.author_name : [];
		const isbns = Array.isArray(row.isbn) ? row.isbn : [];
		const workKey = String(row.key || "").trim();
		const titleKey = canonicalTitle(title);
		const author = String(authorNames[0] || "").trim();
		const authorKey = canonicalText(author);
		const workId = canonicalText(workKey);
		const normalizedIsbns = isbns.map(normalizeIsbn).filter(Boolean);
		const duplicateLocal = localTitles.has(titleKey)
			|| (authorKey && localTitleAuthors.has(`${titleKey}|${authorKey}`))
			|| normalizedIsbns.some((isbn) => localIsbns.has(isbn))
			|| (workId && localWorkIds.has(workId));
		const seenKey = `${titleKey}|${authorKey}`;
		if (!title || !titleKey || duplicateLocal || seen.has(seenKey)) continue;
		seen.add(seenKey);
		const coverId = Math.max(0, Number(row.cover_i || 0) || 0);
		const isbn13 = normalizedIsbns.find((isbn) => isbn.length === 13) || "";
		const isbn10 = normalizedIsbns.find((isbn) => isbn.length === 10) || "";
		results.push({
			title,
			author,
			coverUrl: coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "",
			publishedYear: Math.max(0, Number(row.first_publish_year || 0) || 0),
			isbn10,
			isbn13,
			sourceWorkId: workKey,
			sourceUrl: workKey ? `https://openlibrary.org${workKey.startsWith("/") ? workKey : `/${workKey}`}` : "https://openlibrary.org"
		});
		if (results.length >= Math.max(1, limit)) break;
	}
	return results;
}

export async function fetchExternalAuthorBooks(authorName: string, localBooks: LocalAuthorBook[], limit = 12) {
	const name = String(authorName || "").trim();
	if (!name) return [] as ExternalAuthorBook[];
	try {
		const params = new URLSearchParams({
			author: name,
			fields: "key,title,author_name,cover_i,first_publish_year,isbn",
			limit: "40"
		});
		const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
			signal: AbortSignal.timeout(1200)
		});
		if (!response.ok) return [];
		const data = await response.json();
		return filterExternalAuthorBooks(Array.isArray(data?.docs) ? data.docs : [], localBooks, limit);
	} catch {
		return [];
	}
}
