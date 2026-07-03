import { authorHref } from "./author";
import { formatGenreLabel } from "./genres";
import { getNeonSql } from "./neon";
import { withRuntimeCache } from "./runtimeCache";

export type BrowseBook = {
	id: string;
	title: string;
	authors: string[];
	authorId: number;
	authorHref: string;
	shelfCount: number;
	thumbnail: string;
	publishedDate: string;
	description: string;
	pageCount: number;
	format: string;
	language: string;
	isbn10?: string;
	isbn13?: string;
	averageRating: number;
	ratingCount: number;
	source: "google_books" | "open_library" | "nyt";
	sourceWorkId?: string;
	sourceEditionId?: string;
	sourceUrl?: string;
};

export type BrowseSection = {
	id: string;
	title: string;
	subtitle: string;
	books: BrowseBook[];
};

type TimingReporter = (label: string, durationMs: number) => void;

const HOME_RECOMMENDATION_CACHE_MS = 5 * 60 * 1000;
const HOME_SECTION_LIMIT = 8;
const HOME_BOOKS_PER_SECTION = 12;

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

function isGenreSlug(slug: string) {
	if (!slug || NON_GENRE_SLUGS.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	return true;
}

function formatGenreTitle(slug: string, fallback: string) {
	const source = String(fallback || slug || "").trim();
	return formatGenreLabel(source, "Genre");
}

export function formatPublishedLabel(value: string) {
	const text = String(value || "").trim();
	if (!text) return "";
	if (/^\d{4}$/.test(text)) return text;
	if (/^\d{4}-\d{2}$/.test(text)) {
		const parsed = new Date(`${text}-01`);
		if (!Number.isFinite(parsed.getTime())) return text;
		return parsed.toLocaleDateString("en-US", {
			month: "long",
			year: "numeric"
		});
	}
	const parsed = new Date(text);
	if (!Number.isFinite(parsed.getTime())) return text;
	return parsed.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric"
	});
}

export function sanitizeDescription(value: string, maxLength = 220) {
	const text = String(value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).trimEnd()}…`;
}

function toBook(row: {
	book_id: number;
	title: string;
	primary_author: string;
	author_id: number | null;
	shelf_count: number;
	synopsis: string;
	cover_url: string;
	published_year: number | null;
	language: string;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	page_count: number;
	average_rating: number | null;
	rating_count: number;
	source?: "google_books" | "open_library" | "nyt" | null;
	source_work_id?: string | null;
	source_edition_id?: string | null;
	source_url?: string | null;
}): BrowseBook {
	const author = String(row.primary_author || "").trim();
	const source = row.source || (row.google_books_id ? "google_books" : "open_library");
	const googleBooksId = String(row.google_books_id || "").trim();
	return {
		id: `book_${row.book_id}`,
		title: String(row.title || "").trim(),
		authors: [author].filter(Boolean),
		authorId: Number(row.author_id || 0),
		authorHref: author ? authorHref(author, Number(row.author_id || 0)) : "",
		shelfCount: Number(row.shelf_count || 0),
		thumbnail: String(row.cover_url || "").trim(),
		publishedDate: row.published_year ? String(row.published_year) : "",
		description: sanitizeDescription(String(row.synopsis || "")),
		pageCount: Math.max(0, Number(row.page_count || 0) || 0),
		format: "Book",
		language: String(row.language || "").trim().toUpperCase(),
		isbn10: String(row.isbn10 || "").trim(),
		isbn13: String(row.isbn13 || "").trim(),
		averageRating: Number(row.average_rating || 0),
		ratingCount: Number(row.rating_count || 0),
		source,
		sourceWorkId: String(row.source_work_id || googleBooksId || "").trim(),
		sourceEditionId: String(row.source_edition_id || "").trim(),
		sourceUrl: String(
			row.source_url ||
			(googleBooksId ? `https://books.google.com/books?id=${encodeURIComponent(googleBooksId)}` : "")
		).trim()
	};
}

async function timed<T>(label: string, reporter: TimingReporter | undefined, loader: () => Promise<T>) {
	const start = performance.now();
	try {
		return await loader();
	} finally {
		reporter?.(label, performance.now() - start);
	}
}

async function loadPublicHomeSections(reporter?: TimingReporter): Promise<BrowseSection[]> {
	const sql = getNeonSql();
	const genreRows = await timed("db:home-genres", reporter, () => sql<Array<{
		genre_slug: string;
		genre_name: string;
		book_count: number;
	}>>`
		select
			bg.genre_slug,
			min(bg.genre_name) as genre_name,
			count(distinct bg.book_id) as book_count
		from book_genre bg
		join user_book ub on ub.book_id = bg.book_id
		group by bg.genre_slug
		order by count(distinct bg.book_id) desc, min(bg.genre_name) asc
		limit 24
	`);

	const sectionsConfig = genreRows
		.filter((row) => isGenreSlug(String(row.genre_slug || "").trim()))
		.slice(0, HOME_SECTION_LIMIT)
		.map((row) => {
			const id = String(row.genre_slug || "").trim();
			const title = formatGenreTitle(id, String(row.genre_name || "").trim());
			return {
				id,
				title,
				subtitle: `Books readers on DogEared are shelving in ${title.toLowerCase()}.`
			};
		});

	if (sectionsConfig.length === 0) return resolveFallbackHomeSections(reporter);

	const sectionIds = sectionsConfig.map((section) => section.id);
	const sectionTitles = sectionsConfig.map((section) => section.title);
	const sectionSubtitles = sectionsConfig.map((section) => section.subtitle);
	const rows = await timed("db:home-section-books", reporter, () => sql<Array<{
		section_id: string;
		section_title: string;
		section_subtitle: string;
		section_order: number;
		book_id: number;
		title: string;
		primary_author: string;
		author_id: number | null;
		shelf_count: number;
		synopsis: string;
		cover_url: string;
		published_year: number | null;
		language: string;
		isbn10: string;
		isbn13: string;
		google_books_id: string;
		page_count: number;
		average_rating: number | null;
		rating_count: number;
		source: "google_books" | "open_library" | "nyt" | null;
		source_work_id: string | null;
		source_edition_id: string | null;
		source_url: string | null;
	}>>`
		with section_config as (
			select *
			from unnest(${sectionIds}::text[], ${sectionTitles}::text[], ${sectionSubtitles}::text[])
				with ordinality as s(section_id, section_title, section_subtitle, section_order)
		),
		ranked as (
			select
				s.section_id,
				s.section_title,
				s.section_subtitle,
				s.section_order,
				top_books.book_id,
				top_books.book_rank
			from section_config s
			cross join lateral get_top_books_by_genre(s.section_id, ${HOME_BOOKS_PER_SECTION}, 3650)
				with ordinality as top_books(book_id, book_rank)
		)
		select
			r.section_id,
			r.section_title,
			r.section_subtitle,
			r.section_order::int,
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			b.cover_url,
			b.published_year,
			b.language,
			b.isbn10,
			b.isbn13,
			b.google_books_id,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(ra.average_rating, 0) as average_rating,
			coalesce(ra.rating_count, 0)::int as rating_count,
			bs.source,
			bs.source_work_id,
			bs.source_edition_id,
			bs.source_url
		from ranked r
		join book b on b.id = r.book_id
		left join lateral (
			select count(*)::int as shelf_count
			from user_book ub
			where ub.book_id = b.id
		) sc on true
		left join lateral (
			select
				round(avg(ub.rating)::numeric, 1) as average_rating,
				count(*) filter (where ub.rating is not null) as rating_count
			from user_book ub
			where ub.book_id = b.id
		) ra on true
		left join lateral (
			select
				source,
				source_work_id,
				source_edition_id,
				source_url
			from book_source
			where book_id = b.id
			order by
				case source
					when 'google_books' then 1
					when 'open_library' then 2
					when 'nyt' then 3
					else 9
				end,
				id asc
			limit 1
		) bs on true
		order by r.section_order, r.book_rank
	`);

	const sectionsById = new Map<string, BrowseSection>();
	for (const section of sectionsConfig) {
		sectionsById.set(section.id, { ...section, books: [] });
	}
	for (const row of rows) {
		const section = sectionsById.get(String(row.section_id || ""));
		if (!section) continue;
		section.books.push(toBook(row));
	}

	const sections = Array.from(sectionsById.values()).filter((section) => section.books.length > 0);
	if (sections.length === 0) return resolveFallbackHomeSections(reporter);
	return sections;
}

async function resolveFallbackHomeSections(reporter?: TimingReporter): Promise<BrowseSection[]> {
	const sql = getNeonSql();
	const fallbackRows = await timed("db:home-fallback-books", reporter, () => sql<Array<{
		book_id: number;
		title: string;
		primary_author: string;
		author_id: number | null;
		shelf_count: number;
		synopsis: string;
		cover_url: string;
		published_year: number | null;
		language: string;
		isbn10: string;
		isbn13: string;
		google_books_id: string;
		page_count: number;
		average_rating: number | null;
		rating_count: number;
	}>>`
		select
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			b.cover_url,
			b.published_year,
			b.language,
			b.isbn10,
			b.isbn13,
			b.google_books_id,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(ra.average_rating, 0) as average_rating,
			coalesce(ra.rating_count, 0)::int as rating_count
		from book b
		left join lateral (
			select count(*)::int as shelf_count
			from user_book ub
			where ub.book_id = b.id
		) sc on true
		left join lateral (
			select
				round(avg(ub.rating)::numeric, 1) as average_rating,
				count(*) filter (where ub.rating is not null) as rating_count
			from user_book ub
			where ub.book_id = b.id
		) ra on true
		where coalesce(sc.shelf_count, 0) > 0
		order by coalesce(sc.shelf_count, 0) desc, coalesce(ra.average_rating, 0) desc
		limit 16
	`);

	if (fallbackRows.length === 0) return [];
	return [{
		id: "popular-now",
		title: "Popular With Readers",
		subtitle: "Start here while DogEared learns your taste. These books are popular with active readers.",
		books: fallbackRows.map(toBook)
	}];
}

export async function resolvePublicHomeSections(options: { onTiming?: TimingReporter } = {}) {
	return timed("provider:public-home-sections", options.onTiming, () => withRuntimeCache(
		"home:public-sections:v2",
		HOME_RECOMMENDATION_CACHE_MS,
		() => loadPublicHomeSections(options.onTiming)
	));
}
