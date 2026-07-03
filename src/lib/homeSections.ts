import { authorHref } from "./author";
import {
	createDiscoveryService,
	type CommunityDiscoverySignal
} from "./discoveryProviders";
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
	discoveryReason?: string;
	titleHref?: string;
	reviewSnippet?: string;
	reviewerName?: string;
	reviewerHref?: string;
	reviewRating?: number;
	source: "google_books" | "open_library" | "nyt";
	sourceWorkId?: string;
	sourceEditionId?: string;
	sourceUrl?: string;
};

export type BrowseSection = {
	id: string;
	title: string;
	subtitle: string;
	priority?: number;
	emptyState?: string;
	books: BrowseBook[];
};

type TimingReporter = (label: string, durationMs: number) => void;

const HOME_RECOMMENDATION_CACHE_MS = 5 * 60 * 1000;
const HOME_SECTION_LIMIT = 8;
const HOME_BOOKS_PER_SECTION = 12;
const publicHomeDiscoveryService = createDiscoveryService();

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

let discoverySupportSchemaReady: Promise<void> | null = null;

function ensureDiscoverySupportSchema() {
	if (!discoverySupportSchemaReady) {
		const sql = getNeonSql();
		discoverySupportSchemaReady = Promise.all([
			sql`alter table user_book add column if not exists rating int`,
			sql`alter table user_book add column if not exists finished_reflection text not null default ''`,
			sql`
				create table if not exists user_activity_like (
					activity_id bigint not null references user_activity(id) on delete cascade,
					user_id uuid not null references app_user(id) on delete cascade,
					created_at timestamptz not null default now(),
					primary key (activity_id, user_id)
				)
			`,
			sql`
				create table if not exists user_activity_comment (
					id bigserial primary key,
					activity_id bigint not null references user_activity(id) on delete cascade,
					user_id uuid not null references app_user(id) on delete cascade,
					body text not null default '',
					created_at timestamptz not null default now(),
					check (char_length(trim(body)) between 1 and 500)
				)
			`
		]).then(() => undefined);
	}
	return discoverySupportSchemaReady;
}

async function loadPublicHomeSections(reporter?: TimingReporter): Promise<BrowseSection[]> {
	const sql = getNeonSql();
	await timed("db:home-discovery-schema", reporter, () => ensureDiscoverySupportSchema());
	const rows = await timed("db:home-community-signals", reporter, () => sql<Array<{
		book_id: number;
		title: string;
		primary_author: string;
		author_id: number | null;
		shelf_count: number;
		reader_count: number;
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
		review_count: number;
		added_events_7d: number;
		added_readers_7d: number;
		last_added_at: string | null;
		finished_events_7d: number;
		finished_readers_7d: number;
		last_finished_at: string | null;
		current_activity_14d: number;
		previous_activity_14d: number;
		current_readers_14d: number;
		previous_readers_14d: number;
		current_finishes_14d: number;
		previous_finishes_14d: number;
		current_ratings_14d: number;
		previous_ratings_14d: number;
		current_reviews_14d: number;
		previous_reviews_14d: number;
		recent_review_text: string | null;
		recent_review_user_id: string | null;
		recent_review_username: string | null;
		recent_review_rating: number | null;
		recent_review_updated_at: string | null;
		recent_review_reactions: number;
		source: "google_books" | "open_library" | "nyt" | null;
		source_work_id: string | null;
		source_edition_id: string | null;
		source_url: string | null;
	}>>`
		with shelf_stats as (
			select
				ub.book_id,
				count(*)::int as shelf_count,
				count(distinct ub.user_id)::int as reader_count,
				round(avg(ub.rating)::numeric, 2) as average_rating,
				count(*) filter (where ub.rating is not null)::int as rating_count,
				count(*) filter (where char_length(trim(coalesce(ub.finished_reflection, ''))) > 0)::int as review_count,
				count(*) filter (where ub.first_added_at >= now() - interval '7 days')::int as added_events_7d,
				count(distinct ub.user_id) filter (where ub.first_added_at >= now() - interval '7 days')::int as added_readers_7d,
				max(ub.first_added_at) filter (where ub.first_added_at >= now() - interval '7 days')::text as last_added_at,
				count(*) filter (
					where char_length(trim(coalesce(ub.finished_reflection, ''))) > 0
						and ub.updated_at >= now() - interval '14 days'
				)::int as current_reviews_14d,
				count(*) filter (
					where char_length(trim(coalesce(ub.finished_reflection, ''))) > 0
						and ub.updated_at >= now() - interval '28 days'
						and ub.updated_at < now() - interval '14 days'
				)::int as previous_reviews_14d
			from user_book ub
			group by ub.book_id
		),
		activity_stats as (
			select
				ua.book_id,
				count(*) filter (
					where ua.event_type = 'finished'
						and ua.created_at >= now() - interval '7 days'
				)::int as finished_events_7d,
				count(distinct ua.user_id) filter (
					where ua.event_type = 'finished'
						and ua.created_at >= now() - interval '7 days'
				)::int as finished_readers_7d,
				max(ua.created_at) filter (
					where ua.event_type = 'finished'
						and ua.created_at >= now() - interval '7 days'
				)::text as last_finished_at,
				count(*) filter (where ua.created_at >= now() - interval '14 days')::int as current_activity_14d,
				count(*) filter (
					where ua.created_at >= now() - interval '28 days'
						and ua.created_at < now() - interval '14 days'
				)::int as previous_activity_14d,
				count(distinct ua.user_id) filter (where ua.created_at >= now() - interval '14 days')::int as current_readers_14d,
				count(distinct ua.user_id) filter (
					where ua.created_at >= now() - interval '28 days'
						and ua.created_at < now() - interval '14 days'
				)::int as previous_readers_14d,
				count(*) filter (
					where ua.event_type = 'finished'
						and ua.created_at >= now() - interval '14 days'
				)::int as current_finishes_14d,
				count(*) filter (
					where ua.event_type = 'finished'
						and ua.created_at >= now() - interval '28 days'
						and ua.created_at < now() - interval '14 days'
				)::int as previous_finishes_14d,
				count(*) filter (
					where ua.event_type = 'rating'
						and ua.created_at >= now() - interval '14 days'
				)::int as current_ratings_14d,
				count(*) filter (
					where ua.event_type = 'rating'
						and ua.created_at >= now() - interval '28 days'
						and ua.created_at < now() - interval '14 days'
				)::int as previous_ratings_14d
			from user_activity ua
			group by ua.book_id
		)
		select
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			coalesce(ss.shelf_count, 0)::int as shelf_count,
			coalesce(ss.reader_count, 0)::int as reader_count,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			b.cover_url,
			b.published_year,
			b.language,
			b.isbn10,
			b.isbn13,
			b.google_books_id,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(ss.average_rating, 0) as average_rating,
			coalesce(ss.rating_count, 0)::int as rating_count,
			coalesce(ss.review_count, 0)::int as review_count,
			coalesce(ss.added_events_7d, 0)::int as added_events_7d,
			coalesce(ss.added_readers_7d, 0)::int as added_readers_7d,
			ss.last_added_at,
			coalesce(ast.finished_events_7d, 0)::int as finished_events_7d,
			coalesce(ast.finished_readers_7d, 0)::int as finished_readers_7d,
			ast.last_finished_at,
			coalesce(ast.current_activity_14d, 0)::int as current_activity_14d,
			coalesce(ast.previous_activity_14d, 0)::int as previous_activity_14d,
			coalesce(ast.current_readers_14d, 0)::int as current_readers_14d,
			coalesce(ast.previous_readers_14d, 0)::int as previous_readers_14d,
			coalesce(ast.current_finishes_14d, 0)::int as current_finishes_14d,
			coalesce(ast.previous_finishes_14d, 0)::int as previous_finishes_14d,
			coalesce(ast.current_ratings_14d, 0)::int as current_ratings_14d,
			coalesce(ast.previous_ratings_14d, 0)::int as previous_ratings_14d,
			coalesce(ss.current_reviews_14d, 0)::int as current_reviews_14d,
			coalesce(ss.previous_reviews_14d, 0)::int as previous_reviews_14d,
			recent_review.finished_reflection as recent_review_text,
			recent_review.user_id as recent_review_user_id,
			recent_review.username as recent_review_username,
			recent_review.rating as recent_review_rating,
			recent_review.updated_at as recent_review_updated_at,
			coalesce(recent_review.reactions, 0)::int as recent_review_reactions,
			bs.source,
			bs.source_work_id,
			bs.source_edition_id,
			bs.source_url
		from book b
		join shelf_stats ss on ss.book_id = b.id
		left join activity_stats ast on ast.book_id = b.id
		left join lateral (
			select
				ub.user_id::text as user_id,
				coalesce(nullif(trim(au.username), ''), '') as username,
				ub.rating,
				ub.finished_reflection,
				ub.updated_at::text as updated_at,
				coalesce(reaction_counts.reactions, 0)::int as reactions
			from user_book ub
			join app_user au on au.id = ub.user_id
			left join lateral (
				select ua.id
				from user_activity ua
				where ua.user_id = ub.user_id
					and ua.book_id = ub.book_id
					and ua.event_type in ('finished', 'rating')
				order by ua.created_at desc, ua.id desc
				limit 1
			) review_activity on true
			left join lateral (
				select (
					(select count(*)::int from user_activity_like ual where ual.activity_id = review_activity.id)
					+
					(select count(*)::int from user_activity_comment uac where uac.activity_id = review_activity.id)
				)::int as reactions
			) reaction_counts on true
			where ub.book_id = b.id
				and char_length(trim(coalesce(ub.finished_reflection, ''))) > 0
			order by
				coalesce(reaction_counts.reactions, 0) desc,
				ub.updated_at desc,
				char_length(ub.finished_reflection) desc
			limit 1
		) recent_review on true
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
		where coalesce(ss.shelf_count, 0) > 0
		order by greatest(
			coalesce(ast.current_activity_14d, 0),
			coalesce(ss.rating_count, 0),
			coalesce(ss.review_count, 0)
		) desc, b.updated_at desc
		limit 500
	`);

	const rowsByBookId = new Map<number, typeof rows[number]>();
	const signals: CommunityDiscoverySignal[] = rows.map((row) => {
		const bookId = Number(row.book_id || 0);
		rowsByBookId.set(bookId, row);
		return {
			bookId,
			title: String(row.title || "").trim(),
			averageRating: Number(row.average_rating || 0),
			ratingCount: Math.max(0, Number(row.rating_count || 0)),
			readerCount: Math.max(0, Number(row.reader_count || 0)),
			shelfCount: Math.max(0, Number(row.shelf_count || 0)),
			publishedYear: Math.max(0, Number(row.published_year || 0) || 0),
			addedEvents7d: Math.max(0, Number(row.added_events_7d || 0)),
			addedReaders7d: Math.max(0, Number(row.added_readers_7d || 0)),
			lastAddedAt: String(row.last_added_at || ""),
			finishedEvents7d: Math.max(0, Number(row.finished_events_7d || 0)),
			finishedReaders7d: Math.max(0, Number(row.finished_readers_7d || 0)),
			lastFinishedAt: String(row.last_finished_at || ""),
			currentActivity14d: Math.max(0, Number(row.current_activity_14d || 0)),
			previousActivity14d: Math.max(0, Number(row.previous_activity_14d || 0)),
			currentReaders14d: Math.max(0, Number(row.current_readers_14d || 0)),
			previousReaders14d: Math.max(0, Number(row.previous_readers_14d || 0)),
			currentFinishes14d: Math.max(0, Number(row.current_finishes_14d || 0)),
			previousFinishes14d: Math.max(0, Number(row.previous_finishes_14d || 0)),
			currentRatings14d: Math.max(0, Number(row.current_ratings_14d || 0)),
			previousRatings14d: Math.max(0, Number(row.previous_ratings_14d || 0)),
			currentReviews14d: Math.max(0, Number(row.current_reviews_14d || 0)),
			previousReviews14d: Math.max(0, Number(row.previous_reviews_14d || 0)),
			reviewCount: Math.max(0, Number(row.review_count || 0)),
			recentReviewText: sanitizeDescription(String(row.recent_review_text || ""), 260),
			recentReviewUserId: String(row.recent_review_user_id || ""),
			recentReviewUsername: String(row.recent_review_username || ""),
			recentReviewRating: Math.max(0, Math.min(5, Number(row.recent_review_rating || 0) || 0)),
			recentReviewUpdatedAt: String(row.recent_review_updated_at || ""),
			recentReviewReactions: Math.max(0, Number(row.recent_review_reactions || 0))
		};
	});

	const providerSections = publicHomeDiscoveryService.getSections(signals, { limit: HOME_BOOKS_PER_SECTION });
	const sections = providerSections
		.slice(0, HOME_SECTION_LIMIT)
		.map((section) => ({
			id: section.id,
			title: section.title,
			subtitle: section.description,
			priority: section.priority,
			emptyState: section.emptyState,
			books: section.books
				.map((result) => {
					const row = rowsByBookId.get(result.bookId);
					if (!row) return null;
					return {
						...toBook(row),
						discoveryReason: result.reason,
						titleHref: result.titleHref,
						reviewSnippet: result.reviewSnippet,
						reviewerName: result.reviewerName,
						reviewerHref: result.reviewerHref,
						reviewRating: result.reviewRating
					};
				})
				.filter((book): book is BrowseBook => !!book)
		}))
		.filter((section) => section.books.length > 0);
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
		priority: 999,
		books: fallbackRows.map((row) => ({
			...toBook(row),
			discoveryReason: `${Number(row.shelf_count || 0).toLocaleString()} shelf entries from DogEared readers.`
		}))
	}];
}

export async function resolvePublicHomeSections(options: { onTiming?: TimingReporter } = {}) {
	return timed("provider:public-home-sections", options.onTiming, () => withRuntimeCache(
		"home:public-sections:v3",
		HOME_RECOMMENDATION_CACHE_MS,
		() => loadPublicHomeSections(options.onTiming)
	));
}
