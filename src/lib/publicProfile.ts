import { getNeonSql } from "./neon";
import { resolvePrivacySettings, resolveViewerProfileAccess } from "./privacy";
import {
	isEligiblePublicReaderAccount,
	publicReaderAccountFilterSql
} from "./publicReaderPolicy";

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeProfileText(value: unknown, maxLength: number) {
	return normalizeText(value).slice(0, maxLength);
}

function normalizeBirthYear(value: unknown) {
	const year = Number(String(value ?? "").trim());
	if (!Number.isFinite(year)) return "";
	const rounded = Math.trunc(year);
	if (rounded < 1900 || rounded > 2100) return "";
	return String(rounded);
}

function normalizeProfilePayload(input: unknown) {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	const genres = Array.isArray(source.genres)
		? source.genres.map((item) => normalizeProfileText(item, 40)).filter(Boolean).slice(0, 20)
		: [];
	const avatar = normalizeText(source.avatar).slice(0, 500000);
	return {
		avatar: avatar.startsWith("data:image/") || /^https?:\/\//i.test(avatar) ? avatar : "",
		name: normalizeProfileText(source.name, 80),
		location: normalizeProfileText(source.location, 80),
		birthYear: normalizeBirthYear(source.birthYear),
		readingGoal: normalizeProfileText(source.readingGoal, 80),
		favoriteBook: normalizeProfileText(source.favoriteBook, 120),
		favoriteAuthor: normalizeProfileText(source.favoriteAuthor, 120),
		blurb: normalizeProfileText(source.blurb, 400),
		genres
	};
}

export type PublicProfileBundle = {
	status: "not_found" | "private" | "ok";
	profile: null | {
		username: string;
		avatar: string;
		name: string;
		location: string;
		birthYear: string;
		readingGoal: string;
		favoriteBook: string;
		favoriteAuthor: string;
		blurb: string;
		genres: string[];
	};
	canViewActivity: boolean;
	followersCount: number;
	followingCount: number;
	isViewerFollowing: boolean;
	allowFollowRequests: boolean;
	targetUserId: string;
	profileData: Record<string, unknown>;
};

export async function resolvePublicProfileBundle(input: {
	username: string;
	viewerUserId: string;
	onTiming?: (name: string, durationMs: number, startedAt?: number) => void;
}): Promise<PublicProfileBundle> {
	const time = async <T>(name: string, work: () => Promise<T>) => {
		const startedAt = performance.now();
		try {
			return await work();
		} finally {
			input.onTiming?.(name, performance.now() - startedAt, startedAt);
		}
	};
	const requestedUsername = normalizeText(input.username).toLowerCase();
	if (!requestedUsername) {
		return {
			status: "not_found",
			profile: null,
			canViewActivity: false,
			followersCount: 0,
			followingCount: 0,
			isViewerFollowing: false,
			allowFollowRequests: true,
			targetUserId: "",
			profileData: {}
		};
	}

	const sql = getNeonSql();
	const users = await time("profile identity", () => sql<Array<{ id: string; username: string | null; profile_data: unknown }>>`
			select id::text as id, username, profile_data
			from app_user
			where lower(coalesce(username, '')) = ${requestedUsername}
			limit 1
		`
	);
	const user = users[0];
	if (!user?.id) {
		return {
			status: "not_found",
			profile: null,
			canViewActivity: false,
			followersCount: 0,
			followingCount: 0,
			isViewerFollowing: false,
			allowFollowRequests: true,
			targetUserId: "",
			profileData: {}
		};
	}
	if (!isEligiblePublicReaderAccount({
		username: user.username,
		profileData: user.profile_data,
		requirePublicProfile: false
	})) {
		return {
			status: "not_found",
			profile: null,
			canViewActivity: false,
			followersCount: 0,
			followingCount: 0,
			isViewerFollowing: false,
			allowFollowRequests: true,
			targetUserId: "",
			profileData: {}
		};
	}

	let followersCount = 0;
	let followingCount = 0;
	let isViewerFollowing = false;
	try {
		const viewerUserId = normalizeText(input.viewerUserId) || "00000000-0000-0000-0000-000000000000";
		const [counts] = await time("follower/following counts", () => sql<Array<{
				followers_count: number;
				following_count: number;
				is_viewer_following: boolean;
			}>>`
				select
					(
						select count(*)::int
						from user_follow uf
						join app_user au on au.id = uf.follower_user_id
						where uf.followed_user_id = ${user.id}::uuid
							${publicReaderAccountFilterSql(sql)}
					) as followers_count,
					(
						select count(*)::int
						from user_follow uf
						join app_user au on au.id = uf.followed_user_id
						where uf.follower_user_id = ${user.id}::uuid
							${publicReaderAccountFilterSql(sql)}
					) as following_count,
					exists (
						select 1
						from user_follow uf
						where uf.follower_user_id = ${viewerUserId}::uuid
							and uf.followed_user_id = ${user.id}::uuid
					) as is_viewer_following
			`
		);
		followersCount = Number(counts?.followers_count || 0);
		followingCount = Number(counts?.following_count || 0);
		isViewerFollowing = !!counts?.is_viewer_following;
	} catch {
		followersCount = 0;
		followingCount = 0;
		isViewerFollowing = false;
	}

	const privacy = resolvePrivacySettings(user.profile_data);
	const access = resolveViewerProfileAccess({
		viewerUserId: normalizeText(input.viewerUserId),
		targetUserId: user.id,
		privacy
	});
	if (!access.canViewProfile) {
		return {
			status: "private",
			profile: null,
			canViewActivity: false,
			followersCount,
			followingCount,
			isViewerFollowing,
			allowFollowRequests: privacy.allowFollowRequests,
			targetUserId: user.id,
			profileData: user.profile_data && typeof user.profile_data === "object"
				? user.profile_data as Record<string, unknown>
				: {}
		};
	}

	const normalized = normalizeProfilePayload(user.profile_data);
	return {
		status: "ok",
		targetUserId: user.id,
		canViewActivity: access.canViewActivity,
		followersCount,
		followingCount,
		isViewerFollowing,
		allowFollowRequests: privacy.allowFollowRequests,
		profileData: user.profile_data && typeof user.profile_data === "object"
			? user.profile_data as Record<string, unknown>
			: {},
		profile: {
			...normalized,
			location: access.canViewLocation ? normalized.location : "",
			username: normalizeProfileText(user.username, 40)
		}
	};
}

export async function resolvePublicShelfSummary(targetUserId: string) {
	const sql = getNeonSql();
	const rows = await sql<Array<{ status: string; count: number }>>`
		select status, count(*)::int as count
		from user_book
		where user_id = ${targetUserId}::uuid
		group by status
	`;
	const summary = { wantToRead: 0, reading: 0, finished: 0, total: 0 };
	for (const row of rows) {
		const count = Number(row.count || 0);
		if (row.status === "want_to_read") summary.wantToRead = count;
		if (row.status === "reading") summary.reading = count;
		if (row.status === "finished") summary.finished = count;
	}
	summary.total = summary.wantToRead + summary.reading + summary.finished;
	return summary;
}

export async function resolvePublicRecentActivity(targetUserId: string, limit = 10, viewerUserId = "") {
	const sql = getNeonSql();
	const safeLimit = Math.min(25, Math.max(1, Number(limit) || 10));
	const rows = await sql<Array<{
		activity_id: number;
		book_id: number;
		title: string;
		primary_author: string;
		author_id: number | null;
		cover_url: string;
		language: string;
		isbn10: string;
		isbn13: string;
		synopsis: string;
		event_type: string;
		created_at: string;
		rating: number | null;
		finished_reflection: string | null;
		genres: string[];
	}>>`
		select
			ua.book_id,
			ua.id as activity_id,
			b.title,
			b.primary_author,
			b.author_id,
			b.cover_url,
			b.language,
			b.isbn10,
			b.isbn13,
			b.synopsis,
			ua.event_type,
			ua.created_at::text as created_at
			,ub.rating
			,coalesce(ub.finished_reflection, '') as finished_reflection
			,(
				select coalesce(array_agg(distinct bg.genre_name order by bg.genre_name) filter (where trim(coalesce(bg.genre_name, '')) <> ''), '{}')
				from book_genre bg
				where bg.book_id = b.id
			) as genres
		from user_activity ua
		join book b on b.id = ua.book_id
		left join user_book ub on ub.user_id = ua.user_id and ub.book_id = ua.book_id
		where ua.user_id = ${targetUserId}::uuid
			and ua.event_type in ('want_to_read', 'reading', 'finished', 'rating')
		order by ua.created_at desc, ua.id desc
		limit ${safeLimit * 4}
	`;

	const byBook = new Map<number, {
		activityId: number;
		bookId: number;
		title: string;
		author: string;
		authorId: number;
		status: string;
		eventType: string;
		thumbnail: string;
		language: string;
		isbn10: string;
		isbn13: string;
		description: string;
		updatedAt: string;
		rating: number;
		finishedReflection: string;
		genres: string[];
	}>();

	for (const row of rows) {
		const bookId = Number(row.book_id || 0);
		if (!bookId || byBook.has(bookId)) continue;
		byBook.set(bookId, {
			activityId: Math.max(0, Number(row.activity_id || 0)),
			bookId,
			title: normalizeText(row.title),
			author: normalizeText(row.primary_author),
			authorId: Math.max(0, Number(row.author_id || 0) || 0),
			status: normalizeText(row.event_type).replaceAll("_", " "),
			eventType: normalizeText(row.event_type),
			thumbnail: normalizeText(row.cover_url),
			language: normalizeText(row.language),
			isbn10: normalizeText(row.isbn10),
			isbn13: normalizeText(row.isbn13),
			description: normalizeText(row.synopsis),
			updatedAt: row.created_at,
			rating: Math.max(0, Math.min(5, Number(row.rating || 0) || 0)),
			finishedReflection: normalizeText(row.finished_reflection),
			genres: Array.isArray(row.genres) ? row.genres.map(normalizeText).filter(Boolean) : []
		});
		if (byBook.size >= safeLimit) break;
	}

	const deduped = Array.from(byBook.values());
	if (deduped.length === 0) return deduped;

	const activityIds = deduped.map((item) => item.activityId).filter((id) => id > 0);
	const likeByActivityId = new Map<number, { likeCount: number; viewerLiked: boolean }>();
	if (activityIds.length > 0) {
		try {
			const likeRows = await sql<Array<{ activity_id: number; like_count: number; viewer_liked: boolean }>>`
				select
					ua.id as activity_id,
					coalesce(count(ual.user_id), 0)::int as like_count,
					coalesce(bool_or(ual.user_id = ${viewerUserId || "00000000-0000-0000-0000-000000000000"}::uuid), false) as viewer_liked
				from user_activity ua
				left join user_activity_like ual on ual.activity_id = ua.id
				where ua.id = any(${activityIds}::bigint[])
				group by ua.id
			`;
			for (const row of likeRows) {
				likeByActivityId.set(Math.max(0, Number(row.activity_id || 0)), {
					likeCount: Math.max(0, Number(row.like_count || 0)),
					viewerLiked: !!row.viewer_liked
				});
			}
		} catch {
			// Ignore social-like query failures in render path.
		}
	}

	return deduped.map((item) => ({
		...item,
		likeCount: likeByActivityId.get(item.activityId)?.likeCount || 0,
		viewerLiked: likeByActivityId.get(item.activityId)?.viewerLiked || false
	}));
}
