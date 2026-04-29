-- Backfill explicit privacy defaults for all existing users.
-- Safe to run multiple times.

alter table app_user
	add column if not exists profile_data jsonb not null default '{}'::jsonb;

update app_user
set profile_data = jsonb_set(
	jsonb_set(
		jsonb_set(
			coalesce(profile_data, '{}'::jsonb),
			'{settings}',
			coalesce(profile_data->'settings', '{}'::jsonb),
			true
		),
		'{settings,privacy}',
		coalesce(profile_data->'settings'->'privacy', '{}'::jsonb),
		true
	),
	'{settings,privacy,profileVisibility}',
	to_jsonb(coalesce(nullif(profile_data->'settings'->'privacy'->>'profileVisibility', ''), 'public')),
	true
)
where coalesce(profile_data->'settings'->'privacy'->>'profileVisibility', '') = '';

update app_user
set profile_data = jsonb_set(
	coalesce(profile_data, '{}'::jsonb),
	'{settings,privacy,shareLocation}',
	to_jsonb(true),
	true
)
where profile_data->'settings'->'privacy'->'shareLocation' is null;

update app_user
set profile_data = jsonb_set(
	coalesce(profile_data, '{}'::jsonb),
	'{settings,privacy,shareActivity}',
	to_jsonb(true),
	true
)
where profile_data->'settings'->'privacy'->'shareActivity' is null;
