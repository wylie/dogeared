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

create index if not exists idx_reading_journal_user_updated on reading_journal_entry(user_id, updated_at desc);
create index if not exists idx_reading_journal_book on reading_journal_entry(book_id);
create index if not exists idx_reading_journal_visibility on reading_journal_entry(visibility);
