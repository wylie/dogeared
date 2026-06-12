export type ExternalAuthorBook = {
	title: string;
	author: string;
	coverUrl: string;
	publishedYear: number;
	isbn: string;
	sourceUrl: string;
};

function canonicalText(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function filterExternalAuthorBooks(
	rows: Array<Record<string, unknown>>,
	localTitles: string[],
	limit = 12
) {
	const local = new Set(localTitles.map(canonicalText).filter(Boolean));
	const seen = new Set<string>();
	const results: ExternalAuthorBook[] = [];
	for (const row of rows) {
		const title = String(row.title || "").trim();
		const key = canonicalText(title);
		if (!title || !key || local.has(key) || seen.has(key)) continue;
		seen.add(key);
		const authorNames = Array.isArray(row.author_name) ? row.author_name : [];
		const isbns = Array.isArray(row.isbn) ? row.isbn : [];
		const workKey = String(row.key || "").trim();
		const coverId = Math.max(0, Number(row.cover_i || 0) || 0);
		results.push({
			title,
			author: String(authorNames[0] || "").trim(),
			coverUrl: coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : "",
			publishedYear: Math.max(0, Number(row.first_publish_year || 0) || 0),
			isbn: String(isbns[0] || "").trim(),
			sourceUrl: workKey ? `https://openlibrary.org${workKey.startsWith("/") ? workKey : `/${workKey}`}` : "https://openlibrary.org"
		});
		if (results.length >= Math.max(1, limit)) break;
	}
	return results;
}

export async function fetchExternalAuthorBooks(authorName: string, localTitles: string[], limit = 12) {
	const name = String(authorName || "").trim();
	if (!name) return [] as ExternalAuthorBook[];
	try {
		const params = new URLSearchParams({
			author: name,
			fields: "key,title,author_name,cover_i,first_publish_year,isbn",
			limit: "40"
		});
		const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
			signal: AbortSignal.timeout(3500)
		});
		if (!response.ok) return [];
		const data = await response.json();
		return filterExternalAuthorBooks(Array.isArray(data?.docs) ? data.docs : [], localTitles, limit);
	} catch {
		return [];
	}
}
