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

export type AdminOperationsSummary = {
	growth: { totalUsers: number; newUsersThisWeek: number; newUsersThisMonth: number };
	engagement: { activeUsersWeek: number; activeUsersMonth: number; activitiesWeek: number; commentsWeek: number };
	content: { totalBooks: number; totalAuthors: number; missingCovers: number; duplicateWorks: number };
	feedback: { total: number; open: number; resolved: number; duplicates: number };
	notifications: { total: number; unread: number; lastCreatedAt: string };
	recommendations: { impressions: number; clicks: number; hides: number; interesting: number; ctr: number; instrumented: boolean };
	search: { indexedBooks: number; indexedAuthors: number; missingCanonicalWorks: number };
	imports: { shelfEntries: number; readers: number; duplicateWorks: number; missingMetadata: number; coverIssues: number };
	system: { apiFailures: number; emailFailures: number; failedJobs: number; cacheStatus: string };
};

export type AdminBetaUser = {
	id: string;
	displayName: string;
	username: string;
	email: string;
	joinedAt: string;
	lastActiveAt: string;
	books: number;
	reviews: number;
	journalEntries: number;
	readingStreak: number;
	status: string;
};

export type AdminFeedbackIssue = {
	id: number;
	type: string;
	status: string;
	assignee: string;
	reporter: string;
	reporterEmail: string;
	message: string;
	pageUrl: string;
	internalNotes: string;
	resolutionVersion: string;
	duplicateOf: number;
	createdAt: string;
	updatedAt: string;
};

export type AdminFeatureFlag = {
	key: string;
	label: string;
	description: string;
	enabled: boolean;
	updatedAt: string;
};

export type AdminAnnouncement = {
	id: number;
	title: string;
	body: string;
	status: string;
	dismissible: boolean;
	startsAt: string;
	endsAt: string;
	updatedAt: string;
};

export type AdminReleaseNote = {
	id: number;
	version: string;
	title: string;
	body: string;
	publishedAt: string;
	createdAt: string;
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

export function emptyAdminOverviewStats(): AdminOverviewStats {
	return {
		totalBooks: 0,
		totalAuthors: 0,
		totalUsers: 0,
		totalShelfEntries: 0,
		totalReviews: 0,
		totalComments: 0,
		totalCurrentlyReading: 0,
		totalCompleted: 0,
		newUsersThisWeek: 0,
		newBooksThisWeek: 0,
		reviewsThisWeek: 0
	};
}

export function emptyAdminOperationsSummary(): AdminOperationsSummary {
	return {
		growth: { totalUsers: 0, newUsersThisWeek: 0, newUsersThisMonth: 0 },
		engagement: { activeUsersWeek: 0, activeUsersMonth: 0, activitiesWeek: 0, commentsWeek: 0 },
		content: { totalBooks: 0, totalAuthors: 0, missingCovers: 0, duplicateWorks: 0 },
		feedback: { total: 0, open: 0, resolved: 0, duplicates: 0 },
		notifications: { total: 0, unread: 0, lastCreatedAt: "" },
		recommendations: { impressions: 0, clicks: 0, hides: 0, interesting: 0, ctr: 0, instrumented: false },
		search: { indexedBooks: 0, indexedAuthors: 0, missingCanonicalWorks: 0 },
		imports: { shelfEntries: 0, readers: 0, duplicateWorks: 0, missingMetadata: 0, coverIssues: 0 },
		system: { apiFailures: 0, emailFailures: 0, failedJobs: 0, cacheStatus: "Unknown" }
	};
}

function normalizeText(value: unknown, maxLength = 500) {
	return String(value || "").trim().slice(0, maxLength);
}

function toCount(value: unknown) {
	return Math.max(0, Number(value || 0) || 0);
}

function toBool(value: unknown) {
	return value === true || String(value || "").trim().toLowerCase() === "true";
}

function normalizeStatus(value: unknown, allowed: string[], fallback: string) {
	const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
	return allowed.includes(normalized) ? normalized : fallback;
}

export async function ensureAdminSupportSchema(sql: NeonQueryFunction<false, false>) {
	await sql`alter table app_user add column if not exists updated_at timestamptz not null default now()`;
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

export async function ensureAdminOperationsSchema(sql: NeonQueryFunction<false, false>) {
	await ensureAdminSupportSchema(sql);
	await sql`
		create table if not exists admin_feedback_issue (
			id bigserial primary key,
			feedback_event_id bigint references feedback_submission_event(id) on delete set null,
			user_id uuid references app_user(id) on delete set null,
			feedback_type text not null default 'general',
			status text not null default 'new',
			assignee text not null default '',
			reporter_email text not null default '',
			message text not null default '',
			page_url text not null default '',
			internal_notes text not null default '',
			resolution_version text not null default '',
			duplicate_of bigint references admin_feedback_issue(id) on delete set null,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_admin_feedback_issue_status on admin_feedback_issue(status, created_at desc)`;
	await sql`
		create table if not exists admin_feature_flag (
			flag_key text primary key,
			label text not null default '',
			description text not null default '',
			enabled boolean not null default false,
			updated_at timestamptz not null default now()
		)
	`;
	await sql`
		create table if not exists admin_announcement (
			id bigserial primary key,
			title text not null default '',
			body text not null default '',
			status text not null default 'draft',
			dismissible boolean not null default true,
			starts_at timestamptz,
			ends_at timestamptz,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_admin_announcement_status on admin_announcement(status, updated_at desc)`;
	await sql`
		create table if not exists admin_release_note (
			id bigserial primary key,
			version text not null default '',
			title text not null default '',
			body text not null default '',
			published_at timestamptz,
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_admin_release_note_published on admin_release_note(published_at desc, created_at desc)`;
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

export async function loadAdminOperationsSummary(sql: NeonQueryFunction<false, false>): Promise<AdminOperationsSummary> {
	await ensureAdminOperationsSchema(sql);
	await sql`alter table book add column if not exists canonical_work_key text not null default ''`;
	const rows = await sql<Array<{
		total_users: number;
		new_users_week: number;
		new_users_month: number;
		active_users_week: number;
		active_users_month: number;
		activities_week: number;
		comments_week: number;
		total_books: number;
		total_authors: number;
		missing_covers: number;
		duplicate_works: number;
		feedback_total: number;
		feedback_open: number;
		feedback_resolved: number;
		feedback_duplicates: number;
		notifications_total: number;
		notifications_unread: number;
		notifications_last_created_at: string | null;
		indexed_books: number;
		indexed_authors: number;
		missing_canonical_works: number;
		shelf_entries: number;
		import_readers: number;
		missing_metadata: number;
		cover_issues: number;
	}>>`
		with duplicate_groups as (
			select canonical_work_key
			from book
			where trim(coalesce(canonical_work_key, '')) <> ''
			group by canonical_work_key
			having count(*) > 1
		)
		select
			(select count(*)::int from app_user) as total_users,
			(select count(*)::int from app_user where created_at >= now() - interval '7 days') as new_users_week,
			(select count(*)::int from app_user where created_at >= now() - interval '30 days') as new_users_month,
			(select count(distinct user_id)::int from user_activity where created_at >= now() - interval '7 days') as active_users_week,
			(select count(distinct user_id)::int from user_activity where created_at >= now() - interval '30 days') as active_users_month,
			(select count(*)::int from user_activity where created_at >= now() - interval '7 days') as activities_week,
			(select count(*)::int from user_activity_comment where created_at >= now() - interval '7 days') as comments_week,
			(select count(*)::int from book) as total_books,
			(select count(*)::int from author) as total_authors,
			(select count(*)::int from book where trim(coalesce(cover_url, '')) = '') as missing_covers,
			(select count(*)::int from duplicate_groups) as duplicate_works,
			(select count(*)::int from admin_feedback_issue) as feedback_total,
			(select count(*)::int from admin_feedback_issue where status not in ('resolved', 'closed', 'duplicate')) as feedback_open,
			(select count(*)::int from admin_feedback_issue where status in ('resolved', 'closed')) as feedback_resolved,
			(select count(*)::int from admin_feedback_issue where status = 'duplicate' or duplicate_of is not null) as feedback_duplicates,
			(select count(*)::int from user_notification) as notifications_total,
			(select count(*)::int from user_notification where read_at is null) as notifications_unread,
			(select max(created_at)::text from user_notification) as notifications_last_created_at,
			(select count(*)::int from book where trim(coalesce(canonical_work_key, '')) <> '') as indexed_books,
			(select count(*)::int from author where trim(coalesce(name, '')) <> '') as indexed_authors,
			(select count(*)::int from book where trim(coalesce(canonical_work_key, '')) = '') as missing_canonical_works,
			(select count(*)::int from user_book) as shelf_entries,
			(select count(distinct user_id)::int from user_book) as import_readers,
			(select count(*)::int from book where trim(coalesce(cover_url, '')) = '' or trim(coalesce(synopsis, '')) = '' or coalesce(page_count, 0) <= 0) as missing_metadata,
			(select count(*)::int from book where trim(coalesce(cover_url, '')) = '') as cover_issues
	`;
	const row = rows[0] || {};
	return {
		growth: {
			totalUsers: toCount(row.total_users),
			newUsersThisWeek: toCount(row.new_users_week),
			newUsersThisMonth: toCount(row.new_users_month)
		},
		engagement: {
			activeUsersWeek: toCount(row.active_users_week),
			activeUsersMonth: toCount(row.active_users_month),
			activitiesWeek: toCount(row.activities_week),
			commentsWeek: toCount(row.comments_week)
		},
		content: {
			totalBooks: toCount(row.total_books),
			totalAuthors: toCount(row.total_authors),
			missingCovers: toCount(row.missing_covers),
			duplicateWorks: toCount(row.duplicate_works)
		},
		feedback: {
			total: toCount(row.feedback_total),
			open: toCount(row.feedback_open),
			resolved: toCount(row.feedback_resolved),
			duplicates: toCount(row.feedback_duplicates)
		},
		notifications: {
			total: toCount(row.notifications_total),
			unread: toCount(row.notifications_unread),
			lastCreatedAt: normalizeText(row.notifications_last_created_at)
		},
		recommendations: { impressions: 0, clicks: 0, hides: 0, interesting: 0, ctr: 0, instrumented: false },
		search: {
			indexedBooks: toCount(row.indexed_books),
			indexedAuthors: toCount(row.indexed_authors),
			missingCanonicalWorks: toCount(row.missing_canonical_works)
		},
		imports: {
			shelfEntries: toCount(row.shelf_entries),
			readers: toCount(row.import_readers),
			duplicateWorks: toCount(row.duplicate_works),
			missingMetadata: toCount(row.missing_metadata),
			coverIssues: toCount(row.cover_issues)
		},
		system: { apiFailures: 0, emailFailures: 0, failedJobs: 0, cacheStatus: "In-memory runtime cache" }
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

export async function loadAdminBetaUsers(sql: NeonQueryFunction<false, false>, query: string, limit = 100): Promise<AdminBetaUser[]> {
	await ensureAdminOperationsSchema(sql);
	const encryptionKey = getEncryptionKey();
	const search = normalizeText(query).toLowerCase();
	const pattern = `%${search}%`;
	const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
	const rows = await sql<Array<{
		id: string;
		username: string | null;
		email: string | null;
		profile_data: unknown;
		created_at: string | null;
		last_active_at: string | null;
		book_count: number;
		review_count: number;
		journal_count: number;
		reading_streak: number;
		status: string | null;
	}>>`
		with users as (
			select
				au.id,
				au.username,
				au.profile_data,
				coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as email,
				au.created_at
			from app_user au
		)
		select
			u.id::text as id,
			u.username,
			u.email,
			u.profile_data,
			u.created_at::text as created_at,
			greatest(
				coalesce(max(ub.updated_at), 'epoch'::timestamptz),
				coalesce(max(ua.created_at), 'epoch'::timestamptz),
				coalesce(max(uac.created_at), 'epoch'::timestamptz)
			)::text as last_active_at,
			count(distinct ub.book_id)::int as book_count,
			count(distinct ub.book_id) filter (where char_length(trim(coalesce(ub.finished_reflection, ''))) > 0)::int as review_count,
			count(distinct uac.id)::int as journal_count,
			least(365, count(distinct date_trunc('day', coalesce(ua.created_at, ub.updated_at)))::int) as reading_streak,
			coalesce(u.profile_data->>'accountStatus', u.profile_data->>'status', '') as status
		from users u
		left join user_book ub on ub.user_id = u.id
		left join user_activity ua on ua.user_id = u.id
		left join user_activity_comment uac on uac.user_id = u.id
		where ${search} = ''
			or lower(coalesce(u.username, '')) like ${pattern}
			or lower(coalesce(u.email, '')) like ${pattern}
			or lower(coalesce(u.profile_data->>'name', '')) like ${pattern}
		group by u.id, u.username, u.email, u.profile_data, u.created_at
		order by u.created_at desc nulls last, u.id desc
		limit ${safeLimit}
	`;
	return rows.map((row) => {
		const profile = row.profile_data && typeof row.profile_data === "object" ? row.profile_data as Record<string, unknown> : {};
		return {
			id: normalizeText(row.id),
			displayName: normalizeText(profile.name, 80),
			username: normalizeText(row.username),
			email: normalizeText(row.email),
			joinedAt: normalizeText(row.created_at),
			lastActiveAt: normalizeText(row.last_active_at).startsWith("1970-") ? "" : normalizeText(row.last_active_at),
			books: toCount(row.book_count),
			reviews: toCount(row.review_count),
			journalEntries: toCount(row.journal_count),
			readingStreak: toCount(row.reading_streak),
			status: normalizeText(row.status) || "active"
		};
	});
}

export async function loadAdminFeedbackIssues(sql: NeonQueryFunction<false, false>, status = "", limit = 80): Promise<AdminFeedbackIssue[]> {
	await ensureAdminOperationsSchema(sql);
	const normalizedStatus = normalizeText(status).toLowerCase();
	const safeLimit = Math.min(150, Math.max(1, Number(limit) || 80));
	const rows = await sql<Array<{
		id: number;
		feedback_type: string;
		status: string;
		assignee: string;
		reporter: string | null;
		reporter_email: string;
		message: string;
		page_url: string;
		internal_notes: string;
		resolution_version: string;
		duplicate_of: number | null;
		created_at: string;
		updated_at: string;
	}>>`
		select
			afi.id,
			afi.feedback_type,
			afi.status,
			afi.assignee,
			au.username as reporter,
			afi.reporter_email,
			afi.message,
			afi.page_url,
			afi.internal_notes,
			afi.resolution_version,
			afi.duplicate_of,
			afi.created_at::text as created_at,
			afi.updated_at::text as updated_at
		from admin_feedback_issue afi
		left join app_user au on au.id = afi.user_id
		where ${normalizedStatus} = '' or afi.status = ${normalizedStatus}
		order by afi.updated_at desc, afi.id desc
		limit ${safeLimit}
	`;
	return rows.map((row) => ({
		id: toCount(row.id),
		type: normalizeText(row.feedback_type),
		status: normalizeText(row.status),
		assignee: normalizeText(row.assignee),
		reporter: normalizeText(row.reporter),
		reporterEmail: normalizeText(row.reporter_email),
		message: normalizeText(row.message, 4000),
		pageUrl: normalizeText(row.page_url, 1000),
		internalNotes: normalizeText(row.internal_notes, 4000),
		resolutionVersion: normalizeText(row.resolution_version),
		duplicateOf: toCount(row.duplicate_of),
		createdAt: normalizeText(row.created_at),
		updatedAt: normalizeText(row.updated_at)
	}));
}

export async function updateAdminFeedbackIssue(sql: NeonQueryFunction<false, false>, input: {
	id: unknown;
	status: unknown;
	assignee: unknown;
	internalNotes: unknown;
	resolutionVersion: unknown;
	duplicateOf: unknown;
}) {
	await ensureAdminOperationsSchema(sql);
	const id = toCount(input.id);
	if (!id) return { ok: false, message: "Feedback issue not found." };
	const status = normalizeStatus(input.status, ["new", "triaged", "in_progress", "resolved", "closed", "duplicate"], "triaged");
	const duplicateOf = toCount(input.duplicateOf);
	await sql`
		update admin_feedback_issue
		set
			status = ${status},
			assignee = ${normalizeText(input.assignee, 120)},
			internal_notes = ${normalizeText(input.internalNotes, 4000)},
			resolution_version = ${normalizeText(input.resolutionVersion, 80)},
			duplicate_of = ${duplicateOf > 0 ? duplicateOf : null},
			updated_at = now()
		where id = ${id}
	`;
	return { ok: true, message: "Feedback issue updated." };
}

export async function recordAdminFeedbackIssue(sql: NeonQueryFunction<false, false>, input: {
	feedbackEventId: number;
	userId: string;
	type: string;
	reporterEmail: string;
	message: string;
	pageUrl: string;
}) {
	await ensureAdminOperationsSchema(sql);
	await sql`
		insert into admin_feedback_issue (feedback_event_id, user_id, feedback_type, reporter_email, message, page_url)
		values (${input.feedbackEventId || null}, ${input.userId || null}::uuid, ${normalizeText(input.type, 40)}, ${normalizeText(input.reporterEmail, 320)}, ${normalizeText(input.message, 4000)}, ${normalizeText(input.pageUrl, 1000)})
	`;
}

export async function loadAdminFeatureFlags(sql: NeonQueryFunction<false, false>): Promise<AdminFeatureFlag[]> {
	await ensureAdminOperationsSchema(sql);
	const defaults = [
		["recommendation_v2", "Recommendation experiments", "Enable experimental recommendation ranking."],
		["announcement_banner", "Announcement banner", "Allow active admin announcements to render in the app shell."],
		["beta_import_tools", "Beta import tools", "Expose beta import controls and diagnostics."],
		["reader_discovery", "Reader discovery", "Enable people-to-follow discovery surfaces."]
	];
	await Promise.all(defaults.map(([key, label, description]) => sql`
		insert into admin_feature_flag (flag_key, label, description)
		values (${key}, ${label}, ${description})
		on conflict (flag_key) do nothing
	`));
	const rows = await sql<Array<{ flag_key: string; label: string; description: string; enabled: boolean; updated_at: string }>>`
		select flag_key, label, description, enabled, updated_at::text as updated_at
		from admin_feature_flag
		order by flag_key asc
	`;
	return rows.map((row) => ({
		key: normalizeText(row.flag_key),
		label: normalizeText(row.label),
		description: normalizeText(row.description, 500),
		enabled: toBool(row.enabled),
		updatedAt: normalizeText(row.updated_at)
	}));
}

export async function updateAdminFeatureFlags(sql: NeonQueryFunction<false, false>, enabledKeys: string[]) {
	await ensureAdminOperationsSchema(sql);
	const enabled = new Set(enabledKeys.map((key) => normalizeText(key).toLowerCase()).filter(Boolean));
	const flags = await loadAdminFeatureFlags(sql);
	await Promise.all(flags.map((flag) => sql`
		update admin_feature_flag
		set enabled = ${enabled.has(flag.key)}, updated_at = now()
		where flag_key = ${flag.key}
	`));
	return { ok: true, message: "Feature flags updated." };
}

export async function loadAdminAnnouncements(sql: NeonQueryFunction<false, false>): Promise<AdminAnnouncement[]> {
	await ensureAdminOperationsSchema(sql);
	const rows = await sql<Array<{ id: number; title: string; body: string; status: string; dismissible: boolean; starts_at: string | null; ends_at: string | null; updated_at: string }>>`
		select id, title, body, status, dismissible, starts_at::text as starts_at, ends_at::text as ends_at, updated_at::text as updated_at
		from admin_announcement
		order by updated_at desc, id desc
		limit 25
	`;
	return rows.map((row) => ({
		id: toCount(row.id),
		title: normalizeText(row.title, 160),
		body: normalizeText(row.body, 1000),
		status: normalizeText(row.status),
		dismissible: toBool(row.dismissible),
		startsAt: normalizeText(row.starts_at),
		endsAt: normalizeText(row.ends_at),
		updatedAt: normalizeText(row.updated_at)
	}));
}

export async function saveAdminAnnouncement(sql: NeonQueryFunction<false, false>, input: {
	title: unknown;
	body: unknown;
	status: unknown;
	dismissible: unknown;
}) {
	await ensureAdminOperationsSchema(sql);
	const title = normalizeText(input.title, 160);
	const body = normalizeText(input.body, 1000);
	if (!title || !body) return { ok: false, message: "Announcement title and body are required." };
	const status = normalizeStatus(input.status, ["draft", "active", "archived"], "draft");
	await sql`
		insert into admin_announcement (title, body, status, dismissible)
		values (${title}, ${body}, ${status}, ${toBool(input.dismissible)})
	`;
	return { ok: true, message: "Announcement saved." };
}

export async function loadAdminReleaseNotes(sql: NeonQueryFunction<false, false>): Promise<AdminReleaseNote[]> {
	await ensureAdminOperationsSchema(sql);
	const rows = await sql<Array<{ id: number; version: string; title: string; body: string; published_at: string | null; created_at: string }>>`
		select id, version, title, body, published_at::text as published_at, created_at::text as created_at
		from admin_release_note
		order by coalesce(published_at, created_at) desc, id desc
		limit 30
	`;
	return rows.map((row) => ({
		id: toCount(row.id),
		version: normalizeText(row.version, 80),
		title: normalizeText(row.title, 160),
		body: normalizeText(row.body, 2000),
		publishedAt: normalizeText(row.published_at),
		createdAt: normalizeText(row.created_at)
	}));
}

export async function saveAdminReleaseNote(sql: NeonQueryFunction<false, false>, input: {
	version: unknown;
	title: unknown;
	body: unknown;
}) {
	await ensureAdminOperationsSchema(sql);
	const title = normalizeText(input.title, 160);
	const body = normalizeText(input.body, 2000);
	if (!title || !body) return { ok: false, message: "Release title and notes are required." };
	await sql`
		insert into admin_release_note (version, title, body, published_at)
		values (${normalizeText(input.version, 80)}, ${title}, ${body}, now())
	`;
	return { ok: true, message: "Release note saved." };
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
