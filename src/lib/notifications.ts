import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
	awardAchievement,
	achievementAnchor,
	getAchievementDefinition,
	getReadingStreakAchievementDefinition,
	renderAchievementTitle
} from "./achievements";

export type NotificationCategory = "community" | "reading" | "discovery" | "milestones" | "system";

export type NotificationType =
	| "user_follow"
	| "activity_like"
	| "activity_comment"
	| "activity_reply"
	| "reading_goal_completed"
	| "reading_streak_milestone"
	| "series_finished"
	| "discovery_want_to_read_trending"
	| "author_new_book"
	| "import_completed"
	| "goodreads_import_completed";

export type NotificationRecord = {
	id: number;
	type: NotificationType | string;
	category: NotificationCategory | string;
	title: string;
	body: string;
	icon: string;
	actionUrl: string;
	createdAt: string;
	readAt: string;
	actorUsername: string;
	actorCount: number;
	bookTitle: string;
	accentColorToken: string;
	isAchievement: boolean;
	groupLabel: "Today" | "This Week" | "Earlier";
};

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
	community: "Community",
	reading: "Reading",
	discovery: "Discovery",
	milestones: "Milestones",
	system: "System"
};

const defaultCategoryPreferences: Record<NotificationCategory, boolean> = {
	community: true,
	reading: true,
	discovery: true,
	milestones: true,
	system: true
};

const typeCategory: Record<NotificationType, NotificationCategory> = {
	user_follow: "community",
	activity_like: "community",
	activity_comment: "community",
	activity_reply: "community",
	reading_goal_completed: "milestones",
	reading_streak_milestone: "milestones",
	series_finished: "milestones",
	discovery_want_to_read_trending: "discovery",
	author_new_book: "discovery",
	import_completed: "system",
	goodreads_import_completed: "system"
};

const typeIcon: Partial<Record<NotificationType, string>> = {
	user_follow: "person_add",
	activity_like: "favorite",
	activity_comment: "chat_bubble",
	activity_reply: "forum",
	reading_goal_completed: "flag",
	discovery_want_to_read_trending: "explore",
	author_new_book: "new_releases",
	import_completed: "check_circle",
	goodreads_import_completed: "check_circle"
};

function normalizeText(value: unknown, max = 240) {
	return String(value || "").trim().slice(0, max);
}

function normalizeBool(value: unknown, fallback: boolean) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const text = value.trim().toLowerCase();
		if (text === "true") return true;
		if (text === "false") return false;
	}
	return fallback;
}

function normalizePositiveInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.floor(parsed));
}

export function normalizeNotificationCategory(value: unknown): NotificationCategory {
	const text = normalizeText(value, 40).toLowerCase();
	if (text === "reading" || text === "discovery" || text === "milestones" || text === "system") return text;
	return "community";
}

export function normalizeNotificationType(value: unknown): NotificationType {
	const text = normalizeText(value, 80).toLowerCase();
	if (text in typeCategory) return text as NotificationType;
	return "activity_comment";
}

export function normalizeNotificationPreferences(source: unknown) {
	const input = source && typeof source === "object" ? source as Record<string, unknown> : {};
	const categories = input.categories && typeof input.categories === "object"
		? input.categories as Record<string, unknown>
		: {};
	return {
		browserEnabled: normalizeBool(input.browserEnabled, false),
		releaseEmail: normalizeBool(input.releaseEmail, false),
		weeklySummary: normalizeBool(input.weeklySummary, false),
		categories: {
			community: normalizeBool(categories.community, true),
			reading: normalizeBool(categories.reading, true),
			discovery: normalizeBool(categories.discovery, true),
			milestones: normalizeBool(categories.milestones, true),
			system: normalizeBool(categories.system, true)
		}
	};
}

export async function ensureNotificationSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists user_notification (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			actor_user_id uuid references app_user(id) on delete set null,
			activity_id bigint references user_activity(id) on delete cascade,
			type text not null default 'activity_comment',
			category text not null default 'community',
			title text not null default '',
			body text not null default '',
			icon text not null default '',
			action_url text not null default '',
			group_key text not null default '',
			actor_count int not null default 1,
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now(),
			read_at timestamptz null,
			deleted_at timestamptz null
		)
	`;
	await sql`alter table user_notification alter column actor_user_id drop not null`;
	await sql`alter table user_notification alter column activity_id drop not null`;
	await sql`alter table user_notification alter column type set default 'activity_comment'`;
	await sql`alter table user_notification add column if not exists category text not null default 'community'`;
	await sql`alter table user_notification add column if not exists title text not null default ''`;
	await sql`alter table user_notification add column if not exists body text not null default ''`;
	await sql`alter table user_notification add column if not exists icon text not null default ''`;
	await sql`alter table user_notification add column if not exists action_url text not null default ''`;
	await sql`alter table user_notification add column if not exists group_key text not null default ''`;
	await sql`alter table user_notification add column if not exists actor_count int not null default 1`;
	await sql`alter table user_notification add column if not exists metadata jsonb not null default '{}'::jsonb`;
	await sql`alter table user_notification add column if not exists deleted_at timestamptz null`;
	await sql`alter table user_notification drop constraint if exists user_notification_type_check`;
	await sql`create index if not exists idx_user_notification_user_read on user_notification(user_id, read_at, created_at desc)`;
	await sql`create index if not exists idx_user_notification_user_created on user_notification(user_id, created_at desc)`;
	await sql`create index if not exists idx_user_notification_group on user_notification(user_id, group_key, created_at desc)`;
	await sql`create index if not exists idx_user_notification_type_created on user_notification(type, created_at desc)`;
}

async function isCategoryEnabled(sql: NeonQueryFunction<false, false>, userId: string, category: NotificationCategory) {
	const rows = await sql<Array<{ notifications: unknown }>>`
		select coalesce(profile_data->'settings'->'notifications', '{}'::jsonb) as notifications
		from app_user
		where id = ${userId}::uuid
		limit 1
	`;
	const preferences = normalizeNotificationPreferences(rows[0]?.notifications);
	return preferences.categories[category] !== false;
}

function titleFor(input: {
	type: NotificationType;
	actorName: string;
	actorCount: number;
	bookTitle: string;
	seriesName: string;
	value: number;
}) {
	const actor = input.actorName || "A reader";
	const people = input.actorCount > 1 ? `${input.actorCount} people` : actor;
	if (input.type === "user_follow") return `${people} followed you`;
	if (input.type === "activity_like") return `${people} liked your review`;
	if (input.type === "activity_comment") return `${people} commented on your review`;
	if (input.type === "activity_reply") return `${people} replied to your comment`;
	if (input.type === "reading_goal_completed") return "You completed your yearly reading goal";
	if (input.type === "reading_streak_milestone") return `${input.value || ""} day reading streak`.trim();
	if (input.type === "series_finished") return `You finished ${input.seriesName || "a series"}`;
	if (input.type === "discovery_want_to_read_trending") return `${input.bookTitle || "A book"} is gaining readers`;
	if (input.type === "author_new_book") return `New book from a favorite author`;
	if (input.type === "goodreads_import_completed") return "Goodreads import completed";
	return "Import completed";
}

function bodyFor(input: {
	type: NotificationType;
	actorName: string;
	bookTitle: string;
	seriesName: string;
	value: number;
	achievementDefinitionKey?: string;
}) {
	const book = input.bookTitle || "your book";
	const achievementDefinition = input.achievementDefinitionKey
		? getAchievementDefinition(input.achievementDefinitionKey)
		: undefined;
	if (input.type === "user_follow") return "Open their profile to see what they are reading.";
	if (input.type === "activity_like") return `Your review of ${book} resonated with another reader.`;
	if (input.type === "activity_comment") return `There is a new comment on your review of ${book}.`;
	if (input.type === "activity_reply") return `There is a new reply in a conversation about ${book}.`;
	if (input.type === "reading_goal_completed") return "Your yearly goal is complete. Keep reading at your own pace.";
	if (input.type === "reading_streak_milestone" && achievementDefinition) return achievementDefinition.description;
	if (input.type === "reading_streak_milestone") return "A quiet note that your reading rhythm is holding.";
	if (input.type === "series_finished" && achievementDefinition) return achievementDefinition.description;
	if (input.type === "series_finished") return "You reached the end of the available series in DogEared.";
	if (input.type === "discovery_want_to_read_trending") return "Several readers have added it recently.";
	if (input.type === "author_new_book") return "A newly imported title is available in DogEared.";
	if (input.type === "goodreads_import_completed") return "Your Goodreads shelves finished importing.";
	return "Your import finished.";
}

function achievementVisual(input: { type: NotificationType; value: number; metadata?: Record<string, unknown>; seriesName?: string }) {
	const definitionKey = normalizeText(input.metadata?.achievementDefinitionKey || input.metadata?.definitionKey, 120);
	const definition = definitionKey
		? getAchievementDefinition(definitionKey)
		: input.type === "reading_streak_milestone"
			? getReadingStreakAchievementDefinition(input.value)
			: input.type === "series_finished"
				? getAchievementDefinition("series_completion")
				: input.type === "reading_goal_completed"
					? getAchievementDefinition("yearly_reading_goal")
					: undefined;
	if (!definition) return null;
	return {
		definition,
		title: renderAchievementTitle(definition, { seriesName: input.seriesName || input.metadata?.seriesName }),
		body: definition.description,
		icon: definition.iconIdentifier,
		accentColorToken: definition.accentColorToken
	};
}

export async function createNotification(
	sql: NeonQueryFunction<false, false>,
	input: {
		userId: string;
		type: NotificationType;
		actorUserId?: string;
		activityId?: number;
		bookId?: number;
		bookTitle?: string;
		seriesName?: string;
		actionUrl?: string;
		groupKey?: string;
		metadata?: Record<string, unknown>;
		value?: number;
		groupWindowHours?: number;
	}
) {
	await ensureNotificationSchema(sql);
	const userId = normalizeText(input.userId, 80);
	const type = normalizeNotificationType(input.type);
	const category = typeCategory[type] || "community";
	if (!userId) return null;
	if (!(await isCategoryEnabled(sql, userId, category))) return null;
	const actorUserId = normalizeText(input.actorUserId, 80);
	if (actorUserId && actorUserId === userId) return null;
	const actorRows = actorUserId ? await sql<Array<{ username: string | null }>>`
		select username
		from app_user
		where id = ${actorUserId}::uuid
		limit 1
	` : [];
	const actorName = normalizeText(actorRows[0]?.username, 80) ? `@${normalizeText(actorRows[0]?.username, 80)}` : "A reader";
	const activityId = normalizePositiveInt(input.activityId);
	let bookTitle = normalizeText(input.bookTitle, 180);
	let bookId = normalizePositiveInt(input.bookId);
	if (activityId > 0 && (!bookTitle || bookId <= 0)) {
		const bookRows = await sql<Array<{ id: number; title: string }>>`
			select b.id, b.title
			from user_activity ua
			join book b on b.id = ua.book_id
			where ua.id = ${activityId}
			limit 1
		`;
		bookTitle = bookTitle || normalizeText(bookRows[0]?.title, 180);
		bookId = bookId || normalizePositiveInt(bookRows[0]?.id);
	}
	const groupKey = normalizeText(input.groupKey, 180) || [
		type,
		activityId > 0 ? `activity:${activityId}` : "",
		bookId > 0 ? `book:${bookId}` : "",
		normalizeText(input.seriesName, 120)
	].filter(Boolean).join(":");
	const windowHours = Math.max(1, Math.min(168, Number(input.groupWindowHours || 24) || 24));
	const actionUrl = normalizeText(input.actionUrl, 240) || (bookId > 0 ? `/book?bookId=${bookId}` : "");
	const value = normalizePositiveInt(input.value);
	const metadata = {
		...(input.metadata || {}),
		bookId,
		bookTitle,
		seriesName: normalizeText(input.seriesName, 160),
		value
	};
	const achievement = achievementVisual({ type, value, metadata, seriesName: input.seriesName });
	const windowInterval = `${windowHours} hours`;

	if (groupKey) {
		const existingRows = await sql<Array<{ id: number; actor_count: number }>>`
			select id, actor_count
			from user_notification
			where user_id = ${userId}::uuid
				and group_key = ${groupKey}
				and deleted_at is null
				and created_at >= now() - ${windowInterval}::interval
			order by created_at desc
			limit 1
		`;
		const existing = existingRows[0];
		if (existing?.id) {
			const actorCount = Math.max(1, Number(existing.actor_count || 1) + 1);
			const title = achievement?.title || titleFor({ type, actorName, actorCount, bookTitle, seriesName: normalizeText(input.seriesName, 160), value });
			const body = achievement?.body || bodyFor({
				type,
				actorName,
				bookTitle,
				seriesName: normalizeText(input.seriesName, 160),
				value,
				achievementDefinitionKey: normalizeText(metadata.achievementDefinitionKey, 120)
			});
			const updatedRows = await sql<Array<{ id: number }>>`
				update user_notification
				set
					actor_user_id = coalesce(${actorUserId || null}::uuid, actor_user_id),
					title = ${title},
					body = ${body},
					icon = ${achievement?.icon || typeIcon[type] || "notifications"},
					action_url = case when ${actionUrl} <> '' then ${actionUrl} else action_url end,
					actor_count = ${actorCount},
					metadata = metadata || ${JSON.stringify({
						...metadata,
						achievementDefinitionKey: achievement?.definition.key || metadata.achievementDefinitionKey,
						accentColorToken: achievement?.accentColorToken || metadata.accentColorToken
					})}::jsonb,
					read_at = null,
					created_at = now()
				where id = ${existing.id}
				returning id
			`;
			return updatedRows[0]?.id || null;
		}
	}

	const title = achievement?.title || titleFor({ type, actorName, actorCount: 1, bookTitle, seriesName: normalizeText(input.seriesName, 160), value });
	const body = achievement?.body || bodyFor({
		type,
		actorName,
		bookTitle,
		seriesName: normalizeText(input.seriesName, 160),
		value,
		achievementDefinitionKey: normalizeText(metadata.achievementDefinitionKey, 120)
	});
	const notificationMetadata = {
		...metadata,
		achievementDefinitionKey: achievement?.definition.key || metadata.achievementDefinitionKey,
		accentColorToken: achievement?.accentColorToken || metadata.accentColorToken
	};
	const rows = await sql<Array<{ id: number }>>`
		insert into user_notification (
			user_id,
			actor_user_id,
			activity_id,
			type,
			category,
			title,
			body,
			icon,
			action_url,
			group_key,
			actor_count,
			metadata
		)
		values (
			${userId}::uuid,
			${actorUserId || null}::uuid,
			${activityId > 0 ? activityId : null},
			${type},
			${category},
			${title},
			${body},
			${achievement?.icon || typeIcon[type] || "notifications"},
			${actionUrl},
			${groupKey},
			1,
			${JSON.stringify(notificationMetadata)}::jsonb
		)
		returning id
	`;
	return rows[0]?.id || null;
}

export async function loadUnreadNotificationCount(sql: NeonQueryFunction<false, false>, userId: string) {
	await ensureNotificationSchema(sql);
	const rows = await sql<Array<{ unread_count: number }>>`
		select count(*)::int as unread_count
		from user_notification
		where user_id = ${userId}::uuid
			and read_at is null
			and deleted_at is null
	`;
	return normalizePositiveInt(rows[0]?.unread_count);
}

export async function loadNotifications(
	sql: NeonQueryFunction<false, false>,
	userId: string,
	options?: { limit?: number; offset?: number }
) {
	await ensureNotificationSchema(sql);
	const limit = Math.min(100, Math.max(1, Number(options?.limit || 40) || 40));
	const offset = Math.max(0, Number(options?.offset || 0) || 0);
	const rows = await sql<Array<{
		id: number;
		type: string;
		category: string;
		title: string;
		body: string;
		icon: string;
		action_url: string;
		created_at: string;
		read_at: string | null;
		actor_username: string | null;
		actor_count: number;
		book_title: string | null;
		accent_color_token: string | null;
		achievement_definition_key: string | null;
		group_label: string;
	}>>`
		select
			n.id,
			n.type,
			n.category,
			n.title,
			n.body,
			n.icon,
			n.action_url,
			n.created_at::text as created_at,
			n.read_at::text as read_at,
			au.username as actor_username,
			n.actor_count,
			coalesce(n.metadata->>'bookTitle', b.title, '') as book_title,
			coalesce(n.metadata->>'accentColorToken', '') as accent_color_token,
			coalesce(n.metadata->>'achievementDefinitionKey', '') as achievement_definition_key,
			case
				when n.created_at >= date_trunc('day', now()) then 'Today'
				when n.created_at >= now() - interval '7 days' then 'This Week'
				else 'Earlier'
			end as group_label
		from user_notification n
		left join app_user au on au.id = n.actor_user_id
		left join user_activity ua on ua.id = n.activity_id
		left join book b on b.id = ua.book_id
		where n.user_id = ${userId}::uuid
			and n.deleted_at is null
		order by n.created_at desc, n.id desc
		limit ${limit}
		offset ${offset}
	`;
	return rows.map((row): NotificationRecord => ({
		id: normalizePositiveInt(row.id),
		type: normalizeText(row.type, 80),
		category: normalizeText(row.category, 40),
		title: normalizeText(row.title, 180),
		body: normalizeText(row.body, 280),
		icon: normalizeText(row.icon, 60) || "notifications",
		actionUrl: normalizeText(row.action_url, 240),
		createdAt: normalizeText(row.created_at, 80),
		readAt: normalizeText(row.read_at, 80),
		actorUsername: normalizeText(row.actor_username, 80),
		actorCount: Math.max(1, normalizePositiveInt(row.actor_count) || 1),
		bookTitle: normalizeText(row.book_title, 180),
		accentColorToken: normalizeText(row.accent_color_token, 80),
		isAchievement: !!normalizeText(row.achievement_definition_key, 120),
		groupLabel: row.group_label === "Today" || row.group_label === "This Week" ? row.group_label : "Earlier"
	}));
}

export async function markNotificationRead(sql: NeonQueryFunction<false, false>, userId: string, notificationId: number) {
	await ensureNotificationSchema(sql);
	await sql`
		update user_notification
		set read_at = coalesce(read_at, now())
		where user_id = ${userId}::uuid
			and id = ${notificationId}
			and deleted_at is null
	`;
}

export async function markAllNotificationsRead(sql: NeonQueryFunction<false, false>, userId: string) {
	await ensureNotificationSchema(sql);
	await sql`
		update user_notification
		set read_at = coalesce(read_at, now())
		where user_id = ${userId}::uuid
			and read_at is null
			and deleted_at is null
	`;
}

export async function deleteNotification(sql: NeonQueryFunction<false, false>, userId: string, notificationId: number) {
	await ensureNotificationSchema(sql);
	await sql`
		update user_notification
		set deleted_at = now()
		where user_id = ${userId}::uuid
			and id = ${notificationId}
	`;
}

export async function loadAdminNotificationStats(sql: NeonQueryFunction<false, false>) {
	await ensureNotificationSchema(sql);
	const summaryRows = await sql<Array<{
		sent_today: number;
		unread: number;
		failed_jobs: number;
	}>>`
		select
			(select count(*)::int from user_notification where created_at >= date_trunc('day', now())) as sent_today,
			(select count(*)::int from user_notification where read_at is null and deleted_at is null) as unread,
			0::int as failed_jobs
	`;
	const typeRows = await sql<Array<{ type: string; count: number }>>`
		select type, count(*)::int as count
		from user_notification
		where created_at >= now() - interval '30 days'
		group by type
		order by count desc, type asc
		limit 12
	`;
	const volumeRows = await sql<Array<{ day: string; count: number }>>`
		select to_char(day, 'YYYY-MM-DD') as day, coalesce(count(n.id), 0)::int as count
		from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') day
		left join user_notification n on n.created_at >= day and n.created_at < day + interval '1 day'
		group by day
		order by day asc
	`;
	return {
		sentToday: normalizePositiveInt(summaryRows[0]?.sent_today),
		unread: normalizePositiveInt(summaryRows[0]?.unread),
		failedJobs: normalizePositiveInt(summaryRows[0]?.failed_jobs),
		topTypes: typeRows.map((row) => ({ type: normalizeText(row.type, 80), count: normalizePositiveInt(row.count) })),
		volume: volumeRows.map((row) => ({ day: normalizeText(row.day, 20), count: normalizePositiveInt(row.count) }))
	};
}

export async function createReadingMilestoneNotifications(
	sql: NeonQueryFunction<false, false>,
	userId: string,
	input: { status?: string; bookId?: number; title?: string }
) {
	const currentYear = new Date().getFullYear();
	let profilePathPromise: Promise<string> | null = null;
	const resolveProfilePath = () => {
		if (!profilePathPromise) {
			profilePathPromise = (async () => {
				const usernameRows = await sql<Array<{ username: string | null }>>`
					select username
					from app_user
					where id = ${userId}::uuid
					limit 1
				`;
				return usernameRows[0]?.username
					? `/profile/${encodeURIComponent(String(usernameRows[0].username))}`
					: "/profile";
			})();
		}
		return profilePathPromise;
	};
	if (input.status === "finished") {
		const goalRows = await sql<Array<{ goal: number; finished_count: number }>>`
			select
				coalesce(nullif(regexp_replace(coalesce(au.profile_data->>'readingGoal', ''), '[^0-9]', '', 'g'), '')::int, 0) as goal,
				(
					select count(*)::int
					from user_book ub
					where ub.user_id = au.id
						and ub.status = 'finished'
						and ub.finished_date >= date_trunc('year', now())::date
				) as finished_count
			from app_user au
			where au.id = ${userId}::uuid
			limit 1
		`;
		const goal = normalizePositiveInt(goalRows[0]?.goal);
		const finishedCount = normalizePositiveInt(goalRows[0]?.finished_count);
		if (goal > 0 && finishedCount >= goal) {
			const award = await awardAchievement(sql, {
				userId,
				definitionKey: "yearly_reading_goal",
				scopeKey: String(currentYear),
				metadata: {
					year: currentYear,
					goal,
					finishedCount
				}
			});
			if (award?.inserted) {
				const profilePath = await resolveProfilePath();
				await createNotification(sql, {
					userId,
					type: "reading_goal_completed",
					groupKey: `reading_goal_completed:${currentYear}`,
					actionUrl: `${profilePath}#${achievementAnchor(award.id)}`,
					value: goal,
					metadata: {
						achievementId: award.id,
						achievementDefinitionKey: award.definition.key,
						year: currentYear,
						goal,
						finishedCount
					},
					groupWindowHours: 24 * 365
				});
			}
		}
		const seriesRows = await sql<Array<{ series_id: number; series_name: string; total_books: number; finished_books: number }>>`
			with target_series as (
				select sb.series_id
				from series_book sb
				where sb.book_id = ${normalizePositiveInt(input.bookId)}
			)
			select
				s.id as series_id,
				s.name as series_name,
				count(sb.book_id)::int as total_books,
				count(ub.book_id) filter (where ub.status = 'finished')::int as finished_books
			from target_series ts
			join series s on s.id = ts.series_id
			join series_book sb on sb.series_id = s.id and sb.book_id is not null
			left join user_book ub on ub.user_id = ${userId}::uuid and ub.book_id = sb.book_id
			group by s.id, s.name
			limit 1
		`;
		const series = seriesRows[0];
		if (series && normalizePositiveInt(series.total_books) > 1 && normalizePositiveInt(series.finished_books) >= normalizePositiveInt(series.total_books)) {
			const award = await awardAchievement(sql, {
				userId,
				definitionKey: "series_completion",
				relatedSeriesId: normalizePositiveInt(series.series_id),
				metadata: {
					seriesName: series.series_name,
					totalBooks: normalizePositiveInt(series.total_books),
					finishedBooks: normalizePositiveInt(series.finished_books)
				}
			});
			if (award?.inserted) {
				const profilePath = await resolveProfilePath();
				await createNotification(sql, {
					userId,
					type: "series_finished",
					bookId: input.bookId,
					seriesName: series.series_name,
					groupKey: `series_finished:${series.series_id}`,
					actionUrl: `${profilePath}#${achievementAnchor(award.id)}`,
					metadata: {
						achievementId: award.id,
						achievementDefinitionKey: award.definition.key,
						seriesId: normalizePositiveInt(series.series_id),
						seriesName: series.series_name
					},
					groupWindowHours: 24 * 365
				});
			}
		}
	}
	const streakRows = await sql<Array<{ streak_days: number }>>`
		with days as (
			select distinct recorded_at::date as day
			from user_reading_progress_event
			where user_id = ${userId}::uuid
				and recorded_at >= now() - interval '400 days'
		),
		numbered as (
			select day, day - (row_number() over (order by day))::int as grp
			from days
		)
		select count(*)::int as streak_days
		from numbered
		where grp = (
			select grp
			from numbered
			order by day desc
			limit 1
		)
	`;
	const streak = normalizePositiveInt(streakRows[0]?.streak_days);
	const streakDefinition = getReadingStreakAchievementDefinition(streak);
	if (streakDefinition) {
		const award = await awardAchievement(sql, {
			userId,
			definitionKey: streakDefinition.key,
			metadata: { streakDays: streak }
		});
		if (award?.inserted) {
			const profilePath = await resolveProfilePath();
			await createNotification(sql, {
				userId,
				type: "reading_streak_milestone",
				groupKey: `reading_streak_milestone:${streak}`,
				actionUrl: `${profilePath}#${achievementAnchor(award.id)}`,
				value: streak,
				metadata: {
					achievementId: award.id,
					achievementDefinitionKey: award.definition.key,
					streakDays: streak
				},
				groupWindowHours: 24 * 365
			});
		}
	}
}
