import type { NeonQueryFunction } from "@neondatabase/serverless";

export type AchievementType = "reading_streak" | "series_completion" | "yearly_goal";
export type AchievementVisibility = "public" | "hidden";

export type AchievementDefinition = {
	key: string;
	type: AchievementType;
	title: string;
	description: string;
	iconIdentifier: string;
	accentColorToken: string;
	criteria: Record<string, unknown>;
	repeatable: boolean;
	relatedBehavior?: "series" | "work";
	howEarned: string;
};

export type EarnedAchievement = {
	id: number;
	userId: string;
	definitionKey: string;
	scopeKey: string;
	type: AchievementType;
	title: string;
	description: string;
	iconIdentifier: string;
	accentColorToken: string;
	criteria: Record<string, unknown>;
	repeatable: boolean;
	howEarned: string;
	earnedAt: string;
	relatedBookId: number;
	relatedBookTitle: string;
	relatedSeriesId: number;
	relatedSeriesName: string;
	visibility: AchievementVisibility;
	metadata: Record<string, unknown>;
};

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365] as const;
const STREAK_ICON_BY_DAYS: Record<typeof STREAK_MILESTONES[number], string> = {
	7: "eco",
	14: "filter_vintage",
	30: "local_fire_department",
	60: "bolt",
	100: "wb_sunny",
	365: "calendar_month"
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
	...STREAK_MILESTONES.map((days) => ({
		key: `reading_streak_${days}`,
		type: "reading_streak" as const,
		title: `${days} Day Reading Streak`,
		description: `Your reading rhythm has held for ${days} consecutive days.`,
		iconIdentifier: STREAK_ICON_BY_DAYS[days],
		accentColorToken: `--achievement-streak-${days}`,
		criteria: { streakDays: days },
		repeatable: false,
		howEarned: `Keep a reading streak going for ${days} days to earn this badge.`
	})),
	{
		key: "series_completion",
		type: "series_completion",
		title: "Finished {seriesName}",
		description: "Reached the end of every currently available book in the series.",
		iconIdentifier: "auto_stories",
		accentColorToken: "--achievement-series-completion",
		criteria: { finishedAllCurrentlyAvailableBooks: true },
		repeatable: false,
		relatedBehavior: "series",
		howEarned: "Finish every currently available book in a series to earn this badge."
	},
	{
		key: "yearly_reading_goal",
		type: "yearly_goal",
		title: "Yearly Reading Goal",
		description: "You reached your reading goal for the year.",
		iconIdentifier: "flag",
		accentColorToken: "--achievement-yearly-goal",
		criteria: { annualGoalCompleted: true },
		repeatable: true,
		howEarned: "Set a yearly reading goal and finish enough books in that year to earn this badge."
	}
];

const definitionByKey = new Map(ACHIEVEMENT_DEFINITIONS.map((definition) => [definition.key, definition]));

function cleanText(value: unknown, max = 240) {
	return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function positiveInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.floor(parsed));
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function normalizeVisibility(value: unknown): AchievementVisibility {
	return cleanText(value, 24).toLowerCase() === "hidden" ? "hidden" : "public";
}

export function getAchievementDefinition(key: string) {
	return definitionByKey.get(cleanText(key, 120));
}

export function getReadingStreakAchievementDefinition(days: number) {
	return getAchievementDefinition(`reading_streak_${positiveInt(days)}`);
}

export function renderAchievementTitle(definition: AchievementDefinition, input?: { seriesName?: unknown }) {
	const seriesName = cleanText(input?.seriesName, 160);
	if (definition.key === "series_completion") return `Finished ${seriesName || "a series"}`;
	return definition.title;
}

export function resolveAchievementVisibilitySetting(profileData: unknown) {
	const source = asRecord(profileData);
	const settings = asRecord(source.settings);
	const privacy = asRecord(settings.privacy);
	return privacy.showAchievements !== false;
}

export async function ensureAchievementSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists achievement_definition (
			key text primary key,
			type text not null,
			title text not null,
			description text not null,
			icon_identifier text not null,
			accent_color_token text not null,
			criteria jsonb not null default '{}'::jsonb,
			repeatable boolean not null default false,
			related_behavior text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`
		create table if not exists user_achievement (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			definition_key text not null references achievement_definition(key) on delete restrict,
			earned_at timestamptz not null default now(),
			related_book_id bigint references book(id) on delete set null,
			related_series_id bigint references series(id) on delete set null,
			scope_key text not null default '',
			visibility text not null default 'public',
			metadata jsonb not null default '{}'::jsonb
		)
	`;
	await sql`alter table user_achievement add column if not exists related_book_id bigint references book(id) on delete set null`;
	await sql`alter table user_achievement add column if not exists related_series_id bigint references series(id) on delete set null`;
	await sql`alter table user_achievement add column if not exists scope_key text not null default ''`;
	await sql`alter table user_achievement add column if not exists visibility text not null default 'public'`;
	await sql`alter table user_achievement add column if not exists metadata jsonb not null default '{}'::jsonb`;
	await sql`
		do $$
		begin
			if exists (
				select 1
				from pg_indexes
				where schemaname = current_schema()
					and indexname = 'idx_user_achievement_unique_scope'
					and indexdef not like '%scope_key%'
			) then
				execute 'drop index idx_user_achievement_unique_scope';
			end if;
		end $$;
	`;
	await sql`
		create unique index if not exists idx_user_achievement_unique_scope
		on user_achievement(user_id, definition_key, coalesce(related_series_id, 0), coalesce(related_book_id, 0), scope_key)
	`;
	await sql`create index if not exists idx_user_achievement_user_earned on user_achievement(user_id, earned_at desc)`;
	await sql`create index if not exists idx_user_achievement_definition on user_achievement(definition_key, earned_at desc)`;

	for (const definition of ACHIEVEMENT_DEFINITIONS) {
		await sql`
			insert into achievement_definition (
				key,
				type,
				title,
				description,
				icon_identifier,
				accent_color_token,
				criteria,
				repeatable,
				related_behavior
			)
			values (
				${definition.key},
				${definition.type},
				${definition.title},
				${definition.description},
				${definition.iconIdentifier},
				${definition.accentColorToken},
				${JSON.stringify(definition.criteria)}::jsonb,
				${definition.repeatable},
				${definition.relatedBehavior || ""}
			)
			on conflict (key) do update set
				type = excluded.type,
				title = excluded.title,
				description = excluded.description,
				icon_identifier = excluded.icon_identifier,
				accent_color_token = excluded.accent_color_token,
				criteria = excluded.criteria,
				repeatable = excluded.repeatable,
				related_behavior = excluded.related_behavior,
				updated_at = now()
		`;
	}
}

export async function awardAchievement(
	sql: NeonQueryFunction<false, false>,
	input: {
		userId: string;
		definitionKey: string;
		relatedBookId?: number;
		relatedSeriesId?: number;
		scopeKey?: string;
		visibility?: AchievementVisibility;
		earnedAt?: string;
		metadata?: Record<string, unknown>;
	}
) {
	await ensureAchievementSchema(sql);
	const userId = cleanText(input.userId, 80);
	const definition = getAchievementDefinition(input.definitionKey);
	if (!userId || !definition) return null;
	const relatedBookId = positiveInt(input.relatedBookId);
	const relatedSeriesId = positiveInt(input.relatedSeriesId);
	const scopeKey = cleanText(input.scopeKey || input.metadata?.scopeKey || input.metadata?.year, 80);
	const visibility = normalizeVisibility(input.visibility);
	const earnedAt = cleanText(input.earnedAt, 40);
	const metadata = {
		...(input.metadata || {}),
		definitionKey: definition.key,
		scopeKey,
		achievementType: definition.type,
		iconIdentifier: definition.iconIdentifier,
		accentColorToken: definition.accentColorToken,
		title: renderAchievementTitle(definition, input.metadata),
		description: definition.description,
		criteria: definition.criteria,
		repeatable: definition.repeatable
	};
	const rows = await sql<Array<{ id: number; inserted: boolean }>>`
		with inserted as (
			insert into user_achievement (
				user_id,
				definition_key,
				related_book_id,
				related_series_id,
				scope_key,
				visibility,
				earned_at,
				metadata
			)
			values (
				${userId}::uuid,
				${definition.key},
				${relatedBookId > 0 ? relatedBookId : null},
				${relatedSeriesId > 0 ? relatedSeriesId : null},
				${scopeKey},
				${visibility},
				coalesce(nullif(${earnedAt}, '')::timestamptz, now()),
				${JSON.stringify(metadata)}::jsonb
			)
			on conflict do nothing
			returning id
		)
		select id, true as inserted from inserted
		union all
		select id, false as inserted
		from user_achievement
		where user_id = ${userId}::uuid
			and definition_key = ${definition.key}
			and coalesce(related_book_id, 0) = ${relatedBookId}
			and coalesce(related_series_id, 0) = ${relatedSeriesId}
			and scope_key = ${scopeKey}
		limit 1
	`;
	const row = rows[0];
	if (!row?.id) return null;
	return { id: positiveInt(row.id), inserted: row.inserted === true, definition };
}

export async function loadEarnedAchievements(
	sql: NeonQueryFunction<false, false>,
	userId: string,
	options?: { includeHidden?: boolean; limit?: number }
) {
	await ensureAchievementSchema(sql);
	const limit = Math.min(100, Math.max(1, Number(options?.limit || 36) || 36));
	const rows = await sql<Array<{
		id: number;
		user_id: string;
		definition_key: string;
		scope_key: string;
		type: string;
		title: string;
		description: string;
		icon_identifier: string;
		accent_color_token: string;
		criteria: unknown;
		repeatable: boolean;
		earned_at: string;
		related_book_id: number | null;
		related_book_title: string | null;
		related_series_id: number | null;
		related_series_name: string | null;
		visibility: string;
		metadata: unknown;
	}>>`
		select
			ua.id,
			ua.user_id::text as user_id,
			ua.definition_key,
			ua.scope_key,
			ad.type,
			ad.title,
			ad.description,
			ad.icon_identifier,
			ad.accent_color_token,
			ad.criteria,
			ad.repeatable,
			ua.earned_at::text as earned_at,
			ua.related_book_id,
			coalesce(b.title, '') as related_book_title,
			ua.related_series_id,
			coalesce(s.name, ua.metadata->>'seriesName', '') as related_series_name,
			ua.visibility,
			ua.metadata
		from user_achievement ua
		join achievement_definition ad on ad.key = ua.definition_key
		left join book b on b.id = ua.related_book_id
		left join series s on s.id = ua.related_series_id
		where ua.user_id = ${cleanText(userId, 80)}::uuid
			${options?.includeHidden ? sql`` : sql`and ua.visibility = 'public'`}
		order by ua.earned_at desc, ua.id desc
		limit ${limit}
	`;
	return rows.map((row): EarnedAchievement => {
		const metadata = asRecord(row.metadata);
		const fallbackDefinition = getAchievementDefinition(row.definition_key);
		const definition: AchievementDefinition = {
			key: cleanText(row.definition_key, 120),
			type: row.type === "series_completion" || row.type === "yearly_goal" ? row.type : "reading_streak",
			title: cleanText(row.title, 180),
			description: cleanText(row.description, 280),
			iconIdentifier: cleanText(row.icon_identifier, 80) || fallbackDefinition?.iconIdentifier || "workspace_premium",
			accentColorToken: cleanText(row.accent_color_token, 80) || fallbackDefinition?.accentColorToken || "--color-primary",
			criteria: asRecord(row.criteria),
			repeatable: row.repeatable === true,
			howEarned: fallbackDefinition?.howEarned || cleanText(metadata.howEarned, 180)
		};
		const relatedSeriesName = cleanText(row.related_series_name || metadata.seriesName, 160);
		return {
			id: positiveInt(row.id),
			userId: cleanText(row.user_id, 80),
			definitionKey: definition.key,
			scopeKey: cleanText(row.scope_key || metadata.scopeKey, 80),
			type: definition.type,
			title: renderAchievementTitle(definition, { seriesName: relatedSeriesName }),
			description: definition.description,
			iconIdentifier: definition.iconIdentifier,
			accentColorToken: definition.accentColorToken,
			criteria: definition.criteria,
			repeatable: definition.repeatable,
			howEarned: definition.howEarned,
			earnedAt: cleanText(row.earned_at, 80),
			relatedBookId: positiveInt(row.related_book_id),
			relatedBookTitle: cleanText(row.related_book_title || metadata.bookTitle, 180),
			relatedSeriesId: positiveInt(row.related_series_id),
			relatedSeriesName,
			visibility: normalizeVisibility(row.visibility),
			metadata
		};
	});
}

export function achievementAnchor(id: number) {
	return `achievement-${positiveInt(id)}`;
}
