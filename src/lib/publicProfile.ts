import { getNeonSql } from "./neon";
import { resolvePrivacySettings, resolveViewerProfileAccess } from "./privacy";

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeProfileText(value: unknown, maxLength: number) {
	return normalizeText(value).slice(0, maxLength);
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
			targetUserId: ""
		};
	}

	const sql = getNeonSql();
	await sql`
		create table if not exists user_follow (
			follower_user_id uuid not null references app_user(id) on delete cascade,
			followed_user_id uuid not null references app_user(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (follower_user_id, followed_user_id),
			check (follower_user_id <> followed_user_id)
		)
	`;
	await sql`create index if not exists idx_user_follow_follower on user_follow(follower_user_id, created_at desc)`;
	await sql`create index if not exists idx_user_follow_followed on user_follow(followed_user_id, created_at desc)`;
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
			targetUserId: ""
		};
	}

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
	const followersCount = Number(followersRows[0]?.count || 0);
	const followingCount = Number(followingRows[0]?.count || 0);
	const isViewerFollowing = Number(relationshipRows[0]?.exists || 0) > 0;

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

export async function resolvePublicRecentActivity(targetUserId: string, limit = 10) {
	const sql = getNeonSql();
	const safeLimit = Math.min(25, Math.max(1, Number(limit) || 10));
	const rows = await sql<Array<{
		book_id: number;
		title: string;
		primary_author: string;
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
			b.title,
			b.primary_author,
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
		bookId: number;
		title: string;
		author: string;
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
			bookId,
			title: normalizeText(row.title),
			author: normalizeText(row.primary_author),
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

	return deduped.map((item) => ({
		...item,
		rating: ratingByBook.get(item.bookId) || 0
	}));
}
