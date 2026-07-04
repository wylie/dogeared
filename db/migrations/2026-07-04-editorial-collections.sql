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

create index if not exists idx_collection_public on collection(publication_state, featured, sort_order, title);
create index if not exists idx_collection_slug on collection(slug);
create index if not exists idx_collection_book_collection_order on collection_book(collection_id, sort_order, book_id);
create index if not exists idx_collection_book_book on collection_book(book_id);
