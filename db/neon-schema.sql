-- Dogeared Neon schema for user-driven shelves and Top 20 genre lists.
-- Run this once in Neon SQL Editor (or through your migration tool).

create extension if not exists pgcrypto;

create table if not exists app_user (
	id uuid primary key default gen_random_uuid(),
	user_key text not null unique,
	username text,
	email_hash text unique,
	email_enc bytea,
	profile_data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create unique index if not exists idx_app_user_username_lower on app_user (lower(username)) where username is not null;
create unique index if not exists idx_app_user_email_hash on app_user(email_hash) where email_hash is not null;

create table if not exists auth_magic_link (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references app_user(id) on delete cascade,
	token_hash text not null unique,
	requested_ip text not null default '',
	user_agent text not null default '',
	expires_at timestamptz not null,
	used_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_auth_magic_link_user on auth_magic_link(user_id);
create index if not exists idx_auth_magic_link_expires on auth_magic_link(expires_at);

create table if not exists auth_session (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references app_user(id) on delete cascade,
	session_hash text not null unique,
	expires_at timestamptz not null,
	revoked_at timestamptz,
	last_seen_at timestamptz not null default now(),
	created_at timestamptz not null default now()
);

create index if not exists idx_auth_session_user on auth_session(user_id);
create index if not exists idx_auth_session_expires on auth_session(expires_at);

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
);

create index if not exists idx_account_email_change_user on account_email_change(user_id, created_at desc);
create index if not exists idx_account_email_change_token on account_email_change(token_hash);
create index if not exists idx_account_email_change_expires on account_email_change(expires_at);

create table if not exists feedback_submission_event (
	id bigserial primary key,
	user_id uuid references app_user(id) on delete set null,
	ip_hash text not null default '',
	feedback_type text not null default 'general',
	created_at timestamptz not null default now()
);

create index if not exists idx_feedback_submission_event_ip on feedback_submission_event(ip_hash, created_at desc);
create index if not exists idx_feedback_submission_event_user on feedback_submission_event(user_id, created_at desc);

create table if not exists author (
	id bigserial primary key,
	name text not null unique,
	bio text not null default '',
	photo_url text not null default '',
	bio_source text not null default '',
	bio_source_url text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists book (
	id bigserial primary key,
	canonical_work_key text not null unique,
	title text not null,
	primary_author text not null default '',
	author_id bigint references author(id) on delete set null,
	isbn13 text not null default '',
	isbn10 text not null default '',
	google_books_id text not null default '',
	synopsis text not null default '',
	cover_url text not null default '',
	language text not null default '',
	page_count int not null default 0,
	publisher text not null default '',
	published_year int,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists book_source (
	id bigserial primary key,
	book_id bigint not null references book(id) on delete cascade,
	source text not null check (source in ('google_books', 'open_library', 'nyt')),
	source_key text not null,
	source_work_id text not null default '',
	source_edition_id text not null default '',
	source_url text not null default '',
	last_synced_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique (source, source_key)
);

create table if not exists book_genre (
	book_id bigint not null references book(id) on delete cascade,
	genre_slug text not null,
	genre_name text not null,
	created_at timestamptz not null default now(),
	primary key (book_id, genre_slug)
);

create table if not exists series (
	id bigserial primary key,
	name text not null,
	slug text not null unique,
	description text not null default '',
	cover_url text not null default '',
	total_books int not null default 0,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists series_book (
	series_id bigint not null references series(id) on delete cascade,
	book_id bigint references book(id) on delete set null,
	title_override text not null default '',
	book_order numeric,
	publication_order numeric,
	chronological_order numeric,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (book_id is not null or trim(title_override) <> '')
);

create table if not exists collection (
	id bigserial primary key,
	title text not null,
	slug text not null unique,
	subtitle text not null default '',
	description text not null default '',
	editorial_introduction text not null default '',
	hero_image text not null default '',
	category text not null default '',
	featured boolean not null default false,
	publication_state text not null default 'draft' check (publication_state in ('draft', 'published', 'archived')),
	sort_order int not null default 0,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists collection_book (
	collection_id bigint not null references collection(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	sort_order int not null default 0,
	editor_note text not null default '',
	featured_quote text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (collection_id, book_id)
);

create table if not exists user_book (
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	status text not null check (status in ('want_to_read', 'reading', 'finished')),
	rating int,
	total_pages int not null default 0,
	current_page int not null default 0,
	finished_date date,
	finished_reflection text not null default '',
	review_title text not null default '',
	review_spoiler boolean not null default false,
	review_updated_at timestamptz,
	first_added_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, book_id)
);

create table if not exists reading_journal_entry (
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	started_thoughts text not null default '',
	mid_book_notes text not null default '',
	finished_thoughts text not null default '',
	favorite_quote text not null default '',
	would_reread boolean,
	recommended_to text not null default '',
	personal_tags text[] not null default '{}',
	visibility text not null default 'private' check (visibility in ('private', 'friends', 'public', 'shared')),
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, book_id)
);

create table if not exists reading_journal_note (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint references book(id) on delete set null,
	entry_title text not null default '',
	body text not null default '',
	entry_at timestamptz not null default now(),
	progress_snapshot int,
	page_number int,
	chapter_location text not null default '',
	reading_position_type text not null default '' check (reading_position_type in ('', 'page', 'percent', 'chapter', 'location')),
	reading_position_value text not null default '',
	mood text not null default '',
	personal_tags text[] not null default '{}',
	visibility text not null default 'private' check (visibility in ('private', 'friends', 'public', 'shared')),
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists user_activity (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	event_type text not null check (event_type in ('want_to_read', 'reading', 'finished', 'rating')),
	rating int,
	created_at timestamptz not null default now()
);

create table if not exists user_follow (
	follower_user_id uuid not null references app_user(id) on delete cascade,
	followed_user_id uuid not null references app_user(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (follower_user_id, followed_user_id),
	check (follower_user_id <> followed_user_id)
);

create index if not exists idx_book_genre_slug on book_genre(genre_slug);
create index if not exists idx_book_source_book on book_source(book_id);
create index if not exists idx_book_source_source on book_source(source, source_work_id, source_edition_id);
create index if not exists idx_series_book_series_order on series_book(series_id, book_order, publication_order, chronological_order);
create index if not exists idx_series_book_book on series_book(book_id) where book_id is not null;
create unique index if not exists idx_series_book_unique_book on series_book(series_id, book_id) where book_id is not null;
create index if not exists idx_collection_public on collection(publication_state, featured, sort_order, title);
create index if not exists idx_collection_slug on collection(slug);
create index if not exists idx_collection_book_collection_order on collection_book(collection_id, sort_order, book_id);
create index if not exists idx_collection_book_book on collection_book(book_id);
create index if not exists idx_user_activity_user_created on user_activity(user_id, created_at desc);
create index if not exists idx_user_book_status_updated on user_book(status, updated_at desc);
create index if not exists idx_user_book_book on user_book(book_id);
create index if not exists idx_reading_journal_user_updated on reading_journal_entry(user_id, updated_at desc);
create index if not exists idx_reading_journal_book on reading_journal_entry(book_id);
create index if not exists idx_reading_journal_visibility on reading_journal_entry(visibility);
create index if not exists idx_reading_journal_note_user_entry on reading_journal_note(user_id, entry_at desc, updated_at desc);
create index if not exists idx_reading_journal_note_book on reading_journal_note(user_id, book_id, entry_at desc);
create index if not exists idx_reading_journal_note_visibility on reading_journal_note(visibility);
create index if not exists idx_user_follow_follower on user_follow(follower_user_id, created_at desc);
create index if not exists idx_user_follow_followed on user_follow(followed_user_id, created_at desc);

create or replace function get_top_books_by_genre(
	p_genre_slug text,
	p_limit int default 20,
	p_window_days int default 120
)
returns table (
	book_id bigint,
	title text,
	primary_author text,
	cover_url text,
	score numeric,
	reader_count int,
	reading_count int,
	want_to_read_count int,
	finished_count int,
	last_activity_at timestamptz
)
language sql
stable
as $$
	with scoped as (
		select
			ub.book_id,
			ub.user_id,
			ub.status,
			ub.updated_at
		from user_book ub
		where ub.updated_at >= now() - make_interval(days => greatest(p_window_days, 1))
	),
	aggregated as (
		select
			s.book_id,
			count(distinct s.user_id)::int as reader_count,
			sum(case when s.status = 'reading' then 1 else 0 end)::int as reading_count,
			sum(case when s.status = 'want_to_read' then 1 else 0 end)::int as want_to_read_count,
			sum(case when s.status = 'finished' then 1 else 0 end)::int as finished_count,
			max(s.updated_at) as last_activity_at,
			sum(
				case
					when s.status = 'reading' then 3
					when s.status = 'finished' then 2
					else 1
				end
			)::numeric as weighted_status_total
		from scoped s
		group by s.book_id
	)
	select
		b.id as book_id,
		b.title,
		b.primary_author,
		b.cover_url,
		(a.reader_count * 2 + a.weighted_status_total) as score,
		a.reader_count,
		a.reading_count,
		a.want_to_read_count,
		a.finished_count,
		a.last_activity_at
	from aggregated a
	join book b on b.id = a.book_id
	join book_genre bg on bg.book_id = b.id
	where bg.genre_slug = p_genre_slug
	order by score desc, a.reader_count desc, a.last_activity_at desc, b.id desc
	limit greatest(1, least(p_limit, 50));
$$;
