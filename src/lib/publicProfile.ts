import { getNeonSql } from "./neon";
import { resolvePrivacySettings, resolveViewerProfileAccess } from "./privacy";
import { canViewerSeeDemoTestUser, isDemoTestUsername } from "./demoVisibility";

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
};

export async function resolvePublicProfileBundle(input: {
	username: string;
	viewerUserId: string;
}): Promise<PublicProfileBundle> {
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
			targetUserId: ""
		};
	}

	const sql = getNeonSql();
	const users = await sql<Array<{ id: string; username: string | null; profile_data: unknown }>>`
		select id::text as id, username, profile_data
		from app_user
		where lower(coalesce(username, '')) = ${requestedUsername}
		limit 1
	`;
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
			targetUserId: ""
		};
	}
	if (isDemoTestUsername(user.username) && !(await canViewerSeeDemoTestUser(input.viewerUserId))) {
		return {
			status: "not_found",
			profile: null,
			canViewActivity: false,
			followersCount: 0,
			followingCount: 0,
			isViewerFollowing: false,
			allowFollowRequests: true,
			targetUserId: ""
		};
	}

	let followersCount = 0;
	let followingCount = 0;
	let isViewerFollowing = false;
	try {
		const [followersRows, followingRows, relationshipRows] = await Promise.all([
			sql<Array<{ count: number }>>`
				select count(*)::int as count
				from user_follow
				where followed_user_id = ${user.id}::uuid
			`,
			sql<Array<{ count: number }>>`
				select count(*)::int as count
				from user_follow
				where follower_user_id = ${user.id}::uuid
			`,
			input.viewerUserId
				? sql<Array<{ exists: number }>>`
					select 1::int as exists
					from user_follow
					where follower_user_id = ${input.viewerUserId}::uuid
						and followed_user_id = ${user.id}::uuid
					limit 1
				`
				: Promise.resolve([])
		]);
		followersCount = Number(followersRows[0]?.count || 0);
		followingCount = Number(followingRows[0]?.count || 0);
		isViewerFollowing = Number(relationshipRows[0]?.exists || 0) > 0;
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
			targetUserId: user.id
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
		from user_activity ua
		join book b on b.id = ua.book_id
		where ua.user_id = ${targetUserId}::uuid
			and ua.event_type in ('want_to_read', 'reading', 'finished')
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
			updatedAt: row.created_at
		});
		if (byBook.size >= safeLimit) break;
	}

	const deduped = Array.from(byBook.values());
	if (deduped.length === 0) return deduped;

	const ratingRows = await sql<Array<{ book_id: number; rating: number | null }>>`
		select book_id, rating
		from user_book
		where user_id = ${targetUserId}::uuid
			and book_id = any(${deduped.map((item) => item.bookId)}::bigint[])
	`;
	const ratingByBook = new Map<number, number>();
	for (const row of ratingRows) {
		const rating = Number(row.rating || 0);
		if (rating >= 1 && rating <= 5) ratingByBook.set(Number(row.book_id || 0), rating);
	}

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
		rating: ratingByBook.get(item.bookId) || 0,
		likeCount: likeByActivityId.get(item.activityId)?.likeCount || 0,
		viewerLiked: likeByActivityId.get(item.activityId)?.viewerLiked || false
	}));
}
