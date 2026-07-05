import { toBook, type BrowseBook } from "./homeSections";
import { dedupeCatalogItemsByDisplayWork } from "./catalog";
import { ensureSeriesSchema } from "./series";

export type RecommendationBook = BrowseBook & {
	recommendationReason: string;
	recommendationSource: "personal" | "popular" | "similar" | "community";
};

export type RecommendationSection = {
	id: string;
	title: string;
	subtitle: string;
	emptyState: string;
	books: RecommendationBook[];
};

function normalizeText(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function firstSentence(value: string) {
	return normalizeText(value).replace(/[.!?].*$/, "").slice(0, 90);
}

export async function ensureRecommendationSchema(sql: any) {
	await ensureSeriesSchema(sql);
	await sql`
		create table if not exists user_recommendation_feedback (
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			feedback text not null check (feedback in ('interesting', 'not_interested')),
			source text not null default '',
			reason text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (user_id, book_id)
		)
	`;
	await sql`create index if not exists idx_recommendation_feedback_user_updated on user_recommendation_feedback(user_id, updated_at desc)`;
}

function reasonFor(row: {
	matched_genre: string | null;
	enjoyed_author: boolean | null;
	seed_title: string | null;
	average_rating: number | null;
	rating_count: number | null;
	shelf_count: number | null;
}) {
	const seedTitle = firstSentence(String(row.seed_title || ""));
	if (seedTitle) return `Because you enjoyed ${seedTitle}.`;
	if (row.enjoyed_author) return "By an author you've rated highly.";
	const genre = normalizeText(row.matched_genre);
	if (genre) return `Popular with ${genre} readers.`;
	const average = Number(row.average_rating || 0);
	const ratingCount = Number(row.rating_count || 0);
	if (average >= 4 && ratingCount > 0) return `${average.toFixed(1)}/5 average from DogEared readers.`;
	return `${Number(row.shelf_count || 0).toLocaleString()} shelf entries from DogEared readers.`;
}

export async function loadRecommendedForUser(sql: any, userId: string, limit = 8): Promise<RecommendationSection> {
	await ensureRecommendationSchema(sql);
	const normalizedUserId = normalizeText(userId);
	if (!normalizedUserId) return loadPopularFallbackRecommendations(sql, limit);
	const rows = await sql<Array<{
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
			matched_genre: string | null;
			enjoyed_author: boolean | null;
			seed_title: string | null;
			series_name: string | null;
			series_book_order: number | null;
	}>>`
			with viewer_books as (
				select ub.book_id, ub.rating, ub.status, b.title, b.primary_author, b.author_id
				from user_book ub
				join book b on b.id = ub.book_id
				where ub.user_id = ${normalizedUserId}::uuid
			),
			favorite_genres as (
				select bg.genre_name, count(*)::int as weight
				from viewer_books vb
				join book_genre bg on bg.book_id = vb.book_id
				where (vb.rating >= 4 or vb.status = 'finished')
					and trim(coalesce(bg.genre_name, '')) <> ''
				group by bg.genre_name
				order by weight desc, bg.genre_name asc
				limit 8
			),
			enjoyed_authors as (
				select primary_author, max(title) as seed_title, count(*)::int as weight
				from viewer_books
				where rating >= 4
					and trim(coalesce(primary_author, '')) <> ''
				group by primary_author
				order by weight desc, primary_author asc
				limit 8
			),
			seed_books as (
				select vb.book_id, vb.title
				from viewer_books vb
				where vb.rating >= 4 or vb.status = 'finished'
				order by coalesce(vb.rating, 0) desc
				limit 12
			),
			candidate_stats as (
				select
					b.id as book_id,
					b.title,
					b.primary_author,
					b.author_id,
					coalesce(count(distinct ub.user_id), 0)::int as shelf_count,
					coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
					coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
					b.published_year,
					b.language,
					b.isbn10,
					b.isbn13,
					b.google_books_id,
					coalesce(nullif(b.page_count, 0), 0)::int as page_count,
					round(avg(ub.rating)::numeric, 2) as average_rating,
					count(*) filter (where ub.rating is not null)::int as rating_count,
					series_info.series_name,
					series_info.series_book_order,
					(
						select fg.genre_name
						from favorite_genres fg
						join book_genre bg on bg.book_id = b.id and lower(bg.genre_name) = lower(fg.genre_name)
						order by fg.weight desc, fg.genre_name asc
						limit 1
					) as matched_genre,
					exists (
						select 1 from enjoyed_authors ea
						where lower(ea.primary_author) = lower(b.primary_author)
					) as enjoyed_author,
					(
						select sb.title
						from seed_books sb
						join book_genre sbg on sbg.book_id = sb.book_id
						join book_genre cbg on cbg.book_id = b.id and lower(cbg.genre_name) = lower(sbg.genre_name)
						where sb.book_id <> b.id
						order by sb.title asc
						limit 1
					) as seed_title
				from book b
				left join user_book ub on ub.book_id = b.id
				left join lateral (
					select
						s.name as series_name,
						sb.book_order as series_book_order
					from series_book sb
					join series s on s.id = sb.series_id
					where sb.book_id = b.id
					order by sb.book_order nulls last, s.name asc
					limit 1
				) series_info on true
				where not exists (
					select 1 from viewer_books vb where vb.book_id = b.id
				)
					and not exists (
						select 1 from user_recommendation_feedback rf
						where rf.user_id = ${normalizedUserId}::uuid
							and rf.book_id = b.id
							and rf.feedback = 'not_interested'
					)
				group by b.id, series_info.series_name, series_info.series_book_order
			)
			select *
			from candidate_stats
			where shelf_count > 0
				and (matched_genre is not null or enjoyed_author or seed_title is not null or rating_count > 0)
			order by
				(case when seed_title is not null then 12 else 0 end)
				+ (case when enjoyed_author then 10 else 0 end)
				+ (case when matched_genre is not null then 8 else 0 end)
				+ (coalesce(average_rating, 0) * 2)
				+ least(shelf_count, 20) desc,
				rating_count desc,
				title asc
			limit ${Math.max(1, Math.min(24, limit))}
	`;
	if (rows.length === 0) return loadPopularFallbackRecommendations(sql, limit);
	return {
		id: "recommended-for-you",
		title: "Recommended For You",
		subtitle: "Explainable suggestions based on your shelves, ratings, finished books, favorite genres, and authors.",
		emptyState: "The more books you add, rate, and review, the better your recommendations become.",
		books: dedupeCatalogItemsByDisplayWork(rows.map((row) => ({
			...toBook(row),
			recommendationReason: reasonFor(row),
			recommendationSource: "personal" as const,
			discoveryReason: reasonFor(row)
		})))
	};
}

export async function loadPopularFallbackRecommendations(sql: any, limit = 8): Promise<RecommendationSection> {
	await ensureRecommendationSchema(sql);
	const rows = await sql<Array<{
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
		series_name: string | null;
		series_book_order: number | null;
	}>>`
		select
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			count(distinct ub.user_id)::int as shelf_count,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			b.cover_url,
			b.published_year,
			b.language,
			b.isbn10,
			b.isbn13,
			b.google_books_id,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			round(avg(ub.rating)::numeric, 2) as average_rating,
			count(*) filter (where ub.rating is not null)::int as rating_count,
			series_info.series_name,
			series_info.series_book_order
		from book b
		join user_book ub on ub.book_id = b.id
		left join lateral (
			select
				s.name as series_name,
				sb.book_order as series_book_order
			from series_book sb
			join series s on s.id = sb.series_id
			where sb.book_id = b.id
			order by sb.book_order nulls last, s.name asc
			limit 1
		) series_info on true
		group by b.id, series_info.series_name, series_info.series_book_order
		order by count(distinct ub.user_id) desc, coalesce(avg(ub.rating), 0) desc, b.title asc
		limit ${Math.max(1, Math.min(24, limit))}
	`;
	return {
		id: "recommended-for-you",
		title: "Recommended For You",
		subtitle: "Start here while DogEared learns your taste. These books are popular with active readers.",
		emptyState: "The more books you add, rate, and review, the better your recommendations become.",
		books: dedupeCatalogItemsByDisplayWork(rows.map((row) => {
			const reason = `${Number(row.shelf_count || 0).toLocaleString()} shelf entries from DogEared readers.`;
			return {
				...toBook(row),
				recommendationReason: reason,
				recommendationSource: "popular" as const,
				discoveryReason: reason
			};
		}))
	};
}

export async function loadReadersAlsoEnjoyed(sql: any, bookId: number, userId = "", limit = 6): Promise<RecommendationSection> {
	await ensureRecommendationSchema(sql);
	const id = Math.max(0, Number(bookId || 0) || 0);
	if (!id) return { id: "readers-also-enjoyed", title: "Readers Also Enjoyed", subtitle: "Books connected through reader shelves, genres, and authors.", emptyState: "No related reader recommendations yet.", books: [] };
	const normalizedUserId = normalizeText(userId);
	const rows = await sql<Array<{
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
		shared_readers: number;
		shared_genre: string | null;
		same_author: boolean;
		series_name: string | null;
		series_book_order: number | null;
	}>>`
		with source_book as (
			select id, primary_author from book where id = ${id}
		),
		source_readers as (
			select user_id from user_book where book_id = ${id}
		),
		source_genres as (
			select genre_name from book_genre where book_id = ${id}
		)
		select
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			count(distinct ub.user_id)::int as shelf_count,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			b.cover_url,
			b.published_year,
			b.language,
			b.isbn10,
			b.isbn13,
			b.google_books_id,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			round(avg(ub.rating)::numeric, 2) as average_rating,
			count(*) filter (where ub.rating is not null)::int as rating_count,
			count(distinct sr.user_id)::int as shared_readers,
			series_info.series_name,
			series_info.series_book_order,
			(
				select sg.genre_name
				from source_genres sg
				join book_genre bg on bg.book_id = b.id and lower(bg.genre_name) = lower(sg.genre_name)
				order by sg.genre_name asc
				limit 1
			) as shared_genre,
			exists (
				select 1 from source_book sb
				where trim(coalesce(sb.primary_author, '')) <> ''
					and lower(sb.primary_author) = lower(b.primary_author)
			) as same_author
		from book b
		left join user_book ub on ub.book_id = b.id
		left join source_readers sr on sr.user_id = ub.user_id
		left join lateral (
			select
				s.name as series_name,
				sb.book_order as series_book_order
			from series_book sb
			join series s on s.id = sb.series_id
			where sb.book_id = b.id
			order by sb.book_order nulls last, s.name asc
			limit 1
		) series_info on true
		where b.id <> ${id}
			and not (${normalizedUserId} <> '' and exists (
				select 1 from user_book viewer
				where viewer.user_id = ${normalizedUserId || "00000000-0000-0000-0000-000000000000"}::uuid
					and viewer.book_id = b.id
			))
		group by b.id, series_info.series_name, series_info.series_book_order
		having count(distinct ub.user_id) > 0
		order by
			count(distinct sr.user_id) desc,
			(case when exists (select 1 from source_book sb where lower(sb.primary_author) = lower(b.primary_author)) then 1 else 0 end) desc,
			coalesce(avg(ub.rating), 0) desc,
			count(distinct ub.user_id) desc,
			b.title asc
		limit ${Math.max(1, Math.min(12, limit))}
	`;
	return {
		id: "readers-also-enjoyed",
		title: "Readers Also Enjoyed",
		subtitle: "Books connected through shared readers, genres, and authors.",
		emptyState: "No related reader recommendations yet.",
		books: dedupeCatalogItemsByDisplayWork(rows.map((row) => {
			const reason = Number(row.shared_readers || 0) > 0
				? `${Number(row.shared_readers || 0).toLocaleString()} reader${Number(row.shared_readers || 0) === 1 ? "" : "s"} also shelved this.`
				: (row.same_author ? "Same author as this book." : (row.shared_genre ? `Shares ${row.shared_genre} with this book.` : "Popular with DogEared readers."));
			return {
				...toBook(row),
				recommendationReason: reason,
				recommendationSource: "similar" as const,
				discoveryReason: reason
			};
		}))
	};
}
