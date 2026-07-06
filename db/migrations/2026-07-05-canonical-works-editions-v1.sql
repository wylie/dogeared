-- Canonical Works & Editions Architecture v1.
--
-- `book` remains the backwards-compatible catalog row and foreign-key target.
-- `book_work` introduces the reader-facing intellectual work.
-- `book_edition` stores edition-specific identifiers and metadata.
-- Existing user data is moved to one representative `book` per work while
-- duplicate catalog rows remain available as editions.

create table if not exists book_work (
	id bigserial primary key,
	work_key text not null unique,
	title text not null,
	canonical_title text not null default '',
	primary_author text not null default '',
	author_id bigint references author(id) on delete set null,
	description text not null default '',
	subjects text[] not null default '{}',
	genres text[] not null default '{}',
	series_id bigint,
	series_position numeric,
	original_publication_year int,
	preferred_cover_url text not null default '',
	rating_average numeric,
	rating_count int not null default 0,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table book add column if not exists work_id bigint references book_work(id) on delete set null;

create table if not exists book_edition (
	id bigserial primary key,
	work_id bigint not null references book_work(id) on delete cascade,
	book_id bigint references book(id) on delete set null,
	edition_key text not null,
	isbn10 text not null default '',
	isbn13 text not null default '',
	publisher text not null default '',
	format text not null default '',
	language text not null default '',
	publication_date text not null default '',
	publication_year int,
	page_count int not null default 0,
	cover_url text not null default '',
	google_books_id text not null default '',
	open_library_work_id text not null default '',
	open_library_edition_id text not null default '',
	external_ids jsonb not null default '{}'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (work_id, edition_key)
);

alter table user_book add column if not exists edition_id bigint references book_edition(id) on delete set null;

create index if not exists idx_book_work_id on book(work_id);
create index if not exists idx_book_edition_work on book_edition(work_id);
create unique index if not exists idx_book_edition_book on book_edition(book_id) where book_id is not null;
create index if not exists idx_user_book_edition on user_book(edition_id) where edition_id is not null;

with source_books as (
	select
		b.*,
		'title_author:' ||
		coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
			lower(split_part(regexp_replace(regexp_replace(coalesce(b.title, ''), '\([^)]*\)', ' ', 'g'), '(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)', ' ', 'gi'), ':', 1)),
			'^(the|a|an)[[:space:]]+', '', 'g'
		), '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ''), 'untitled') ||
		'|' ||
		coalesce(nullif(btrim(regexp_replace(regexp_replace(lower(regexp_replace(coalesce(b.primary_author, ''), '^by[[:space:]]+', '', 'g')), '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ''), 'unknown') as work_key,
		coalesce(sc.shelf_count, 0) as shelf_count,
		coalesce(sc.rating_count, 0) as rating_count
	from book b
	left join lateral (
		select
			count(*)::int as shelf_count,
			count(*) filter (where rating is not null)::int as rating_count
		from user_book ub
		where ub.book_id = b.id
	) sc on true
),
representatives as (
	select distinct on (work_key)
		work_key,
		title,
		primary_author,
		author_id,
		synopsis,
		cover_url,
		published_year
	from source_books
	order by
		work_key,
		shelf_count desc,
		rating_count desc,
		(nullif(trim(cover_url), '') is not null) desc,
		(nullif(trim(synopsis), '') is not null) desc,
		id asc
)
insert into book_work (
	work_key,
	title,
	canonical_title,
	primary_author,
	author_id,
	description,
	original_publication_year,
	preferred_cover_url
)
select
	work_key,
	coalesce(nullif(trim(title), ''), 'Untitled'),
	coalesce(nullif(trim(title), ''), 'Untitled'),
	coalesce(nullif(trim(primary_author), ''), ''),
	author_id,
	coalesce(nullif(trim(synopsis), ''), ''),
	published_year,
	coalesce(nullif(trim(cover_url), ''), '')
from representatives
on conflict (work_key) do update set
	title = case when excluded.title <> '' then excluded.title else book_work.title end,
	canonical_title = case when excluded.canonical_title <> '' then excluded.canonical_title else book_work.canonical_title end,
	primary_author = case when excluded.primary_author <> '' then excluded.primary_author else book_work.primary_author end,
	author_id = coalesce(excluded.author_id, book_work.author_id),
	description = case when excluded.description <> '' then excluded.description else book_work.description end,
	original_publication_year = coalesce(book_work.original_publication_year, excluded.original_publication_year),
	preferred_cover_url = case when excluded.preferred_cover_url <> '' then excluded.preferred_cover_url else book_work.preferred_cover_url end,
	updated_at = now();

update book b
set work_id = bw.id
from book_work bw
where bw.work_key = (
	'title_author:' ||
	coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
		lower(split_part(regexp_replace(regexp_replace(coalesce(b.title, ''), '\([^)]*\)', ' ', 'g'), '(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)', ' ', 'gi'), ':', 1)),
		'^(the|a|an)[[:space:]]+', '', 'g'
	), '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ''), 'untitled') ||
	'|' ||
	coalesce(nullif(btrim(regexp_replace(regexp_replace(lower(regexp_replace(coalesce(b.primary_author, ''), '^by[[:space:]]+', '', 'g')), '[^a-z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')), ''), 'unknown')
)
and (b.work_id is distinct from bw.id);

insert into book_edition (
	work_id,
	book_id,
	edition_key,
	isbn10,
	isbn13,
	publisher,
	language,
	publication_year,
	page_count,
	cover_url,
	google_books_id
)
select
	b.work_id,
	b.id,
	'book:' || b.id::text,
	coalesce(nullif(trim(b.isbn10), ''), ''),
	coalesce(nullif(trim(b.isbn13), ''), ''),
	coalesce(nullif(trim(b.publisher), ''), ''),
	coalesce(nullif(trim(b.language), ''), ''),
	b.published_year,
	coalesce(nullif(b.page_count, 0), 0)::int,
	coalesce(nullif(trim(b.cover_url), ''), ''),
	coalesce(nullif(trim(b.google_books_id), ''), '')
from book b
where b.work_id is not null
on conflict (work_id, edition_key) do update set
	book_id = coalesce(book_edition.book_id, excluded.book_id),
	isbn10 = case when excluded.isbn10 <> '' then excluded.isbn10 else book_edition.isbn10 end,
	isbn13 = case when excluded.isbn13 <> '' then excluded.isbn13 else book_edition.isbn13 end,
	publisher = case when excluded.publisher <> '' then excluded.publisher else book_edition.publisher end,
	language = case when excluded.language <> '' then excluded.language else book_edition.language end,
	publication_year = coalesce(excluded.publication_year, book_edition.publication_year),
	page_count = greatest(book_edition.page_count, excluded.page_count),
	cover_url = case when excluded.cover_url <> '' then excluded.cover_url else book_edition.cover_url end,
	google_books_id = case when excluded.google_books_id <> '' then excluded.google_books_id else book_edition.google_books_id end,
	updated_at = now();

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (
		select
			count(*)::int as shelf_count,
			count(*) filter (where rating is not null)::int as rating_count,
			count(*) filter (where char_length(trim(coalesce(finished_reflection, ''))) > 0 or char_length(trim(coalesce(review_title, ''))) > 0)::int as review_count
		from user_book ub
		where ub.book_id = b.id
	) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, coalesce(sc.review_count, 0) desc, coalesce(sc.rating_count, 0) desc, b.id asc
)
insert into book_genre (book_id, genre_slug, genre_name)
select distinct r.representative_book_id, bg.genre_slug, bg.genre_name
from book_genre bg
join book b on b.id = bg.book_id
join representative r on r.work_id = b.work_id
on conflict (book_id, genre_slug) do update set genre_name = excluded.genre_name;

do $$
begin
	if to_regclass('public.book_tag') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		insert into book_tag (book_id, tag_slug, tag_name)
		select distinct r.representative_book_id, bt.tag_slug, bt.tag_name
		from book_tag bt
		join book b on b.id = bt.book_id
		join representative r on r.work_id = b.work_id
		on conflict (book_id, tag_slug) do update set tag_name = excluded.tag_name;
	end if;
end $$;

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (
		select
			count(*)::int as shelf_count,
			count(*) filter (where rating is not null)::int as rating_count,
			count(*) filter (where char_length(trim(coalesce(finished_reflection, ''))) > 0 or char_length(trim(coalesce(review_title, ''))) > 0)::int as review_count
		from user_book ub
		where ub.book_id = b.id
	) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, coalesce(sc.review_count, 0) desc, coalesce(sc.rating_count, 0) desc, b.id asc
),
merged as (
	select
		ub.user_id,
		r.representative_book_id as book_id,
		(array_agg(ub.status order by case ub.status when 'finished' then 3 when 'reading' then 2 else 1 end desc, ub.updated_at desc))[1] as status,
		(array_agg(ub.rating order by (ub.rating is not null) desc, ub.updated_at desc))[1] as rating,
		max(ub.total_pages) as total_pages,
		max(ub.current_page) as current_page,
		(array_remove(array_agg(ub.finished_date order by (ub.finished_date is not null) desc, ub.updated_at desc), null))[1] as finished_date,
		coalesce((array_remove(array_agg(nullif(trim(coalesce(ub.finished_reflection, '')), '') order by ub.review_updated_at desc nulls last, ub.updated_at desc), null))[1], '') as finished_reflection,
		coalesce((array_remove(array_agg(nullif(trim(coalesce(ub.review_title, '')), '') order by ub.review_updated_at desc nulls last, ub.updated_at desc), null))[1], '') as review_title,
		bool_or(coalesce(ub.review_spoiler, false)) as review_spoiler,
		max(ub.review_updated_at) as review_updated_at,
		min(ub.first_added_at) as first_added_at,
		max(ub.updated_at) as updated_at,
		(array_remove(array_agg(coalesce(ub.edition_id, be.id) order by ub.updated_at desc), null))[1] as edition_id
	from user_book ub
	join book b on b.id = ub.book_id
	join representative r on r.work_id = b.work_id
	left join book_edition be on be.book_id = ub.book_id
	group by ub.user_id, r.representative_book_id
)
insert into user_book (
	user_id,
	book_id,
	status,
	rating,
	total_pages,
	current_page,
	finished_date,
	finished_reflection,
	review_title,
	review_spoiler,
	review_updated_at,
	first_added_at,
	updated_at,
	edition_id
)
select
	user_id,
	book_id,
	status,
	rating,
	total_pages,
	current_page,
	finished_date,
	finished_reflection,
	review_title,
	review_spoiler,
	review_updated_at,
	first_added_at,
	updated_at,
	edition_id
from merged
on conflict (user_id, book_id) do update set
	status = excluded.status,
	rating = coalesce(excluded.rating, user_book.rating),
	total_pages = greatest(user_book.total_pages, excluded.total_pages),
	current_page = greatest(user_book.current_page, excluded.current_page),
	finished_date = coalesce(excluded.finished_date, user_book.finished_date),
	finished_reflection = case when excluded.finished_reflection <> '' then excluded.finished_reflection else user_book.finished_reflection end,
	review_title = case when excluded.review_title <> '' then excluded.review_title else user_book.review_title end,
	review_spoiler = excluded.review_spoiler or user_book.review_spoiler,
	review_updated_at = greatest(coalesce(user_book.review_updated_at, excluded.review_updated_at), coalesce(excluded.review_updated_at, user_book.review_updated_at)),
	first_added_at = least(coalesce(user_book.first_added_at, excluded.first_added_at), coalesce(excluded.first_added_at, user_book.first_added_at)),
	updated_at = greatest(coalesce(user_book.updated_at, excluded.updated_at), coalesce(excluded.updated_at, user_book.updated_at)),
	edition_id = coalesce(user_book.edition_id, excluded.edition_id);

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
)
delete from user_book ub
using book b, representative r
where b.id = ub.book_id
	and r.work_id = b.work_id
	and ub.book_id <> r.representative_book_id;

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
)
update user_activity ua
set book_id = r.representative_book_id
from book b
join representative r on r.work_id = b.work_id
where b.id = ua.book_id
	and ua.book_id <> r.representative_book_id;

do $$
begin
	if to_regclass('public.user_reading_progress_event') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		update user_reading_progress_event pe
		set book_id = r.representative_book_id
		from book b
		join representative r on r.work_id = b.work_id
		where b.id = pe.book_id
			and pe.book_id <> r.representative_book_id;
	end if;
end $$;

do $$
begin
	if to_regclass('public.reading_journal_note') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		update reading_journal_note j
		set book_id = r.representative_book_id
		from book b
		join representative r on r.work_id = b.work_id
		where b.id = j.book_id
			and j.book_id <> r.representative_book_id;
	end if;

	if to_regclass('public.reading_journal_entry') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		update reading_journal_entry j
		set book_id = r.representative_book_id
		from book b
		join representative r on r.work_id = b.work_id
		where b.id = j.book_id
			and j.book_id <> r.representative_book_id;
	end if;
end $$;

do $$
begin
	if to_regclass('public.user_custom_shelf_book') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		insert into user_custom_shelf_book (user_id, shelf_id, book_id, created_at)
		select distinct csb.user_id, csb.shelf_id, r.representative_book_id, min(csb.created_at)
		from user_custom_shelf_book csb
		join book b on b.id = csb.book_id
		join representative r on r.work_id = b.work_id
		group by csb.user_id, csb.shelf_id, r.representative_book_id
		on conflict do nothing;

		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		delete from user_custom_shelf_book csb
		using book b, representative r
		where b.id = csb.book_id
			and r.work_id = b.work_id
			and csb.book_id <> r.representative_book_id;
	end if;
end $$;

do $$
begin
	if to_regclass('public.series_book') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		insert into series_book (
			series_id,
			book_id,
			title_override,
			book_order,
			publication_order,
			chronological_order,
			metadata,
			created_at,
			updated_at
		)
		select distinct on (sb.series_id, r.representative_book_id)
			sb.series_id,
			r.representative_book_id,
			coalesce(nullif(trim(sb.title_override), ''), ''),
			sb.book_order,
			sb.publication_order,
			sb.chronological_order,
			coalesce(sb.metadata, '{}'::jsonb),
			sb.created_at,
			sb.updated_at
		from series_book sb
		join book b on b.id = sb.book_id
		join representative r on r.work_id = b.work_id
		order by sb.series_id, r.representative_book_id, sb.updated_at desc nulls last
		on conflict do nothing;

		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		delete from series_book sb
		using book b, representative r
		where b.id = sb.book_id
			and r.work_id = b.work_id
			and sb.book_id <> r.representative_book_id;
	end if;

	if to_regclass('public.collection_book') is not null then
		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		insert into collection_book (
			collection_id,
			book_id,
			sort_order,
			editor_note,
			featured_quote,
			created_at,
			updated_at
		)
		select distinct on (cb.collection_id, r.representative_book_id)
			cb.collection_id,
			r.representative_book_id,
			cb.sort_order,
			coalesce(nullif(trim(cb.editor_note), ''), ''),
			coalesce(nullif(trim(cb.featured_quote), ''), ''),
			cb.created_at,
			cb.updated_at
		from collection_book cb
		join book b on b.id = cb.book_id
		join representative r on r.work_id = b.work_id
		order by cb.collection_id, r.representative_book_id, cb.sort_order asc, cb.updated_at desc nulls last
		on conflict do nothing;

		with representative as (
			select distinct on (b.work_id)
				b.work_id,
				b.id as representative_book_id
			from book b
			left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
			where b.work_id is not null
			order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
		)
		delete from collection_book cb
		using book b, representative r
		where b.id = cb.book_id
			and r.work_id = b.work_id
			and cb.book_id <> r.representative_book_id;
	end if;
end $$;

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
)
insert into user_recommendation_feedback (user_id, book_id, feedback, source, reason, created_at, updated_at)
select
	rf.user_id,
	r.representative_book_id,
	(array_agg(rf.feedback order by case rf.feedback when 'not_interested' then 2 else 1 end desc, rf.updated_at desc))[1],
	coalesce((array_remove(array_agg(nullif(trim(rf.source), '') order by rf.updated_at desc), null))[1], ''),
	coalesce((array_remove(array_agg(nullif(trim(rf.reason), '') order by rf.updated_at desc), null))[1], ''),
	min(rf.created_at),
	max(rf.updated_at)
from user_recommendation_feedback rf
join book b on b.id = rf.book_id
join representative r on r.work_id = b.work_id
group by rf.user_id, r.representative_book_id
on conflict (user_id, book_id) do update set
	feedback = excluded.feedback,
	source = case when excluded.source <> '' then excluded.source else user_recommendation_feedback.source end,
	reason = case when excluded.reason <> '' then excluded.reason else user_recommendation_feedback.reason end,
	updated_at = greatest(user_recommendation_feedback.updated_at, excluded.updated_at);

with representative as (
	select distinct on (b.work_id)
		b.work_id,
		b.id as representative_book_id
	from book b
	left join lateral (select count(*)::int as shelf_count from user_book ub where ub.book_id = b.id) sc on true
	where b.work_id is not null
	order by b.work_id, coalesce(sc.shelf_count, 0) desc, b.id asc
)
delete from user_recommendation_feedback rf
using book b, representative r
where b.id = rf.book_id
	and r.work_id = b.work_id
	and rf.book_id <> r.representative_book_id;
