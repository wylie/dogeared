import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BACKFILL_CONCURRENCY || 4) || 4));
const DRY_RUN = String(process.env.BACKFILL_DRY_RUN || "").trim() === "1";

if (!DATABASE_URL) throw new Error("Missing DATABASE_URL.");

const sql = neon(DATABASE_URL);

function normalizeText(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizePageCount(value) {
	const numeric = Math.floor(Number(value || 0) || 0);
	return numeric > 0 ? numeric : 0;
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

function scoreCandidate(item, book) {
	const info = item?.volumeInfo || {};
	const candidateTitle = normalizeText(info.title);
	const candidateAuthor = normalizeText(Array.isArray(info.authors) ? info.authors[0] : "");
	const bookTitle = normalizeText(book.title);
	const bookAuthor = normalizeText(book.primary_author);
	let score = 0;
	if (candidateTitle && bookTitle && candidateTitle === bookTitle) score += 4;
	else if (candidateTitle && bookTitle && (candidateTitle.includes(bookTitle) || bookTitle.includes(candidateTitle))) score += 3;
	if (candidateAuthor && bookAuthor && candidateAuthor === bookAuthor) score += 4;
	else if (candidateAuthor && bookAuthor && (candidateAuthor.includes(bookAuthor) || bookAuthor.includes(candidateAuthor))) score += 3;
	if (normalizePageCount(info.pageCount) >= 120) score += 1;
	if (String(item?.id || "").trim() && String(item?.id || "").trim() === String(book.google_books_id || "").trim()) score += 5;
	return score;
}

async function resolveFromGoogleId(book) {
	const id = String(book.google_books_id || "").trim();
	if (!id || !GOOGLE_BOOKS_API_KEY) return 0;
	const params = new URLSearchParams({ key: GOOGLE_BOOKS_API_KEY });
	const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?${params.toString()}`);
	const pages = normalizePageCount(data?.volumeInfo?.pageCount);
	return pages >= 50 ? pages : 0;
}

async function resolveFromIsbn(book) {
	const isbn = String(book.isbn13 || "").trim() || String(book.isbn10 || "").trim();
	if (!isbn || !GOOGLE_BOOKS_API_KEY) return 0;
	const params = new URLSearchParams({
		key: GOOGLE_BOOKS_API_KEY,
		q: `isbn:${isbn}`,
		maxResults: "3",
		printType: "books"
	});
	const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
	const items = Array.isArray(data?.items) ? data.items : [];
	let bestPages = 0;
	let bestScore = -1;
	for (const item of items) {
		const pages = normalizePageCount(item?.volumeInfo?.pageCount);
		if (!pages) continue;
		const score = scoreCandidate(item, book);
		if (score > bestScore || (score === bestScore && pages > bestPages)) {
			bestScore = score;
			bestPages = pages;
		}
	}
	return bestScore >= 4 && bestPages >= 50 ? bestPages : 0;
}

async function resolveFromTitleAuthor(book) {
	if (!GOOGLE_BOOKS_API_KEY) return 0;
	const title = String(book.title || "").trim();
	const author = String(book.primary_author || "").trim();
	if (!title) return 0;
	const params = new URLSearchParams({
		key: GOOGLE_BOOKS_API_KEY,
		q: author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`,
		maxResults: "10",
		printType: "books"
	});
	const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
	const items = Array.isArray(data?.items) ? data.items : [];
	let bestPages = 0;
	let bestScore = -1;
	for (const item of items) {
		const pages = normalizePageCount(item?.volumeInfo?.pageCount);
		if (!pages) continue;
		const score = scoreCandidate(item, book);
		if (score > bestScore || (score === bestScore && pages > bestPages)) {
			bestScore = score;
			bestPages = pages;
		}
	}
	return bestScore >= 6 && bestPages >= 50 ? bestPages : 0;
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

await sql`alter table book add column if not exists page_count int not null default 0`;

const books = await sql`
	select
		b.id,
		b.title,
		coalesce(b.primary_author, '') as primary_author,
		coalesce(b.google_books_id, '') as google_books_id,
		coalesce(b.isbn13, '') as isbn13,
		coalesce(b.isbn10, '') as isbn10,
		coalesce(b.page_count, 0)::int as page_count,
		coalesce((
			select max(nullif(ub.total_pages, 0))::int
			from user_book ub
			where ub.book_id = b.id
		), 0)::int as user_max_pages
	from book b
	order by b.id asc
`;

console.log(`Backfilling page counts for ${books.length} books (concurrency ${CONCURRENCY}, dryRun=${DRY_RUN})...`);

let updated = 0;
let unchanged = 0;
let unresolved = 0;
let failures = 0;

await mapWithConcurrency(books, CONCURRENCY, async (book, index) => {
	try {
		const existing = normalizePageCount(book.page_count);
		const userMax = normalizePageCount(book.user_max_pages);
		let resolved = existing >= 50 ? existing : 0;
		if (!resolved && userMax >= 50) resolved = userMax;
		if (!resolved) resolved = await resolveFromGoogleId(book);
		if (!resolved) resolved = await resolveFromIsbn(book);
		if (!resolved) resolved = await resolveFromTitleAuthor(book);

		if (resolved > 0 && (existing <= 0 || existing < 50 || resolved > existing)) {
			if (!DRY_RUN) {
				await sql`
					update book
					set page_count = ${resolved}, updated_at = now()
					where id = ${book.id}
				`;
			}
			updated += 1;
		} else if (resolved <= 0) {
			unresolved += 1;
		} else {
			unchanged += 1;
		}
		process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
	} catch (error) {
		failures += 1;
		console.error(`\nFailed for book ${book.id} (${book.title}):`, error instanceof Error ? error.message : error);
	}
});

const [summary] = await sql`
	select
		count(*)::int as total_books,
		count(*) filter (where coalesce(page_count, 0) > 0)::int as books_with_page_count,
		count(*) filter (where coalesce(page_count, 0) <= 0)::int as books_without_page_count
	from book
`;

console.log("\nPage-count backfill complete.");
console.log(JSON.stringify({
	dryRun: DRY_RUN,
	updated,
	unchanged,
	unresolved,
	failures,
	totalBooks: Number(summary?.total_books || 0),
	booksWithPageCount: Number(summary?.books_with_page_count || 0),
	booksWithoutPageCount: Number(summary?.books_without_page_count || 0)
}, null, 2));
