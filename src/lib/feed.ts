import { getNeonSql } from "./neon";
import { resolvePrivacySettings } from "./privacy";
import {
	isEligiblePublicReaderAccount,
	isExcludedPublicReaderUsername,
	publicReaderAccountFilterSql,
	READER_SUGGESTIONS_EMPTY_MESSAGE
} from "./publicReaderPolicy";

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeProfileText(value: unknown, maxLength: number) {
	return normalizeText(value).slice(0, maxLength);
}

function normalizeAvatar(value: unknown) {
	const avatar = normalizeText(value).slice(0, 500000);
	return avatar.startsWith("data:image/") || /^https?:\/\//i.test(avatar) ? avatar : "";
}

export {
	isEligiblePublicReaderAccount,
	isExcludedPublicReaderUsername,
	READER_SUGGESTIONS_EMPTY_MESSAGE
};

function normalizeProfilePayload(input: unknown) {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	return {
		avatar: normalizeAvatar(source.avatar),
		name: normalizeProfileText(source.name, 80),
		location: normalizeProfileText(source.location, 80),
		readingGoal: normalizeProfileText(source.readingGoal, 80),
		favoriteBook: normalizeProfileText(source.favoriteBook, 120),
		favoriteAuthor: normalizeProfileText(source.favoriteAuthor, 120),
		blurb: normalizeProfileText(source.blurb, 400)
	};
}

export type FeedActivityItem = {
	id: number;
	actorUserId: string;
	actorUsername: string;
	actorName: string;
	bookId: number;
	title: string;
	author: string;
	authorId: number;
	thumbnail: string;
	language: string;
	isbn10: string;
	isbn13: string;
	description: string;
	publishedLabel: string;
	pageCount: number;
	eventType: string;
	actorRating: number;
	averageRating: number;
	updatedAt: string;
	finishedReflection: string;
	likeCount: number;
	viewerLiked: boolean;
	commentCount: number;
};

export type PublicReaderSuggestion = {
	userId: string;
	username: string;
	name: string;
	avatar: string;
	location: string;
	readingGoal: string;
	favoriteBook: string;
	favoriteAuthor: string;
	blurb: string;
};

export type FollowingReader = PublicReaderSuggestion & {
	followedAt: string;
};

export function activityHeading(eventType: string) {
	const type = normalizeText(eventType).toLowerCase();
	if (type === "reading") return { prefix: "Started Reading", shelf: "" };
	if (type === "finished") return { prefix: "Finished Reading", shelf: "" };
	if (type === "want_to_read") return { prefix: "Added to", shelf: "Want to Read" };
	return { prefix: "Added to", shelf: "Shelf" };
}

export function renderRatingStars(value: number) {
	const clamped = Math.max(0, Math.min(5, Number(value) || 0));
	return Array.from({ length: 5 }, (_, index) => (index < clamped ? "★" : "☆")).join("");
}

export function formatActivityDate(value: string) {
	const parsed = new Date(normalizeText(value));
	if (!Number.isFinite(parsed.getTime())) return "";
	return parsed.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric"
	});
}

let followSchemaReady: Promise<void> | null = null;
let feedInteractionSchemaReady: Promise<void> | null = null;

async function ensureFollowSchema(sql = getNeonSql()) {
	if (!followSchemaReady) {
		followSchemaReady = sql`
			create table if not exists user_follow (
				follower_user_id uuid not null references app_user(id) on delete cascade,
				followed_user_id uuid not null references app_user(id) on delete cascade,
				created_at timestamptz not null default now(),
				primary key (follower_user_id, followed_user_id),
				check (follower_user_id <> followed_user_id)
			)
		`.then(() => undefined);
	}
	try {
		await followSchemaReady;
	} catch (error) {
		followSchemaReady = null;
		throw error;
	}
}

async function ensureFeedInteractionSchema(sql = getNeonSql()) {
	if (!feedInteractionSchemaReady) {
		feedInteractionSchemaReady = (async () => {
			await sql`
				create table if not exists user_activity_like (
					activity_id bigint not null references user_activity(id) on delete cascade,
					user_id uuid not null references app_user(id) on delete cascade,
					created_at timestamptz not null default now(),
					primary key (activity_id, user_id)
				)
			`;
			await Promise.all([
				sql`create index if not exists idx_user_activity_like_activity on user_activity_like(activity_id)`,
				sql`create index if not exists idx_user_activity_like_user on user_activity_like(user_id, created_at desc)`,
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
			]);
			await Promise.all([
				sql`create index if not exists idx_user_activity_comment_activity on user_activity_comment(activity_id, created_at asc, id asc)`,
				sql`create index if not exists idx_user_activity_comment_user on user_activity_comment(user_id, created_at desc)`
			]);
		})();
	}
	try {
		await feedInteractionSchemaReady;
	} catch (error) {
		feedInteractionSchemaReady = null;
		throw error;
	}
}

export async function resolveFollowingCount(viewerUserId: string) {
	const sql = getNeonSql();
	await ensureFollowSchema(sql);
	const rows = await sql<Array<{ count: number }>>`
		select count(*)::int as count
		from user_follow uf
		join app_user au on au.id = uf.followed_user_id
		where uf.follower_user_id = ${viewerUserId}::uuid
			${publicReaderAccountFilterSql(sql)}
	`;
	return Number(rows[0]?.count || 0);
}

export async function resolveFollowingFeedActivity(viewerUserId: string, limit = 50) {
	const sql = getNeonSql();
	await Promise.all([
		ensureFollowSchema(sql),
		ensureFeedInteractionSchema(sql)
	]);
	const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
	const rows = await sql<Array<{
		id: number;
		actor_user_id: string;
		username: string | null;
		profile_data: unknown;
		book_id: number;
		title: string;
		primary_author: string;
		author_id: number | null;
		cover_url: string;
		language: string;
		isbn10: string;
		isbn13: string;
		synopsis: string;
		published_year: number | null;
		page_count: number | null;
		event_type: string;
		rating: number | null;
		finished_reflection: string | null;
		average_rating: number | null;
		created_at: string;
		like_count: number;
		viewer_liked: boolean;
		comment_count: number;
	}>>`
		select
			ua.id,
			ua.user_id::text as actor_user_id,
			au.username,
			au.profile_data,
			b.id as book_id,
			b.title,
			b.primary_author,
			b.author_id,
			b.cover_url,
			b.language,
			b.isbn10,
			b.isbn13,
			b.synopsis,
			coalesce(
				b.published_year,
				bmeta.published_year
			) as published_year,
			coalesce(
				nullif(b.page_count, 0),
				nullif(bmeta.page_count, 0)
			) as page_count,
			ua.event_type,
			coalesce(ub.rating, ua.rating) as rating,
			coalesce(ub.finished_reflection, '') as finished_reflection,
			coalesce(ra.average_rating, 0) as average_rating,
			coalesce(al.like_count, 0)::int as like_count,
			coalesce(al.viewer_liked, false) as viewer_liked,
			coalesce(ac.comment_count, 0)::int as comment_count,
			ua.created_at::text as created_at
		from user_follow uf
		join user_activity ua on ua.user_id = uf.followed_user_id
		join app_user au on au.id = ua.user_id
		join book b on b.id = ua.book_id
		left join user_book ub on ub.user_id = ua.user_id and ub.book_id = ua.book_id
		left join lateral (
			select
				max(b2.published_year) filter (where b2.published_year is not null and b2.published_year > 0) as published_year,
				max(b2.page_count) filter (where b2.page_count is not null and b2.page_count > 0) as page_count
			from book b2
			where b2.id <> b.id
				and (
					(nullif(trim(coalesce(b.isbn13, '')), '') is not null and b2.isbn13 = b.isbn13)
					or (nullif(trim(coalesce(b.isbn10, '')), '') is not null and b2.isbn10 = b.isbn10)
					or (
						lower(trim(coalesce(b2.title, ''))) = lower(trim(coalesce(b.title, '')))
						and lower(trim(coalesce(b2.primary_author, ''))) = lower(trim(coalesce(b.primary_author, '')))
					)
				)
		) bmeta on true
		left join lateral (
			select round(avg(ub3.rating)::numeric, 2) as average_rating
			from user_book ub3
			where ub3.book_id = b.id
				and ub3.rating is not null
		) ra on true
		left join lateral (
			select
				count(*)::int as like_count,
				bool_or(ual.user_id = ${viewerUserId}::uuid) as viewer_liked
			from user_activity_like ual
			where ual.activity_id = ua.id
		) al on true
		left join lateral (
			select count(*)::int as comment_count
			from user_activity_comment uac
			where uac.activity_id = ua.id
		) ac on true
		where uf.follower_user_id = ${viewerUserId}::uuid
			and ua.event_type in ('want_to_read', 'reading', 'finished')
			${publicReaderAccountFilterSql(sql, { requireActivitySharing: true })}
		order by ua.created_at desc, ua.id desc
		limit ${safeLimit}
	`;

	return rows.map((row) => {
		const profile = normalizeProfilePayload(row.profile_data);
		const username = normalizeProfileText(row.username, 40);
		return {
			id: Number(row.id || 0),
			actorUserId: normalizeText(row.actor_user_id),
			actorUsername: username,
			actorName: username || profile.name || "A reader",
			bookId: Number(row.book_id || 0),
			title: normalizeText(row.title),
			author: normalizeText(row.primary_author),
			authorId: Math.max(0, Number(row.author_id || 0) || 0),
			thumbnail: normalizeText(row.cover_url),
			language: normalizeText(row.language),
			isbn10: normalizeText(row.isbn10),
			isbn13: normalizeText(row.isbn13),
			description: normalizeText(row.synopsis),
			publishedLabel: Number(row.published_year || 0) > 0 ? String(Number(row.published_year || 0)) : "",
			pageCount: Math.max(0, Number(row.page_count || 0) || 0),
			eventType: normalizeText(row.event_type),
			actorRating: Math.max(0, Math.min(5, Number(row.rating || 0) || 0)),
			finishedReflection: normalizeText(row.finished_reflection),
			averageRating: Math.max(0, Math.min(5, Number(row.average_rating || 0) || 0)),
			likeCount: Math.max(0, Number(row.like_count || 0) || 0),
			viewerLiked: !!row.viewer_liked,
			commentCount: Math.max(0, Number(row.comment_count || 0) || 0),
			updatedAt: normalizeText(row.created_at)
		};
	});
}

export async function resolveViewerStatusByBookId(viewerUserId: string, bookIds: number[]) {
	const validBookIds = Array.from(new Set(bookIds.map((value) => Number(value || 0)).filter((value) => value > 0)));
	if (!viewerUserId || validBookIds.length === 0) return new Map<number, "want_to_read" | "reading" | "finished">();
	const sql = getNeonSql();
	const rows = await sql<Array<{ book_id: number; status: "want_to_read" | "reading" | "finished" }>>`
		select book_id, status
		from user_book
		where user_id = ${viewerUserId}::uuid
			and book_id = any(${validBookIds}::bigint[])
	`;
	return new Map(rows.map((row) => [Number(row.book_id || 0), row.status]));
}

export async function resolvePublicReaderSuggestions(viewerUserId: string, limit = 30) {
	const sql = getNeonSql();
	const safeLimit = Math.min(60, Math.max(1, Number(limit) || 30));
	const rows = await sql<Array<{ id: string; username: string | null; profile_data: unknown }>>`
		select au.id::text as id, au.username, au.profile_data
		from app_user au
		where au.id <> ${viewerUserId}::uuid
			${publicReaderAccountFilterSql(sql, { requireDiscovery: true })}
			and not exists (
				select 1
				from user_follow uf
				where uf.follower_user_id = ${viewerUserId}::uuid
					and uf.followed_user_id = au.id
			)
		order by au.created_at desc
		limit ${safeLimit}
	`;

	return rows.map((row) => {
		const profile = normalizeProfilePayload(row.profile_data);
		const privacy = resolvePrivacySettings(row.profile_data);
		if (!privacy.shareLocation) profile.location = "";
		return {
			userId: normalizeText(row.id),
			username: normalizeProfileText(row.username, 40),
			name: profile.name,
			avatar: profile.avatar,
			location: profile.location,
			readingGoal: profile.readingGoal,
			favoriteBook: profile.favoriteBook,
			favoriteAuthor: profile.favoriteAuthor,
			blurb: profile.blurb
		};
	}).filter((item) => (
		item.username
		&& item.userId !== viewerUserId
		&& !isExcludedPublicReaderUsername(item.username)
	)).filter((item) => isEligiblePublicReaderAccount({
		username: item.username,
		profileData: rows.find((row) => normalizeText(row.id) === item.userId)?.profile_data,
		requireDiscovery: true
	}));
}

export async function resolveFollowingReaders(viewerUserId: string, limit = 60) {
	const sql = getNeonSql();
	const safeLimit = Math.min(100, Math.max(1, Number(limit) || 60));
	const rows = await sql<Array<{
		id: string;
		username: string | null;
		profile_data: unknown;
		followed_at: string;
	}>>`
		select
			au.id::text as id,
			au.username,
			au.profile_data,
			uf.created_at::text as followed_at
		from user_follow uf
		join app_user au on au.id = uf.followed_user_id
		where uf.follower_user_id = ${viewerUserId}::uuid
			${publicReaderAccountFilterSql(sql)}
		order by uf.created_at desc
		limit ${safeLimit}
	`;

	return rows.map((row) => {
		const profile = normalizeProfilePayload(row.profile_data);
		const privacy = resolvePrivacySettings(row.profile_data);
		if (!privacy.shareLocation) profile.location = "";
		return {
			userId: normalizeText(row.id),
			username: normalizeProfileText(row.username, 40),
			name: profile.name,
			avatar: profile.avatar,
			location: profile.location,
			readingGoal: profile.readingGoal,
			favoriteBook: profile.favoriteBook,
			favoriteAuthor: profile.favoriteAuthor,
			blurb: profile.blurb,
			followedAt: normalizeText(row.followed_at)
		};
	}).filter((item) => isEligiblePublicReaderAccount({
		username: item.username,
		profileData: rows.find((row) => normalizeText(row.id) === item.userId)?.profile_data
	}));
}
