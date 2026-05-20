export function formatGenreLabel(value: string, fallback = "Genre") {
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
	"young-adult"
]);

const GENRE_ALIASES: Record<string, { slug: string; name: string }> = {
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
	"time-travel-in-fiction": { slug: "time-travel", name: "Time Travel" }
};

function slugify(value: string) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function splitGenreParts(value: unknown) {
	return String(value || "")
		.split(/\s*(?:\/|&|,|\band\b)\s*/gi)
		.map((part) => String(part || "").trim())
		.filter(Boolean);
}

function isGenreSlug(slug: string) {
	if (!slug || NON_GENRE_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	if (ARTIFACT_SLUG_PATTERNS.some((pattern) => pattern.test(slug))) return false;
	return true;
}

function isStandardGenreSlug(slug: string) {
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

function normalizeSubjectEntry(value: unknown) {
	const parts = splitGenreParts(value);
	if (parts.length === 0) return [] as Array<{ slug: string; name: string }>;

	const out: Array<{ slug: string; name: string }> = [];
	const dedupe = new Set<string>();
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

export function normalizeGenreEntry(value: unknown) {
	return normalizeSubjectEntry(value).filter((item) => isStandardGenreSlug(item.slug));
}

export function normalizeGenreList(input: unknown, limit = 8) {
	const values = Array.isArray(input) ? input : [];
	const out: Array<{ slug: string; name: string }> = [];
	const dedupe = new Set<string>();
	for (const value of values) {
		for (const item of normalizeSubjectEntry(value)) {
			if (!isStandardGenreSlug(item.slug)) continue;
			if (dedupe.has(item.slug)) continue;
			dedupe.add(item.slug);
			out.push(item);
			if (out.length >= limit) return out;
		}
	}
	return out;
}

export function normalizeTopicTagList(input: unknown, limit = 12) {
	const values = Array.isArray(input) ? input : [];
	const out: Array<{ slug: string; name: string }> = [];
	const dedupe = new Set<string>();
	for (const value of values) {
		for (const item of normalizeSubjectEntry(value)) {
			if (isStandardGenreSlug(item.slug)) continue;
			if (dedupe.has(item.slug)) continue;
			dedupe.add(item.slug);
			out.push(item);
			if (out.length >= limit) return out;
		}
	}
	return out;
}
