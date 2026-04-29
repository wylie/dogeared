import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BACKFILL_CONCURRENCY || 4) || 4));

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(DATABASE_URL);

function canonicalizeTitle(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)/g, " ")
		.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)\b/g, " ")
		.split(":")[0]
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalizeAuthor(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/^(by\s+)/, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function sanitizeDescription(value, maxLength = 900) {
	const text = String(value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trimEnd()}…`;
}

async function fetchJson(url) {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

function scoreVolume(volume, book) {
	const info = volume?.volumeInfo ?? {};
	const title = canonicalizeTitle(info.title || "");
	const author = canonicalizeAuthor(Array.isArray(info.authors) ? info.authors[0] : "");
	const targetTitle = canonicalizeTitle(book.title || "");
	const targetAuthor = canonicalizeAuthor(book.primary_author || "");
	let score = 0;
	if (title && targetTitle && title === targetTitle) score += 120;
	if (title && targetTitle && title.includes(targetTitle)) score += 80;
	if (targetTitle && title && targetTitle.includes(title)) score += 60;
	if (author && targetAuthor && author === targetAuthor) score += 70;
	if (author && targetAuthor && author.includes(targetAuthor)) score += 35;
	if (String(volume?.id || "").trim() === String(book.google_books_id || "").trim()) score += 160;
	if (String(info.description || "").trim()) score += 40;
	return score;
}

async function fetchGoogleById(googleBooksId) {
	const id = String(googleBooksId || "").trim();
	if (!id || !GOOGLE_BOOKS_API_KEY) return null;
	const params = new URLSearchParams({ key: GOOGLE_BOOKS_API_KEY });
	return fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?${params.toString()}`);
}

async function fetchGoogleCandidates(query) {
	if (!GOOGLE_BOOKS_API_KEY) return [];
	const params = new URLSearchParams({
		q: query,
		key: GOOGLE_BOOKS_API_KEY,
		maxResults: "5",
		printType: "books"
	});
	const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
	return Array.isArray(data?.items) ? data.items : [];
}

async function resolveGoogleDescription(book) {
	const direct = await fetchGoogleById(book.google_books_id);
	const directDescription = sanitizeDescription(direct?.volumeInfo?.description || "");
	if (directDescription) return directDescription;

	const queries = [];
	if (book.isbn13) queries.push(`isbn:${book.isbn13}`);
	if (book.isbn10) queries.push(`isbn:${book.isbn10}`);
	if (book.title && book.primary_author) queries.push(`intitle:${book.title} inauthor:${book.primary_author}`);
	if (book.title) queries.push(`intitle:${book.title}`);

	let bestVolume = null;
	let bestScore = -1;
	for (const query of queries) {
		const items = await fetchGoogleCandidates(query);
		for (const item of items) {
			const score = scoreVolume(item, book);
			if (score > bestScore) {
				bestScore = score;
				bestVolume = item;
			}
		}
	}

	return sanitizeDescription(bestVolume?.volumeInfo?.description || "");
}

async function resolveOpenLibraryDescription(book) {
	const keys = [];
	if (book.isbn13) keys.push(`ISBN:${book.isbn13}`);
	if (book.isbn10) keys.push(`ISBN:${book.isbn10}`);

	for (const key of keys) {
		const payload = await fetchJson(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`);
		if (!payload || typeof payload !== "object") continue;
		const rawDescription = payload?.[key]?.description;
		const text = typeof rawDescription === "string"
			? rawDescription
			: String(rawDescription?.value || "");
		const cleaned = sanitizeDescription(text);
		if (cleaned) return cleaned;
	}
	return "";
}

async function mapWithConcurrency(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}

await sql`alter table book add column if not exists synopsis text not null default ''`;

const books = await sql`
	select id, title, primary_author, isbn13, isbn10, google_books_id, synopsis
	from book
	where trim(coalesce(synopsis, '')) = ''
	order by id asc
`;

console.log(`Backfilling synopsis for ${books.length} books with concurrency ${CONCURRENCY}...`);

let updated = 0;
let unchanged = 0;
let noMatch = 0;
let failures = 0;

await mapWithConcurrency(books, CONCURRENCY, async (book, index) => {
	try {
		let synopsis = await resolveGoogleDescription(book);
		if (!synopsis) synopsis = await resolveOpenLibraryDescription(book);
		if (!synopsis) {
			noMatch += 1;
			process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
			return;
		}
		await sql`
			update book
			set synopsis = ${synopsis}, updated_at = now()
			where id = ${book.id}
		`;
		updated += 1;
		process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
	} catch (error) {
		failures += 1;
		console.error(`\nFailed for book ${book.id} (${book.title}):`, error instanceof Error ? error.message : error);
	}
});

if (books.length === 0) unchanged = 0;

const [summary] = await sql`
	select
		count(*)::int as total_books,
		count(*) filter (where trim(coalesce(synopsis, '')) <> '')::int as books_with_synopsis,
		count(*) filter (where trim(coalesce(synopsis, '')) = '')::int as books_without_synopsis
	from book
`;

console.log("\nSynopsis backfill complete.");
console.log(JSON.stringify({
	updated,
	unchanged,
	noMatch,
	failures,
	totalBooks: Number(summary?.total_books || 0),
	booksWithSynopsis: Number(summary?.books_with_synopsis || 0),
	booksWithoutSynopsis: Number(summary?.books_without_synopsis || 0)
}, null, 2));
