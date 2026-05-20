import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL.");
const sql = neon(DATABASE_URL);

const NON_SLUGS = new Set([
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

const ARTIFACT_PATTERNS = [
	/^nyt[:\s_-]/,
	/^nyt-/,
	/^collectionid-/,
	/^series-/,
	/^award-/,
	/^e-book-fiction-/,
	/^[a-z]{3}\d{6,}$/,
	/^[a-z]{3}\d{3,}-\d+$/,
	/^\d{4}-\d{2}-\d{2}$/,
	/^[a-z0-9_-]{0,20}[:][a-z0-9_-]{0,30}[=][a-z0-9_-]{0,30}$/,
	/^open-syllabus-project$/,
	/^open-library-staff-picks$/
];

const STANDARD_GENRE_SLUGS = new Set([
	"action",
	"adventure",
	"anthology",
	"autobiography",
	"biography",
	"classic",
	"comedy",
	"comics",
	"contemporary",
	"crime",
	"detective",
	"dystopian",
	"epic",
	"fantasy",
	"graphic-novel",
	"historical",
	"horror",
	"humor",
	"literary",
	"magic",
	"memoir",
	"mystery",
	"mythology",
	"paranormal",
	"philosophy",
	"poetry",
	"post-apocalyptic",
	"psychological",
	"romance",
	"satire",
	"science-fiction",
	"self-help",
	"short-story",
	"social-science",
	"space-opera",
	"steampunk",
	"suspense",
	"thriller",
	"time-travel",
	"true-crime",
	"urban-fantasy",
	"war",
	"western",
	"women-s-fiction",
	"young-adult",
	"hard-science-fiction"
]);

const ALIASES = {
	scifi: { slug: "science-fiction", name: "Science Fiction" },
	"sci-fi": { slug: "science-fiction", name: "Science Fiction" },
	"sci fi": { slug: "science-fiction", name: "Science Fiction" },
	"science fiction": { slug: "science-fiction", name: "Science Fiction" },
	"hard sci fi": { slug: "hard-science-fiction", name: "Hard Science Fiction" },
	"hard sci-fi": { slug: "hard-science-fiction", name: "Hard Science Fiction" },
	"hard science fiction": { slug: "hard-science-fiction", name: "Hard Science Fiction" },
	ya: { slug: "young-adult", name: "Young Adult" },
	"young adult": { slug: "young-adult", name: "Young Adult" },
	"classic-literature": { slug: "classic", name: "Classic" },
	"historical-fiction": { slug: "historical", name: "Historical" },
	"fantasy-fiction": { slug: "fantasy", name: "Fantasy" },
	"young-adult-fiction": { slug: "young-adult", name: "Young Adult" },
	"graphic novels": { slug: "comics", name: "Comics" },
	"graphic-novels": { slug: "comics", name: "Comics" },
	"comic-books": { slug: "comics", name: "Comics" },
	"war-stories": { slug: "war", name: "War" },
	"time-travel-in-fiction": { slug: "time-travel", name: "Time Travel" },
	"dystopian-fiction": { slug: "dystopian", name: "Dystopian" }
};

const ACRONYMS = new Set(["ya", "mg", "us", "uk", "lgbtq", "lgbtqia"]);

function normalizeText(value) {
	return String(value || "").trim();
}

function slugify(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function formatLabel(value, fallback = "Tag") {
	const source = normalizeText(value);
	if (!source) return fallback;
	return source
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.split(" ")
		.filter(Boolean)
		.map((word) => {
			if (ACRONYMS.has(word)) return word.toUpperCase();
			if (word === "and") return "&";
			return `${word[0].toUpperCase()}${word.slice(1)}`;
		})
		.join(" ");
}

function canonicalKey(value) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/\bscifi\b/g, "science fiction")
		.replace(/\bsci[\s-]*fi\b/g, "science fiction")
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function splitParts(value) {
	return normalizeText(value)
		.split(/\s*(?:\/|,|\band\b|&)\s*/gi)
		.map((part) => normalizeText(part))
		.filter(Boolean);
}

function isAllowedSlug(slug) {
	if (!slug || NON_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	if (ARTIFACT_PATTERNS.some((pattern) => pattern.test(slug))) return false;
	return true;
}

function isStandardGenreSlug(slug) {
	if (STANDARD_GENRE_SLUGS.has(slug)) return true;
	if (slug.endsWith("-fiction")) {
		const base = slug.replace(/-fiction$/, "");
		if (STANDARD_GENRE_SLUGS.has(base)) return true;
	}
	if (slug.endsWith("-stories")) {
		const base = slug.replace(/-stories$/, "");
		if (STANDARD_GENRE_SLUGS.has(base)) return true;
	}
	return false;
}

function normalizeEntries(values) {
	const out = [];
	const seen = new Set();
	for (const value of values) {
		for (const part of splitParts(value)) {
			const alias = ALIASES[part.toLowerCase()];
			const raw = alias?.name || part;
			const slug = alias?.slug || slugify(raw);
			if (!isAllowedSlug(slug)) continue;
			const name = formatLabel(raw, raw);
			const key = `${slug}::${canonicalKey(name)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ slug, name });
		}
	}
	return out;
}

const genreRows = await sql`
	select
		book_id::bigint as book_id,
		coalesce(genre_slug, '') as genre_slug,
		coalesce(genre_name, '') as genre_name
	from book_genre
	order by book_id asc
`;
const topicRows = await sql`
	select
		book_id::bigint as book_id,
		coalesce(tag_slug, '') as tag_slug,
		coalesce(tag_name, '') as tag_name
	from book_tag
	order by book_id asc
`;

const byBook = new Map();
for (const row of genreRows) {
	const bookId = Number(row.book_id || 0);
	if (!bookId) continue;
	const bucket = byBook.get(bookId) || { genres: [], topics: [] };
	const value = normalizeText(row.genre_name || row.genre_slug);
	if (value) bucket.genres.push(value);
	byBook.set(bookId, bucket);
}
for (const row of topicRows) {
	const bookId = Number(row.book_id || 0);
	if (!bookId) continue;
	const bucket = byBook.get(bookId) || { genres: [], topics: [] };
	const value = normalizeText(row.tag_name || row.tag_slug);
	if (value) bucket.topics.push(value);
	byBook.set(bookId, bucket);
}

let booksChanged = 0;
let genreRowsWritten = 0;
let topicRowsWritten = 0;

for (const [bookId, values] of byBook.entries()) {
	const normalizedGenreEntries = normalizeEntries(values.genres).filter((item) => isStandardGenreSlug(item.slug));
	const genreKeySet = new Set(normalizedGenreEntries.map((item) => canonicalKey(item.name)));

	const normalizedTopicEntries = normalizeEntries([...values.topics, ...values.genres])
		.filter((item) => !isStandardGenreSlug(item.slug))
		.filter((item) => !genreKeySet.has(canonicalKey(item.name)));

	await sql`delete from book_genre where book_id = ${bookId}`;
	await sql`delete from book_tag where book_id = ${bookId}`;
	for (const genre of normalizedGenreEntries) {
		await sql`
			insert into book_genre (book_id, genre_slug, genre_name)
			values (${bookId}, ${genre.slug}, ${genre.name})
			on conflict (book_id, genre_slug) do update set genre_name = excluded.genre_name
		`;
		genreRowsWritten += 1;
	}
	for (const topic of normalizedTopicEntries) {
		await sql`
			insert into book_tag (book_id, tag_slug, tag_name)
			values (${bookId}, ${topic.slug}, ${topic.name})
			on conflict (book_id, tag_slug) do update set tag_name = excluded.tag_name
		`;
		topicRowsWritten += 1;
	}
	booksChanged += 1;
}

const [genreStats] = await sql`select count(*)::int as rows, count(distinct genre_slug)::int as distinct_slugs from book_genre`;
const [topicStats] = await sql`select count(*)::int as rows, count(distinct tag_slug)::int as distinct_slugs from book_tag`;

console.log(JSON.stringify({
	booksChanged,
	genreRowsWritten,
	topicRowsWritten,
	genreStats,
	topicStats
}, null, 2));
