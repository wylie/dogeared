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

create index if not exists idx_series_book_series_order on series_book(series_id, book_order, publication_order, chronological_order);
create index if not exists idx_series_book_book on series_book(book_id) where book_id is not null;
create unique index if not exists idx_series_book_unique_book on series_book(series_id, book_id) where book_id is not null;
