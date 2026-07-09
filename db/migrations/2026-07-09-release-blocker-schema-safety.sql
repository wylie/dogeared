create extension if not exists pgcrypto;

alter table app_user add column if not exists updated_at timestamptz;
update app_user set updated_at = coalesce(updated_at, created_at, now());
alter table app_user alter column updated_at set default now();
alter table app_user alter column updated_at set not null;

create table if not exists user_activity_like (
	activity_id bigint not null references user_activity(id) on delete cascade,
	user_id uuid not null references app_user(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (activity_id, user_id)
);

create table if not exists user_activity_comment (
	id bigserial primary key,
	activity_id bigint not null references user_activity(id) on delete cascade,
	user_id uuid not null references app_user(id) on delete cascade,
	body text not null default '',
	created_at timestamptz not null default now(),
	check (char_length(trim(body)) between 1 and 500)
);

create table if not exists user_notification (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	actor_user_id uuid not null references app_user(id) on delete cascade,
	activity_id bigint not null references user_activity(id) on delete cascade,
	type text not null check (type in ('activity_like', 'activity_comment')),
	created_at timestamptz not null default now(),
	read_at timestamptz null
);

create table if not exists user_reading_progress_event (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	from_page int not null default 0,
	to_page int not null default 0,
	page_delta int not null default 0,
	recorded_at timestamptz not null default now()
);

create table if not exists user_custom_shelf (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	name text not null,
	slug text not null,
	icon text not null default 'bookmarks',
	position int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, slug)
);

alter table user_custom_shelf add column if not exists icon text not null default 'bookmarks';

create table if not exists user_custom_shelf_book (
	user_id uuid not null references app_user(id) on delete cascade,
	shelf_id bigint not null references user_custom_shelf(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (user_id, shelf_id, book_id)
);

create table if not exists feedback_submission (
	id bigserial primary key,
	tracking_number text not null default '',
	user_id uuid references app_user(id) on delete set null,
	email text not null default '',
	feedback_type text not null default 'general',
	severity text not null default '',
	status text not null default 'new',
	subject text not null default '',
	description text not null default '',
	expected_behavior text not null default '',
	actual_behavior text not null default '',
	steps_to_reproduce text not null default '',
	page_url text not null default '',
	route text not null default '',
	app_version text not null default '',
	git_commit text not null default '',
	browser text not null default '',
	operating_system text not null default '',
	screen_size text not null default '',
	viewport_size text not null default '',
	color_scheme text not null default '',
	language text not null default '',
	is_authenticated boolean not null default false,
	book_id text not null default '',
	author_id text not null default '',
	collection_id text not null default '',
	search_query text not null default '',
	recommendation_source text not null default '',
	diagnostic_context jsonb not null default '{}'::jsonb,
	screenshots jsonb not null default '[]'::jsonb,
	admin_notes text not null default '',
	needs_reply boolean not null default false,
	needs_reproduction boolean not null default false,
	is_duplicate boolean not null default false,
	duplicate_of text not null default '',
	resolved_in_version text not null default '',
	resolved_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists product_analytics_event (
	id bigserial primary key,
	user_id uuid references app_user(id) on delete set null,
	event_name text not null,
	event_group text not null default '',
	route text not null default '',
	source text not null default '',
	subject_type text not null default '',
	subject_id text not null default '',
	query text not null default '',
	result_count int not null default 0,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

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
);

create table if not exists admin_feature_flag (
	flag_key text primary key,
	label text not null default '',
	description text not null default '',
	enabled boolean not null default false,
	updated_at timestamptz not null default now()
);

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
);

create table if not exists admin_release_note (
	id bigserial primary key,
	version text not null default '',
	title text not null default '',
	body text not null default '',
	published_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_like_user on user_activity_like(user_id, created_at desc);
create index if not exists idx_user_activity_comment_activity on user_activity_comment(activity_id, created_at asc);
create index if not exists idx_user_activity_comment_user on user_activity_comment(user_id, created_at desc);
create index if not exists idx_user_notification_user_read on user_notification(user_id, read_at, created_at desc);
create index if not exists idx_user_reading_progress_user_recorded on user_reading_progress_event(user_id, recorded_at desc);
create index if not exists idx_user_reading_progress_book on user_reading_progress_event(book_id, recorded_at desc);
create index if not exists idx_user_custom_shelf_user_position on user_custom_shelf(user_id, position, id);
create index if not exists idx_user_custom_shelf_book_user_book on user_custom_shelf_book(user_id, book_id);
create index if not exists idx_feedback_submission_status_created on feedback_submission(status, created_at desc);
create index if not exists idx_feedback_submission_type_created on feedback_submission(feedback_type, created_at desc);
create index if not exists idx_feedback_submission_user_created on feedback_submission(user_id, created_at desc);
create index if not exists idx_product_analytics_event_name_created on product_analytics_event(event_name, created_at desc);
create index if not exists idx_product_analytics_event_group_created on product_analytics_event(event_group, created_at desc);
create index if not exists idx_product_analytics_event_user_created on product_analytics_event(user_id, created_at desc);
create index if not exists idx_product_analytics_event_query_created on product_analytics_event(query, created_at desc);
create index if not exists idx_product_analytics_event_source_created on product_analytics_event(source, created_at desc);
create index if not exists idx_admin_feedback_issue_status on admin_feedback_issue(status, created_at desc);
create index if not exists idx_admin_announcement_status on admin_announcement(status, updated_at desc);
create index if not exists idx_admin_release_note_published on admin_release_note(published_at desc, created_at desc);
