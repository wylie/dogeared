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

alter table book add column if not exists author_id bigint references author(id) on delete set null;

insert into author (name)
select distinct trim(primary_author)
from book
where trim(coalesce(primary_author, '')) <> ''
on conflict (name) do nothing;

update book b
set author_id = a.id
from author a
where b.author_id is null
  and trim(coalesce(b.primary_author, '')) <> ''
  and a.name = trim(b.primary_author);

create index if not exists idx_book_author_id on book(author_id);
