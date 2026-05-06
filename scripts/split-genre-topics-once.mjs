import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL.");
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

const STANDARD_GENRE_SLUGS = new Set([
	"action","adventure","anthology","autobiography","biography","classic","comedy","comics","contemporary",
	"crime","detective","dystopian","epic","fantasy","graphic-novel","historical","horror","humor","literary",
	"magic","memoir","mystery","mythology","paranormal","philosophy","poetry","post-apocalyptic","psychological",
	"romance","satire","science-fiction","self-help","short-story","social-science","space-opera","steampunk",
	"suspense","thriller","time-travel","true-crime","urban-fantasy","war","western","women-s-fiction","young-adult"
]);

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
	"time travel in fiction": { slug: "time-travel", name: "Time Travel" }
};

function formatGenreLabel(value, fallback = "Tag") {
	const source = String(value || "").trim();
	if (!source) return fallback;
	return source
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
		.split(" ")
		.map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
		.join(" ");
}

function slugify(value) {
	return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isAllowedSlug(slug) {
	if (!slug || NON_GENRE_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	if (ARTIFACT_SLUG_PATTERNS.some((p) => p.test(slug))) return false;
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

function canonicalize(raw) {
	const clean = String(raw || "").trim();
	if (!clean) return null;
	const alias = GENRE_ALIASES[clean.toLowerCase()];
	const name = alias?.name || clean;
	const slug = alias?.slug || slugify(name);
	if (!isAllowedSlug(slug)) return null;
	return { slug, name: formatGenreLabel(name, name) };
}

await sql`
	create table if not exists book_tag (
		book_id bigint not null references book(id) on delete cascade,
		tag_slug text not null,
		tag_name text not null,
		primary key (book_id, tag_slug)
	)
`;

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
	list.push({ slug: String(row.genre_slug || ""), name: String(row.genre_name || "") });
	byBook.set(bookId, list);
}

let booksChanged = 0;
let movedToTags = 0;
let keptGenres = 0;

for (const [bookId, entries] of byBook.entries()) {
	const genreMap = new Map();
	const tagMap = new Map();

	for (const entry of entries) {
		const normalized = canonicalize(entry.name || entry.slug);
		if (!normalized) continue;
		if (isStandardGenreSlug(normalized.slug)) {
			if (!genreMap.has(normalized.slug)) genreMap.set(normalized.slug, normalized.name);
		} else {
			if (!tagMap.has(normalized.slug)) tagMap.set(normalized.slug, normalized.name);
		}
	}

	const before = entries.map((x) => `${x.slug}:${x.name}`).sort().join("|");
	const afterGenres = Array.from(genreMap.entries()).map(([slug, name]) => `${slug}:${name}`).sort().join("|");
	if (before !== afterGenres || tagMap.size > 0) booksChanged += 1;

	await sql`delete from book_genre where book_id = ${bookId}`;
	for (const [slug, name] of genreMap.entries()) {
		keptGenres += 1;
		await sql`
			insert into book_genre (book_id, genre_slug, genre_name)
			values (${bookId}, ${slug}, ${name})
			on conflict (book_id, genre_slug) do update set genre_name = excluded.genre_name
		`;
	}
	for (const [slug, name] of tagMap.entries()) {
		movedToTags += 1;
		await sql`
			insert into book_tag (book_id, tag_slug, tag_name)
			values (${bookId}, ${slug}, ${name})
			on conflict (book_id, tag_slug) do update set tag_name = excluded.tag_name
		`;
	}
}

const [genreStats] = await sql`select count(distinct genre_slug)::int as distinct_genres, count(*)::int as genre_rows from book_genre`;
const [tagStats] = await sql`select count(distinct tag_slug)::int as distinct_tags, count(*)::int as tag_rows from book_tag`;

console.log(JSON.stringify({
	booksChanged,
	keptGenres,
	movedToTags,
	genreStats,
	tagStats
}, null, 2));

