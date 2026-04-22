import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BACKFILL_CONCURRENCY || 5) || 5));

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

if (!GOOGLE_BOOKS_API_KEY) {
	throw new Error("Missing GOOGLE_BOOKS_API_KEY.");
}

const sql = neon(DATABASE_URL);

const NON_GENRE_SLUGS = new Set([
	"",
	"all",
	"book-club",
	"books-i-own",
	"currently-reading",
	"default",
	"did-not-finish",
	"dnf",
	"faves",
	"favorites",
	"fiction",
	"general",
	"kindle",
	"library",
	"maybe",
	"owned",
	"physical",
	"read",
	"re-read",
	"reread",
	"tbr",
	"to-buy",
	"to-read",
	"want-to-buy",
	"want-to-own"
]);

function normalizeText(value) {
	return String(value || "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function slugify(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function canonicalizeTitle(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)\b/g, " ")
		.split(":")[0]
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function canonicalizeAuthor(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/^(by\s+)/, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function isGenreSlug(slug) {
	if (!slug || NON_GENRE_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	return true;
}

function toTitleCase(value) {
	return value
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

function normalizeGenreName(value) {
	const text = normalizeText(value)
		.replace(/\s+/g, " ")
		.replace(/\band\b/gi, "&")
		.trim();
	if (!text) return "";
	if (text === text.toLowerCase()) return toTitleCase(text);
	return text;
}

function extractGenres(categories) {
	const dedupe = new Set();
	const genres = [];
	for (const rawCategory of Array.isArray(categories) ? categories : []) {
		const category = normalizeText(rawCategory);
		if (!category) continue;
		const segments = category
			.split("/")
			.map((part) => normalizeGenreName(part))
			.filter(Boolean);
		for (const name of segments) {
			const slug = slugify(name);
			if (!isGenreSlug(slug) || dedupe.has(slug)) continue;
			dedupe.add(slug);
			genres.push({ slug, name });
		}
	}
	return genres.slice(0, 8);
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
	if (info.categories?.length) score += 40;
	if (String(volume?.id || "").trim() === String(book.google_books_id || "").trim()) score += 160;
	return score;
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Google Books returned ${response.status}.`);
	return response.json();
}

async function fetchVolumes(query) {
	const params = new URLSearchParams({
		q: query,
		key: GOOGLE_BOOKS_API_KEY,
		maxResults: "5",
		printType: "books",
		langRestrict: "en"
	});
	const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
	return Array.isArray(data.items) ? data.items : [];
}

async function fetchById(googleBooksId) {
	const id = String(googleBooksId || "").trim();
	if (!id) return null;
	const params = new URLSearchParams({ key: GOOGLE_BOOKS_API_KEY });
	try {
		return await fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}?${params.toString()}`);
	} catch {
		return null;
	}
}

async function resolveVolume(book) {
	const direct = await fetchById(book.google_books_id);
	if (direct?.volumeInfo) return direct;

	const queries = [];
	if (book.isbn13) queries.push(`isbn:${book.isbn13}`);
	if (book.isbn10) queries.push(`isbn:${book.isbn10}`);
	if (book.title && book.primary_author) {
		queries.push(`intitle:${book.title} inauthor:${book.primary_author}`);
	}
	if (book.title) queries.push(`intitle:${book.title}`);

	for (const query of queries) {
		try {
			const items = await fetchVolumes(query);
			if (!items.length) continue;
			const best = [...items].sort((a, b) => scoreVolume(b, book) - scoreVolume(a, book))[0];
			if (scoreVolume(best, book) > 0) return best;
		} catch {
			// Skip transient lookup failures and try the next strategy.
		}
	}

	return null;
}

async function replaceGenresForBook(bookId, genres) {
	await sql`delete from book_genre where book_id = ${bookId}`;
	for (const genre of genres) {
		await sql`
			insert into book_genre (book_id, genre_slug, genre_name)
			values (${bookId}, ${genre.slug}, ${genre.name})
			on conflict (book_id, genre_slug) do update set
				genre_name = excluded.genre_name
		`;
	}
}

async function deleteLegacyNonGenreRows() {
	for (const slug of NON_GENRE_SLUGS) {
		if (!slug) continue;
		await sql`delete from book_genre where genre_slug = ${slug}`;
	}
}

async function updateBookMetadata(bookId, volume) {
	const info = volume?.volumeInfo ?? {};
	const googleBooksId = String(volume?.id || "").trim();
	const categories = Array.isArray(info.categories) ? info.categories : [];
	const language = String(info.language || "").trim();
	const coverUrl = String(info.imageLinks?.thumbnail || "").trim();
	const publishedYearMatch = String(info.publishedDate || "").match(/\d{4}/);
	const publishedYear = publishedYearMatch ? Number(publishedYearMatch[0]) : null;

	await sql`
		update book
		set
			google_books_id = case when ${googleBooksId} <> '' then ${googleBooksId} else google_books_id end,
			language = case when ${language} <> '' then ${language} else language end,
			cover_url = case when ${coverUrl} <> '' then ${coverUrl} else cover_url end,
			published_year = coalesce(${publishedYear}, published_year),
			updated_at = now()
		where id = ${bookId}
	`;

	if (googleBooksId) {
		await sql`
			insert into book_source (
				book_id,
				source,
				source_key,
				source_work_id,
				source_edition_id,
				source_url,
				last_synced_at
			)
			values (
				${bookId},
				'google_books',
				${googleBooksId},
				${googleBooksId},
				'',
				${`https://books.google.com/books?id=${googleBooksId}`},
				now()
			)
			on conflict (source, source_key) do update set
				book_id = excluded.book_id,
				source_work_id = excluded.source_work_id,
				source_url = excluded.source_url,
				last_synced_at = now()
		`;
	}

	return extractGenres(categories);
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

const books = await sql`
	select
		id,
		title,
		primary_author,
		isbn13,
		isbn10,
		google_books_id
	from book
	order by id asc
`;

console.log(`Backfilling genres for ${books.length} books with concurrency ${CONCURRENCY}...`);

let updated = 0;
let unchanged = 0;
let noMatch = 0;
let noGenres = 0;
let failures = 0;

await mapWithConcurrency(books, CONCURRENCY, async (book, index) => {
	try {
		const volume = await resolveVolume(book);
		if (!volume) {
			noMatch += 1;
			process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
			return;
		}

		const genres = await updateBookMetadata(book.id, volume);
		if (genres.length === 0) {
			await sql`delete from book_genre where book_id = ${book.id}`;
			noGenres += 1;
			process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
			return;
		}

		const existingRows = await sql`
			select genre_slug, genre_name
			from book_genre
			where book_id = ${book.id}
			order by genre_slug asc
		`;
		const existingKey = existingRows.map((row) => `${row.genre_slug}:${row.genre_name}`).join("|");
		const nextKey = genres.map((genre) => `${genre.slug}:${genre.name}`).join("|");

		if (existingKey === nextKey) {
			unchanged += 1;
			process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
			return;
		}

		await replaceGenresForBook(book.id, genres);
		updated += 1;
		process.stdout.write(`\rProcessed ${index + 1}/${books.length}`);
	} catch (error) {
		failures += 1;
		console.error(`\nFailed for book ${book.id} (${book.title}):`, error instanceof Error ? error.message : error);
	}
});

await deleteLegacyNonGenreRows();

console.log("\nGenre backfill complete.");
console.log(JSON.stringify({ updated, unchanged, noMatch, noGenres, failures }, null, 2));
