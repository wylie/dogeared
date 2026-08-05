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
);

create table if not exists user_achievement (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	definition_key text not null references achievement_definition(key) on delete restrict,
	earned_at timestamptz not null default now(),
	related_book_id bigint references book(id) on delete set null,
	related_series_id bigint references series(id) on delete set null,
	visibility text not null default 'public',
	metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_user_achievement_unique_scope
	on user_achievement(user_id, definition_key, coalesce(related_series_id, 0), coalesce(related_book_id, 0));

create index if not exists idx_user_achievement_user_earned
	on user_achievement(user_id, earned_at desc);

create index if not exists idx_user_achievement_definition
	on user_achievement(definition_key, earned_at desc);

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
values
	('reading_streak_7', 'reading_streak', '7 Day Reading Streak', 'Your reading rhythm has held for 7 consecutive days.', 'local_fire_department', '--achievement-streak-7', '{"streakDays":7}'::jsonb, false, ''),
	('reading_streak_14', 'reading_streak', '14 Day Reading Streak', 'Your reading rhythm has held for 14 consecutive days.', 'local_fire_department', '--achievement-streak-14', '{"streakDays":14}'::jsonb, false, ''),
	('reading_streak_30', 'reading_streak', '30 Day Reading Streak', 'Your reading rhythm has held for 30 consecutive days.', 'local_fire_department', '--achievement-streak-30', '{"streakDays":30}'::jsonb, false, ''),
	('reading_streak_60', 'reading_streak', '60 Day Reading Streak', 'Your reading rhythm has held for 60 consecutive days.', 'local_fire_department', '--achievement-streak-60', '{"streakDays":60}'::jsonb, false, ''),
	('reading_streak_100', 'reading_streak', '100 Day Reading Streak', 'Your reading rhythm has held for 100 consecutive days.', 'local_fire_department', '--achievement-streak-100', '{"streakDays":100}'::jsonb, false, ''),
	('reading_streak_365', 'reading_streak', '365 Day Reading Streak', 'Your reading rhythm has held for 365 consecutive days.', 'local_fire_department', '--achievement-streak-365', '{"streakDays":365}'::jsonb, false, ''),
	('series_completion', 'series_completion', 'Finished {seriesName}', 'Reached the end of every currently available book in the series.', 'auto_stories', '--achievement-series-completion', '{"finishedAllCurrentlyAvailableBooks":true}'::jsonb, false, 'series')
on conflict (key) do update set
	type = excluded.type,
	title = excluded.title,
	description = excluded.description,
	icon_identifier = excluded.icon_identifier,
	accent_color_token = excluded.accent_color_token,
	criteria = excluded.criteria,
	repeatable = excluded.repeatable,
	related_behavior = excluded.related_behavior,
	updated_at = now();
