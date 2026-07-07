import type { NeonQueryFunction } from "@neondatabase/serverless";
import { ensureAdminSupportSchema } from "./adminData";
import { ensureReadingJournalSchema } from "./readingJournal";
import { ensureRecommendationSchema } from "./recommendations";
import { withRuntimeCache } from "./runtimeCache";

export type ProductAnalyticsEventInput = {
	eventName: string;
	eventGroup?: string;
	userId?: string;
	route?: string;
	source?: string;
	subjectType?: string;
	subjectId?: string | number;
	query?: string;
	resultCount?: number;
	metadata?: Record<string, unknown>;
};

export type AnalyticsMetric = {
	label: string;
	value: number;
	helper?: string;
};

export type AnalyticsTableRow = {
	label: string;
	value: number;
	trend: number;
	helper?: string;
};

export type AdminProductAnalytics = {
	generatedAt: string;
	growth: AnalyticsMetric[];
	reading: AnalyticsMetric[];
	community: AnalyticsMetric[];
	search: {
		totalSearches30d: number;
		noResultSearches30d: number;
		noResultRate30d: number;
		topBooks: AnalyticsTableRow[];
		topAuthors: AnalyticsTableRow[];
		topGenres: AnalyticsTableRow[];
		noResultQueries: AnalyticsTableRow[];
	};
	discovery: {
		impressions30d: number;
		clicks30d: number;
		interesting30d: number;
		hidden30d: number;
		addToShelf30d: number;
		ctr30d: number;
		topSources: AnalyticsTableRow[];
	};
	funnel: Array<AnalyticsMetric & { percent: number }>;
	featureAdoption: AnalyticsTableRow[];
};

function normalizeText(value: unknown, max = 160) {
	return String(value || "").trim().slice(0, max);
}

function normalizeEventName(value: unknown) {
	return normalizeText(value, 80)
		.toLowerCase()
		.replace(/[^a-z0-9_:-]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function normalizeCount(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.floor(parsed));
}

function toNumber(value: unknown) {
	return Math.max(0, Number(value || 0) || 0);
}

function toPercent(numerator: number, denominator: number) {
	if (denominator <= 0) return 0;
	return Math.round((numerator / denominator) * 1000) / 10;
}

function normalizeMetadata(source: Record<string, unknown> | undefined) {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source || {})) {
		const normalizedKey = normalizeText(key, 64).replace(/[^a-zA-Z0-9_-]+/g, "");
		if (!normalizedKey) continue;
		if (typeof value === "number" || typeof value === "boolean") {
			out[normalizedKey] = value;
		} else if (Array.isArray(value)) {
			out[normalizedKey] = value.slice(0, 10).map((item) => normalizeText(item, 120)).filter(Boolean);
		} else {
			const text = normalizeText(value, 240);
			if (text) out[normalizedKey] = text;
		}
	}
	return out;
}

export async function ensureProductAnalyticsSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists product_analytics_event (
			id bigserial primary key,
			user_id uuid references app_user(id) on delete set null,
			event_name text not null,
			event_group text not null default '',
			route text not null default '',
			source text not null default '',
			subject_type text not null default '',
			subject_id text not null default '',
			query text not null default '',
			result_count int not null default 0,
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_product_analytics_event_name_created on product_analytics_event(event_name, created_at desc)`;
	await sql`create index if not exists idx_product_analytics_event_group_created on product_analytics_event(event_group, created_at desc)`;
	await sql`create index if not exists idx_product_analytics_event_user_created on product_analytics_event(user_id, created_at desc)`;
	await sql`create index if not exists idx_product_analytics_event_query_created on product_analytics_event(query, created_at desc)`;
	await sql`create index if not exists idx_product_analytics_event_source_created on product_analytics_event(source, created_at desc)`;
}

export async function recordProductAnalyticsEvent(
	sql: NeonQueryFunction<false, false>,
	input: ProductAnalyticsEventInput
) {
	const eventName = normalizeEventName(input.eventName);
	if (!eventName) return false;
	await ensureProductAnalyticsSchema(sql);
	const eventGroup = normalizeEventName(input.eventGroup || eventName.split("_")[0] || "general");
	const userId = normalizeText(input.userId, 80);
	await sql`
		insert into product_analytics_event (
			user_id,
			event_name,
			event_group,
			route,
			source,
			subject_type,
			subject_id,
			query,
			result_count,
			metadata
		)
		values (
			${userId ? userId : null}::uuid,
			${eventName},
			${eventGroup},
			${normalizeText(input.route, 180)},
			${normalizeText(input.source, 120)},
			${normalizeText(input.subjectType, 80)},
			${normalizeText(input.subjectId, 120)},
			${normalizeText(input.query, 240).toLowerCase()},
			${normalizeCount(input.resultCount)},
			${JSON.stringify(normalizeMetadata(input.metadata))}::jsonb
		)
	`;
	return true;
}

export async function recordProductAnalyticsEventSafe(
	sql: NeonQueryFunction<false, false>,
	input: ProductAnalyticsEventInput
) {
	try {
		return await recordProductAnalyticsEvent(sql, input);
	} catch (error) {
		if (import.meta.env.DEV) {
			console.warn("[product.analytics.failed]", error instanceof Error ? error.message : error);
		}
		return false;
	}
}

async function loadTopRows(
	sql: NeonQueryFunction<false, false>,
	condition: ReturnType<typeof sql>,
	labelColumn: ReturnType<typeof sql>,
	limit = 8
): Promise<AnalyticsTableRow[]> {
	const rows = await sql<Array<{ label: string; current_count: number; previous_count: number }>>`
		with current_period as (
			select ${labelColumn} as label, count(*)::int as count
			from product_analytics_event
			where created_at >= now() - interval '30 days'
				and ${condition}
			group by 1
		),
		previous_period as (
			select ${labelColumn} as label, count(*)::int as count
			from product_analytics_event
			where created_at >= now() - interval '60 days'
				and created_at < now() - interval '30 days'
				and ${condition}
			group by 1
		)
		select
			c.label,
			c.count as current_count,
			coalesce(p.count, 0)::int as previous_count
		from current_period c
		left join previous_period p on p.label = c.label
		where trim(c.label) <> ''
		order by c.count desc, c.label asc
		limit ${Math.min(20, Math.max(1, limit))}
	`;
	return rows.map((row) => ({
		label: normalizeText(row.label, 240),
		value: toNumber(row.current_count),
		trend: toNumber(row.current_count) - toNumber(row.previous_count)
	}));
}

async function loadAdminProductAnalyticsUncached(sql: NeonQueryFunction<false, false>): Promise<AdminProductAnalytics> {
	await ensureAdminSupportSchema(sql);
	await ensureReadingJournalSchema(sql);
	await ensureRecommendationSchema(sql);
	await ensureProductAnalyticsSchema(sql);

	const summaryRows = await sql<Array<Record<string, number>>>`
		with active_events as (
			select user_id, created_at from product_analytics_event where user_id is not null
			union all select user_id, updated_at as created_at from user_book
			union all select user_id, created_at from user_activity
			union all select user_id, recorded_at as created_at from user_reading_progress_event
			union all select user_id, created_at from reading_journal_note
			union all select user_id, created_at from user_activity_comment
		)
		select
			(select count(*)::int from app_user where created_at >= date_trunc('day', now())) as new_users_today,
			(select count(*)::int from app_user where created_at >= now() - interval '7 days') as new_users_week,
			(select count(distinct ae.user_id)::int from active_events ae join app_user au on au.id = ae.user_id where ae.created_at >= now() - interval '7 days' and au.created_at < now() - interval '7 days') as returning_users,
			(select count(distinct user_id)::int from active_events where created_at >= date_trunc('day', now())) as daily_active_users,
			(select count(distinct user_id)::int from active_events where created_at >= now() - interval '7 days') as weekly_active_users,
			(select count(*)::int from user_book where first_added_at >= now() - interval '7 days') as books_added,
			(select count(*)::int from user_book where status = 'reading' and updated_at >= now() - interval '7 days') as books_started,
			(select count(*)::int from user_book where status = 'finished' and updated_at >= now() - interval '7 days') as books_finished,
			(select count(*)::int from user_reading_progress_event where recorded_at >= now() - interval '7 days') as progress_updates,
			(select count(*)::int from app_user where coalesce(profile_data->>'readingGoal', '') <> '' and updated_at >= now() - interval '7 days') as reading_goals_created,
			(select count(*)::int from reading_journal_note where created_at >= now() - interval '7 days') as journal_entries,
			(select count(*)::int from user_book where char_length(trim(coalesce(finished_reflection, ''))) > 0 and review_updated_at >= now() - interval '7 days') as reviews,
			(select count(*)::int from user_activity_comment where created_at >= now() - interval '7 days') as comments,
			(select count(*)::int from user_follow where created_at >= now() - interval '7 days') as new_follows,
			(select count(*)::int from user_activity_like where created_at >= now() - interval '7 days') as likes,
			(select count(*)::int from user_recommendation_feedback where updated_at >= now() - interval '7 days') as recommendation_feedback,
			(select count(*)::int from product_analytics_event where event_name = 'search_performed' and created_at >= now() - interval '30 days') as searches_30d,
			(select count(*)::int from product_analytics_event where event_name = 'search_performed' and result_count = 0 and created_at >= now() - interval '30 days') as no_result_searches_30d,
			(select count(*)::int from product_analytics_event where event_name = 'recommendation_impression' and created_at >= now() - interval '30 days') as recommendation_impressions_30d,
			(select count(*)::int from product_analytics_event where event_name = 'recommendation_click' and created_at >= now() - interval '30 days') as recommendation_clicks_30d,
			(select count(*)::int from product_analytics_event where event_name = 'recommendation_feedback' and source = 'interesting' and created_at >= now() - interval '30 days') as recommendation_interesting_30d,
			(select count(*)::int from product_analytics_event where event_name = 'recommendation_feedback' and source = 'not_interested' and created_at >= now() - interval '30 days') as recommendation_hidden_30d,
			(select count(*)::int from product_analytics_event where event_name = 'recommendation_add_to_shelf' and created_at >= now() - interval '30 days') as recommendation_add_to_shelf_30d,
			(select count(*)::int from product_analytics_event where event_name = 'page_view' and route = '/' and created_at >= now() - interval '30 days') as visited_home,
			(select count(*)::int from app_user where created_at >= now() - interval '30 days') as created_accounts,
			(select count(distinct user_id)::int from user_book where first_added_at >= now() - interval '30 days') as added_first_book,
			(select count(distinct user_id)::int from user_reading_progress_event where recorded_at >= now() - interval '30 days') as updated_progress,
			(select count(distinct user_id)::int from user_book where status = 'finished' and updated_at >= now() - interval '30 days') as finished_book,
			(select count(distinct user_id)::int from user_book where char_length(trim(coalesce(finished_reflection, ''))) > 0 and review_updated_at >= now() - interval '30 days') as reviewed,
			(select count(distinct user_id)::int from reading_journal_note where created_at >= now() - interval '30 days') as journaled,
			(select count(distinct ae.user_id)::int from active_events ae join app_user au on au.id = ae.user_id where au.created_at >= now() - interval '60 days' and ae.created_at >= au.created_at + interval '1 day') as returned_next_day
			,(select count(distinct user_id)::int from reading_journal_note where created_at >= now() - interval '30 days') as feature_journal_usage
			,(select count(*)::int from product_analytics_event where event_name = 'feature_view' and source = 'My Reading Life' and created_at >= now() - interval '30 days') as feature_reading_life_usage
			,(select count(*)::int from product_analytics_event where event_name = 'feature_view' and source = 'Discover' and created_at >= now() - interval '30 days') as feature_discover_usage
			,(select count(*)::int from product_analytics_event where event_name in ('recommendation_impression', 'recommendation_click', 'recommendation_feedback', 'recommendation_add_to_shelf') and created_at >= now() - interval '30 days') as feature_recommendations_usage
			,(select count(*)::int from product_analytics_event where event_name = 'feature_view' and source = 'Series' and created_at >= now() - interval '30 days') as feature_series_usage
			,(select count(*)::int from product_analytics_event where event_name = 'feature_view' and source = 'Collections' and created_at >= now() - interval '30 days') as feature_collections_usage
			,(select count(*)::int from app_user where updated_at >= now() - interval '30 days' and (
				coalesce(profile_data->>'name', '') <> ''
				or coalesce(profile_data->>'blurb', '') <> ''
				or coalesce(profile_data->>'favoriteBook', '') <> ''
				or coalesce(profile_data->>'favoriteAuthor', '') <> ''
				or coalesce(profile_data->>'location', '') <> ''
			)) as feature_profile_customization
			,(select count(*)::int
				from app_user au
				where nullif(regexp_replace(coalesce(au.profile_data->>'readingGoal', ''), '[^0-9]', '', 'g'), '')::int > 0
					and (
						select count(*)::int
						from user_book ub
						where ub.user_id = au.id
							and ub.status = 'finished'
							and ub.finished_date >= date_trunc('year', now())::date
					) >= nullif(regexp_replace(coalesce(au.profile_data->>'readingGoal', ''), '[^0-9]', '', 'g'), '')::int
			) as feature_goal_completion
	`;
	const summary = summaryRows[0] || {};
	const searches30d = toNumber(summary.searches_30d);
	const impressions30d = toNumber(summary.recommendation_impressions_30d);
	const clicks30d = toNumber(summary.recommendation_clicks_30d);
	const visitedHome = toNumber(summary.visited_home);

	const [
		topBooks,
		topAuthors,
		topGenres,
		noResultQueries,
		topSources
	] = await Promise.all([
		loadTopRows(sql, sql`event_name = 'search_performed' and subject_type = 'book'`, sql`query`),
		loadTopRows(sql, sql`event_name = 'search_performed' and subject_type = 'author'`, sql`query`),
		loadTopRows(sql, sql`event_name = 'search_performed' and subject_type = 'genre'`, sql`query`),
		loadTopRows(sql, sql`event_name = 'search_performed' and result_count = 0`, sql`query`),
		loadTopRows(sql, sql`event_name in ('recommendation_impression', 'recommendation_click', 'recommendation_add_to_shelf')`, sql`coalesce(nullif(source, ''), 'unknown')`)
	]);

	const funnelRaw = [
		{ label: "Visited homepage", value: visitedHome },
		{ label: "Created account", value: toNumber(summary.created_accounts) },
		{ label: "Added first book", value: toNumber(summary.added_first_book) },
		{ label: "Updated progress", value: toNumber(summary.updated_progress) },
		{ label: "Finished book", value: toNumber(summary.finished_book) },
		{ label: "Reviewed", value: toNumber(summary.reviewed) },
		{ label: "Journal entry", value: toNumber(summary.journaled) },
		{ label: "Returned next day", value: toNumber(summary.returned_next_day) }
	];
	const funnelBase = Math.max(1, funnelRaw[0]?.value || funnelRaw[1]?.value || 0);

	return {
		generatedAt: new Date().toISOString(),
		growth: [
			{ label: "New users today", value: toNumber(summary.new_users_today) },
			{ label: "New users this week", value: toNumber(summary.new_users_week) },
			{ label: "Returning users", value: toNumber(summary.returning_users), helper: "Active this week and joined earlier." },
			{ label: "Daily Active Users", value: toNumber(summary.daily_active_users) },
			{ label: "Weekly Active Users", value: toNumber(summary.weekly_active_users) }
		],
		reading: [
			{ label: "Books added", value: toNumber(summary.books_added) },
			{ label: "Books started", value: toNumber(summary.books_started) },
			{ label: "Books finished", value: toNumber(summary.books_finished) },
			{ label: "Progress updates", value: toNumber(summary.progress_updates) },
			{ label: "Reading goals created", value: toNumber(summary.reading_goals_created) },
			{ label: "Journal entries", value: toNumber(summary.journal_entries) },
			{ label: "Reviews", value: toNumber(summary.reviews) },
			{ label: "Comments", value: toNumber(summary.comments) }
		],
		community: [
			{ label: "New follows", value: toNumber(summary.new_follows) },
			{ label: "Likes", value: toNumber(summary.likes) },
			{ label: "Recommendation feedback", value: toNumber(summary.recommendation_feedback) }
		],
		search: {
			totalSearches30d: searches30d,
			noResultSearches30d: toNumber(summary.no_result_searches_30d),
			noResultRate30d: toPercent(toNumber(summary.no_result_searches_30d), searches30d),
			topBooks,
			topAuthors,
			topGenres,
			noResultQueries
		},
		discovery: {
			impressions30d,
			clicks30d,
			interesting30d: toNumber(summary.recommendation_interesting_30d),
			hidden30d: toNumber(summary.recommendation_hidden_30d),
			addToShelf30d: toNumber(summary.recommendation_add_to_shelf_30d),
			ctr30d: toPercent(clicks30d, impressions30d),
			topSources
		},
		funnel: funnelRaw.map((row) => ({
			...row,
			percent: toPercent(row.value, funnelBase)
		})),
		featureAdoption
			: [
				{ label: "Reading Journal usage", value: toNumber(summary.feature_journal_usage), trend: 0 },
				{ label: "Reading Life usage", value: toNumber(summary.feature_reading_life_usage), trend: 0 },
				{ label: "Discover usage", value: toNumber(summary.feature_discover_usage), trend: 0 },
				{ label: "Recommendations", value: toNumber(summary.feature_recommendations_usage), trend: 0 },
				{ label: "Series", value: toNumber(summary.feature_series_usage), trend: 0 },
				{ label: "Collections", value: toNumber(summary.feature_collections_usage), trend: 0 },
				{ label: "Profile customization", value: toNumber(summary.feature_profile_customization), trend: 0 },
				{ label: "Goal completion", value: toNumber(summary.feature_goal_completion), trend: 0 }
			].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
	};
}

export async function loadAdminProductAnalytics(sql: NeonQueryFunction<false, false>) {
	return withRuntimeCache("admin:product-analytics:v1", 60_000, () => loadAdminProductAnalyticsUncached(sql));
}

export function classifySearchAnalyticsSubject(input: {
	query: string;
	results: Array<{ title?: string; authors?: string[]; categories?: string[] }>;
}) {
	const query = normalizeText(input.query, 240).toLowerCase();
	if (!query) return "";
	const normalized = query.replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
	const rows = Array.isArray(input.results) ? input.results.slice(0, 8) : [];
	if (rows.some((row) => normalizeText(row.title, 240).toLowerCase() === normalized)) return "book";
	if (rows.some((row) => (Array.isArray(row.authors) ? row.authors : []).some((author) => normalizeText(author, 180).toLowerCase() === normalized))) return "author";
	if (rows.some((row) => (Array.isArray(row.categories) ? row.categories : []).some((category) => normalizeText(category, 180).toLowerCase().includes(normalized)))) return "genre";
	if (rows.some((row) => normalizeText(row.title, 240).toLowerCase().includes(normalized))) return "book";
	if (rows.some((row) => (Array.isArray(row.authors) ? row.authors : []).some((author) => normalizeText(author, 180).toLowerCase().includes(normalized)))) return "author";
	return "book";
}
