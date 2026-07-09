create table if not exists admin_release_note (
	id bigserial primary key,
	version text not null default '',
	title text not null default '',
	body text not null default '',
	published_at timestamptz,
	created_at timestamptz not null default now()
);

alter table admin_release_note add column if not exists summary text not null default '';
alter table admin_release_note add column if not exists release_date date;
alter table admin_release_note add column if not exists published boolean not null default false;
alter table admin_release_note add column if not exists status text not null default 'draft';
alter table admin_release_note add column if not exists highlights text not null default '';
alter table admin_release_note add column if not exists bug_fixes text not null default '';
alter table admin_release_note add column if not exists known_issues text not null default '';
alter table admin_release_note add column if not exists migration_notes text not null default '';
alter table admin_release_note add column if not exists archived_at timestamptz;
alter table admin_release_note add column if not exists updated_at timestamptz not null default now();

update admin_release_note
set summary = body
where coalesce(summary, '') = ''
	and coalesce(body, '') <> '';

update admin_release_note
set published = true,
	status = 'published',
	release_date = coalesce(release_date, published_at::date)
where published_at is not null
	and published = false
	and status = 'draft';

create index if not exists idx_admin_release_note_published
	on admin_release_note(published_at desc, created_at desc);

create index if not exists idx_admin_release_note_status_date
	on admin_release_note(status, release_date desc, created_at desc);
