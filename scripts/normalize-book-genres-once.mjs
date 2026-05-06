import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(DATABASE_URL);

const NON_GENRE_SLUGS = new Set([
	"",
	"all",
	"book-club",
	"books-i-own",
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
	"currently-reading",
	"want-to-buy",
	"want-to-own"
]);

const ARTIFACT_SLUG_PATTERNS = [
	/^nyt-/,
	/^collectionid-/,
	/^series-/,
	/^award-/,
	/^e-book-fiction-/,
	/^[a-z]{3}\d{6,}$/,
	/^[a-z]{3}\d{3,}-\d+$/,
	/^\d{4}-\d{2}-\d{2}$/,
	/^open-syllabus-project$/,
	/^open-library-staff-picks$/
];

const GENRE_ALIASES = {
	scifi: { slug: "science-fiction", name: "Science Fiction" },
	"sci-fi": { slug: "science-fiction", name: "Science Fiction" },
	"sci fi": { slug: "science-fiction", name: "Science Fiction" },
	"science fiction": { slug: "science-fiction", name: "Science Fiction" },
	ya: { slug: "young-adult", name: "Young Adult" },
	youngadult: { slug: "young-adult", name: "Young Adult" },
	"young adult": { slug: "young-adult", name: "Young Adult" },
	romcom: { slug: "romance", name: "Romance" },
	"rom-com": { slug: "romance", name: "Romance" },
	"romantic-comedy": { slug: "romance", name: "Romance" },
	autobio: { slug: "autobiography", name: "Autobiography" },
	memoirs: { slug: "memoir", name: "Memoir" },
	classics: { slug: "classic", name: "Classic" },
	"classic-literature": { slug: "classic", name: "Classic" },
	thrillers: { slug: "thriller", name: "Thriller" },
	mysteries: { slug: "mystery", name: "Mystery" },
	"detective-stories": { slug: "detective", name: "Detective" },
	"adventure-stories": { slug: "adventure", name: "Adventure" },
	"war-stories": { slug: "war", name: "War" },
	"suspense-fiction": { slug: "suspense", name: "Suspense" },
	"fantasy-fiction": { slug: "fantasy", name: "Fantasy" },
	"young-adult-fiction": { slug: "young-adult", name: "Young Adult" },
	"young adult fiction": { slug: "young-adult", name: "Young Adult" },
	"comic-books": { slug: "comics", name: "Comics" },
	"graphic-novels": { slug: "comics", name: "Comics" },
	"graphic novels": { slug: "comics", name: "Comics" },
	diets: { slug: "diet", name: "Diet" },
	dystopias: { slug: "dystopian", name: "Dystopian" },
	"dystopian-fiction": { slug: "dystopian", name: "Dystopian" },
	"dystopian fiction": { slug: "dystopian", name: "Dystopian" },
	"dystopias-in-fiction": { slug: "dystopian", name: "Dystopian" },
	"dystopias in fiction": { slug: "dystopian", name: "Dystopian" },
	"african-americans": { slug: "african-american", name: "African American" },
	"artificial-intelligences": { slug: "artificial-intelligence", name: "Artificial Intelligence" },
	arts: { slug: "art", name: "Art" },
	families: { slug: "family", name: "Family" },
	"historical-fiction": { slug: "historical", name: "Historical" },
	"humorous-stories": { slug: "humorous", name: "Humorous" },
	"mystery-stories": { slug: "mystery", name: "Mystery" },
	"survival-stories": { slug: "survival", name: "Survival" },
	"time-travel-in-fiction": { slug: "time-travel", name: "Time Travel" },
	"war-stories": { slug: "war", name: "War" }
};

function formatGenreLabel(value, fallback = "Genre") {
	const source = String(value || "").trim();
	if (!source) return fallback;
	const acronyms = new Set(["ya", "mg", "us", "uk", "lgbtq", "lgbtqia"]);
	return source
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.split(" ")
		.map((word) => {
			if (!word) return word;
			if (acronyms.has(word)) return word.toUpperCase();
			if (word === "and") return "&";
			return `${word[0].toUpperCase()}${word.slice(1)}`;
		})
		.join(" ");
}

function slugify(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function splitGenreParts(value) {
	return String(value || "")
		.split(/\s*(?:\/|&|,|\band\b)\s*/gi)
		.map((part) => String(part || "").trim())
		.filter(Boolean);
}

function isGenreSlug(slug) {
	if (!slug || NON_GENRE_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	if (ARTIFACT_SLUG_PATTERNS.some((pattern) => pattern.test(slug))) return false;
	return true;
}

function normalizeGenreEntry(value) {
	const parts = splitGenreParts(value);
	if (parts.length === 0) return [];
	const out = [];
	const dedupe = new Set();
	for (const part of parts) {
		const alias = GENRE_ALIASES[part.toLowerCase()];
		const raw = alias?.name || part;
		const slug = alias?.slug || slugify(raw);
		if (!isGenreSlug(slug) || dedupe.has(slug)) continue;
		dedupe.add(slug);
		out.push({ slug, name: formatGenreLabel(alias?.name || raw, raw) });
	}
	return out;
}

function normalizeGenreList(values, limit = 8) {
	const out = [];
	const dedupe = new Set();
	for (const value of Array.isArray(values) ? values : []) {
		for (const item of normalizeGenreEntry(value)) {
			if (dedupe.has(item.slug)) continue;
			dedupe.add(item.slug);
			out.push(item);
			if (out.length >= limit) return out;
		}
	}
	return out;
}

function keyFor(rows) {
	return rows
		.map((row) => `${String(row.slug || "").trim()}:${String(row.name || "").trim().toLowerCase()}`)
		.sort()
		.join("|");
}

const rows = await sql`
	select book_id::bigint as book_id, coalesce(genre_slug, '') as genre_slug, coalesce(genre_name, '') as genre_name
	from book_genre
	order by book_id asc
`;

const byBook = new Map();
for (const row of rows) {
	const bookId = Number(row.book_id || 0);
	if (!bookId) continue;
	const list = byBook.get(bookId) || [];
	list.push({
		slug: String(row.genre_slug || "").trim(),
		name: String(row.genre_name || "").trim()
	});
	byBook.set(bookId, list);
}

let booksTouched = 0;
let booksChanged = 0;
let rowsBefore = 0;
let rowsAfter = 0;

for (const [bookId, entries] of byBook.entries()) {
	booksTouched += 1;
	rowsBefore += entries.length;
	const sourceValues = entries.map((entry) => entry.name || entry.slug).filter(Boolean);
	const normalized = normalizeGenreList(sourceValues, 8);
	rowsAfter += normalized.length;
	const beforeKey = keyFor(entries);
	const afterKey = keyFor(normalized);
	if (beforeKey === afterKey) continue;
	booksChanged += 1;
	await sql`delete from book_genre where book_id = ${bookId}`;
	for (const genre of normalized) {
		await sql`
			insert into book_genre (book_id, genre_slug, genre_name)
			values (${bookId}, ${genre.slug}, ${genre.name})
			on conflict (book_id, genre_slug) do update set genre_name = excluded.genre_name
		`;
	}
}

const finalCountRows = await sql`select count(*)::int as count from book_genre`;
const finalCount = Number(finalCountRows[0]?.count || 0);

console.log(JSON.stringify({
	booksTouched,
	booksChanged,
	rowsBefore,
	rowsAfterNormalized: rowsAfter,
	finalRowsInBookGenre: finalCount
}, null, 2));
