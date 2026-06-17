import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getEncryptionKey } from "./auth";

export type AdminOverviewStats = {
	totalBooks: number;
	totalAuthors: number;
	totalUsers: number;
	totalShelfEntries: number;
	totalReviews: number;
	totalComments: number;
	totalCurrentlyReading: number;
	totalCompleted: number;
	newUsersThisWeek: number;
	newBooksThisWeek: number;
	reviewsThisWeek: number;
};

export type AdminUserSummary = {
	id: string;
	username: string;
	email: string;
	joinedAt: string;
	lastActivityAt: string;
	shelfEntryCount: number;
	reviewCount: number;
};

export type AdminUserDetail = AdminUserSummary & {
	wantToReadCount: number;
	currentlyReadingCount: number;
	completedCount: number;
	commentCount: number;
	followerCount: number;
	followingCount: number;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function toCount(value: unknown) {
	return Math.max(0, Number(value || 0) || 0);
}

export async function ensureAdminSupportSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists user_activity_like (
			activity_id bigint not null references user_activity(id) on delete cascade,
			user_id uuid not null references app_user(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (activity_id, user_id)
		)
	`;
	await sql`
		create table if not exists user_activity_comment (
			id bigserial primary key,
			activity_id bigint not null references user_activity(id) on delete cascade,
			user_id uuid not null references app_user(id) on delete cascade,
			body text not null default '',
			created_at timestamptz not null default now(),
			check (char_length(trim(body)) between 1 and 500)
		)
	`;
	await sql`
		create table if not exists user_notification (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			actor_user_id uuid not null references app_user(id) on delete cascade,
			activity_id bigint not null references user_activity(id) on delete cascade,
			type text not null check (type in ('activity_like', 'activity_comment')),
			created_at timestamptz not null default now(),
			read_at timestamptz null
		)
	`;
	await sql`
		create table if not exists user_follow (
			follower_user_id uuid not null references app_user(id) on delete cascade,
			followed_user_id uuid not null references app_user(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (follower_user_id, followed_user_id),
			check (follower_user_id <> followed_user_id)
		)
	`;
	await sql`
		create table if not exists user_reading_progress_event (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			from_page int not null default 0,
			to_page int not null default 0,
			page_delta int not null default 0,
			recorded_at timestamptz not null default now()
		)
	`;
	await sql`
		create table if not exists feedback_submission_event (
			id bigserial primary key,
			user_id uuid references app_user(id) on delete set null,
			ip_hash text not null default '',
			feedback_type text not null default 'general',
			created_at timestamptz not null default now()
		)
	`;
	await sql`
		create table if not exists account_email_change (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references app_user(id) on delete cascade,
			new_email_hash text not null,
			new_email_enc bytea not null,
			token_hash text not null unique,
			requested_ip text not null default '',
			user_agent text not null default '',
			expires_at timestamptz not null,
			used_at timestamptz,
			created_at timestamptz not null default now(),
			verified_at timestamptz
		)
	`;
}

export async function loadAdminOverviewStats(sql: NeonQueryFunction<false, false>): Promise<AdminOverviewStats> {
	await ensureAdminSupportSchema(sql);
	const rows = await sql<Array<{
		total_books: number;
		total_authors: number;
		total_users: number;
		total_shelf_entries: number;
		total_reviews: number;
		total_comments: number;
		total_currently_reading: number;
		total_completed: number;
		new_users_this_week: number;
		new_books_this_week: number;
		reviews_this_week: number;
	}>>`
		select
			(select count(*)::int from book) as total_books,
			(select count(*)::int from author) as total_authors,
			(select count(*)::int from app_user) as total_users,
			(select count(*)::int from user_book) as total_shelf_entries,
			(select count(*)::int from user_book where char_length(trim(coalesce(finished_reflection, ''))) > 0)::int as total_reviews,
			(select count(*)::int from user_activity_comment) as total_comments,
			(select count(*)::int from user_book where status = 'reading') as total_currently_reading,
			(select count(*)::int from user_book where status = 'finished') as total_completed,
			(select count(*)::int from app_user where created_at >= now() - interval '7 days') as new_users_this_week,
			(select count(*)::int from book where created_at >= now() - interval '7 days') as new_books_this_week,
			(select count(*)::int from user_book where char_length(trim(coalesce(finished_reflection, ''))) > 0 and updated_at >= now() - interval '7 days') as reviews_this_week
	`;
	const row = rows[0] || {};
	return {
		totalBooks: toCount(row.total_books),
		totalAuthors: toCount(row.total_authors),
		totalUsers: toCount(row.total_users),
		totalShelfEntries: toCount(row.total_shelf_entries),
		totalReviews: toCount(row.total_reviews),
		totalComments: toCount(row.total_comments),
		totalCurrentlyReading: toCount(row.total_currently_reading),
		totalCompleted: toCount(row.total_completed),
		newUsersThisWeek: toCount(row.new_users_this_week),
		newBooksThisWeek: toCount(row.new_books_this_week),
		reviewsThisWeek: toCount(row.reviews_this_week)
	};
}

export async function searchAdminUsers(sql: NeonQueryFunction<false, false>, query: string, limit = 50): Promise<AdminUserSummary[]> {
	await ensureAdminSupportSchema(sql);
	const encryptionKey = getEncryptionKey();
	const search = normalizeText(query).toLowerCase();
	const pattern = `%${search}%`;
	const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
	const rows = await sql<Array<{
		id: string;
		username: string | null;
		email: string | null;
		created_at: string | null;
		last_activity_at: string | null;
		shelf_entry_count: number;
		review_count: number;
	}>>`
		with users as (
			select
				au.id,
				au.username,
				coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as email,
				au.created_at
			from app_user au
		)
		select
			u.id::text as id,
			u.username,
			u.email,
			u.created_at::text as created_at,
			greatest(
				coalesce(max(ub.updated_at), 'epoch'::timestamptz),
				coalesce(max(ua.created_at), 'epoch'::timestamptz),
				coalesce(max(uac.created_at), 'epoch'::timestamptz)
			)::text as last_activity_at,
			count(distinct ub.book_id)::int as shelf_entry_count,
			count(distinct ub.book_id) filter (where char_length(trim(coalesce(ub.finished_reflection, ''))) > 0)::int as review_count
		from users u
		left join user_book ub on ub.user_id = u.id
		left join user_activity ua on ua.user_id = u.id
		left join user_activity_comment uac on uac.user_id = u.id
		where ${search} = ''
			or lower(coalesce(u.username, '')) like ${pattern}
			or lower(coalesce(u.email, '')) like ${pattern}
		group by u.id, u.username, u.email, u.created_at
		order by u.created_at desc nulls last, u.id desc
		limit ${safeLimit}
	`;
	return rows.map((row) => ({
		id: normalizeText(row.id),
		username: normalizeText(row.username),
		email: normalizeText(row.email),
		joinedAt: normalizeText(row.created_at),
		lastActivityAt: normalizeText(row.last_activity_at).startsWith("1970-") ? "" : normalizeText(row.last_activity_at),
		shelfEntryCount: toCount(row.shelf_entry_count),
		reviewCount: toCount(row.review_count)
	}));
}

export async function loadAdminUserDetail(sql: NeonQueryFunction<false, false>, username: string): Promise<AdminUserDetail | null> {
	await ensureAdminSupportSchema(sql);
	const encryptionKey = getEncryptionKey();
	const normalizedUsername = normalizeText(username).replace(/^@+/, "").toLowerCase();
	if (!normalizedUsername) return null;
	const rows = await sql<Array<{
		id: string;
		username: string | null;
		email: string | null;
		created_at: string | null;
		last_activity_at: string | null;
		shelf_entry_count: number;
		review_count: number;
		want_to_read_count: number;
		currently_reading_count: number;
		completed_count: number;
		comment_count: number;
		follower_count: number;
		following_count: number;
	}>>`
		with target as (
			select
				au.id,
				au.username,
				coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as email,
				au.created_at
			from app_user au
			where lower(coalesce(au.username, '')) = ${normalizedUsername}
			limit 1
		)
		select
			t.id::text as id,
			t.username,
			t.email,
			t.created_at::text as created_at,
			greatest(
				coalesce((select max(updated_at) from user_book where user_id = t.id), 'epoch'::timestamptz),
				coalesce((select max(created_at) from user_activity where user_id = t.id), 'epoch'::timestamptz),
				coalesce((select max(created_at) from user_activity_comment where user_id = t.id), 'epoch'::timestamptz)
			)::text as last_activity_at,
			(select count(*)::int from user_book where user_id = t.id) as shelf_entry_count,
			(select count(*)::int from user_book where user_id = t.id and char_length(trim(coalesce(finished_reflection, ''))) > 0) as review_count,
			(select count(*)::int from user_book where user_id = t.id and status = 'want_to_read') as want_to_read_count,
			(select count(*)::int from user_book where user_id = t.id and status = 'reading') as currently_reading_count,
			(select count(*)::int from user_book where user_id = t.id and status = 'finished') as completed_count,
			(select count(*)::int from user_activity_comment where user_id = t.id) as comment_count,
			(select count(*)::int from user_follow where followed_user_id = t.id) as follower_count,
			(select count(*)::int from user_follow where follower_user_id = t.id) as following_count
		from target t
	`;
	const row = rows[0];
	if (!row?.id) return null;
	return {
		id: normalizeText(row.id),
		username: normalizeText(row.username),
		email: normalizeText(row.email),
		joinedAt: normalizeText(row.created_at),
		lastActivityAt: normalizeText(row.last_activity_at).startsWith("1970-") ? "" : normalizeText(row.last_activity_at),
		shelfEntryCount: toCount(row.shelf_entry_count),
		reviewCount: toCount(row.review_count),
		wantToReadCount: toCount(row.want_to_read_count),
		currentlyReadingCount: toCount(row.currently_reading_count),
		completedCount: toCount(row.completed_count),
		commentCount: toCount(row.comment_count),
		followerCount: toCount(row.follower_count),
		followingCount: toCount(row.following_count)
	};
}

export async function deleteAdminUser(sql: NeonQueryFunction<false, false>, targetUserId: string, adminUserId: string) {
	const targetId = normalizeText(targetUserId);
	const actorId = normalizeText(adminUserId);
	if (!targetId) return { ok: false, status: 400, message: "User not found." };
	if (targetId === actorId) {
		return { ok: false, status: 400, message: "Admins cannot delete their own account from this page." };
	}
	await ensureAdminSupportSchema(sql);
	try {
		const results = await sql.transaction((tx) => [
			tx`delete from user_notification where user_id = ${targetId}::uuid or actor_user_id = ${targetId}::uuid`,
			tx`delete from user_activity_like where user_id = ${targetId}::uuid`,
			tx`delete from user_activity_comment where user_id = ${targetId}::uuid`,
			tx`delete from feedback_submission_event where user_id = ${targetId}::uuid`,
			tx`delete from account_email_change where user_id = ${targetId}::uuid`,
			tx`delete from auth_magic_link where user_id = ${targetId}::uuid`,
			tx`delete from auth_session where user_id = ${targetId}::uuid`,
			tx`delete from user_reading_progress_event where user_id = ${targetId}::uuid`,
			tx`delete from user_custom_shelf_book where user_id = ${targetId}::uuid`,
			tx`delete from user_custom_shelf where user_id = ${targetId}::uuid`,
			tx`delete from user_follow where follower_user_id = ${targetId}::uuid or followed_user_id = ${targetId}::uuid`,
			tx`delete from user_activity where user_id = ${targetId}::uuid`,
			tx`delete from user_book where user_id = ${targetId}::uuid`,
			tx`
				delete from app_user
				where id = ${targetId}::uuid
				returning id::text as id
			`
		]);
		const deletedRows = results[results.length - 1] as Array<{ id: string }> | undefined;
		return deletedRows[0]?.id
			? { ok: true, status: 200, message: "User deleted." }
			: { ok: false, status: 404, message: "User not found." };
	} catch (error) {
		return {
			ok: false,
			status: 500,
			message: error instanceof Error ? error.message : "Failed to delete user."
		};
	}
}
