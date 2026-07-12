-- Backfill canonical Work-level series metadata for common series that external
-- catalog sources do not expose consistently enough for reliable imports.

insert into series (name, slug, total_books, metadata)
values
	('Harry Potter', 'harry-potter', 7, '{"source":"known-series-v1"}'::jsonb),
	('The Lord of the Rings', 'the-lord-of-the-rings', 3, '{"source":"known-series-v1"}'::jsonb),
	('The Empyrean', 'the-empyrean', 3, '{"source":"known-series-v1"}'::jsonb),
	('Wings of Fire', 'wings-of-fire', 16, '{"source":"known-series-v1"}'::jsonb),
	('A Series of Unfortunate Events', 'a-series-of-unfortunate-events', 13, '{"source":"known-series-v1"}'::jsonb),
	('Mistborn', 'mistborn', 7, '{"source":"known-series-v1"}'::jsonb)
on conflict (slug) do update set
	name = excluded.name,
	total_books = greatest(series.total_books, excluded.total_books),
	metadata = series.metadata || excluded.metadata,
	updated_at = now();

with known_books(series_slug, series_name, total_books, book_order, title, match_title, author_key) as (
	values
		('harry-potter', 'Harry Potter', 7, 1, 'Harry Potter and the Sorcerer''s Stone', 'harry potter and the sorcerer s stone', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 1, 'Harry Potter and the Sorcerer''s Stone', 'harry potter and the philosopher s stone', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 2, 'Harry Potter and the Chamber of Secrets', 'harry potter and the chamber of secrets', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 3, 'Harry Potter and the Prisoner of Azkaban', 'harry potter and the prisoner of azkaban', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 4, 'Harry Potter and the Goblet of Fire', 'harry potter and the goblet of fire', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 5, 'Harry Potter and the Order of the Phoenix', 'harry potter and the order of the phoenix', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 6, 'Harry Potter and the Half-Blood Prince', 'harry potter and the half blood prince', 'rowling'),
		('harry-potter', 'Harry Potter', 7, 7, 'Harry Potter and the Deathly Hallows', 'harry potter and the deathly hallows', 'rowling'),
		('the-lord-of-the-rings', 'The Lord of the Rings', 3, 1, 'The Fellowship of the Ring', 'the fellowship of the ring', 'tolkien'),
		('the-lord-of-the-rings', 'The Lord of the Rings', 3, 1, 'The Fellowship of the Ring', 'fellowship of the ring', 'tolkien'),
		('the-lord-of-the-rings', 'The Lord of the Rings', 3, 2, 'The Two Towers', 'the two towers', 'tolkien'),
		('the-lord-of-the-rings', 'The Lord of the Rings', 3, 3, 'The Return of the King', 'the return of the king', 'tolkien'),
		('the-empyrean', 'The Empyrean', 3, 1, 'Fourth Wing', 'fourth wing', 'yarros'),
		('the-empyrean', 'The Empyrean', 3, 2, 'Iron Flame', 'iron flame', 'yarros'),
		('the-empyrean', 'The Empyrean', 3, 3, 'Onyx Storm', 'onyx storm', 'yarros'),
		('wings-of-fire', 'Wings of Fire', 16, 1, 'The Dragonet Prophecy', 'the dragonet prophecy', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 2, 'The Lost Heir', 'the lost heir', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 3, 'The Hidden Kingdom', 'the hidden kingdom', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 4, 'The Dark Secret', 'the dark secret', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 5, 'The Brightest Night', 'the brightest night', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 6, 'Moon Rising', 'moon rising', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 7, 'Winter Turning', 'winter turning', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 8, 'Escaping Peril', 'escaping peril', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 9, 'Talons of Power', 'talons of power', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 10, 'Darkness of Dragons', 'darkness of dragons', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 11, 'The Lost Continent', 'the lost continent', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 12, 'The Hive Queen', 'the hive queen', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 13, 'The Poison Jungle', 'the poison jungle', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 14, 'The Dangerous Gift', 'the dangerous gift', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 15, 'The Flames of Hope', 'the flames of hope', 'sutherland'),
		('wings-of-fire', 'Wings of Fire', 16, 16, 'The Hybrid Prince', 'the hybrid prince', 'sutherland'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 1, 'The Bad Beginning', 'the bad beginning', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 2, 'The Reptile Room', 'the reptile room', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 3, 'The Wide Window', 'the wide window', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 4, 'The Miserable Mill', 'the miserable mill', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 5, 'The Austere Academy', 'the austere academy', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 6, 'The Ersatz Elevator', 'the ersatz elevator', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 7, 'The Vile Village', 'the vile village', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 8, 'The Hostile Hospital', 'the hostile hospital', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 9, 'The Carnivorous Carnival', 'the carnivorous carnival', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 10, 'The Slippery Slope', 'the slippery slope', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 11, 'The Grim Grotto', 'the grim grotto', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 12, 'The Penultimate Peril', 'the penultimate peril', 'snicket'),
		('a-series-of-unfortunate-events', 'A Series of Unfortunate Events', 13, 13, 'The End', 'the end', 'snicket'),
		('mistborn', 'Mistborn', 7, 1, 'Mistborn: The Final Empire', 'mistborn the final empire', 'sanderson'),
		('mistborn', 'Mistborn', 7, 1, 'Mistborn: The Final Empire', 'the final empire', 'sanderson'),
		('mistborn', 'Mistborn', 7, 2, 'The Well of Ascension', 'the well of ascension', 'sanderson'),
		('mistborn', 'Mistborn', 7, 3, 'The Hero of Ages', 'the hero of ages', 'sanderson'),
		('mistborn', 'Mistborn', 7, 4, 'The Alloy of Law', 'the alloy of law', 'sanderson'),
		('mistborn', 'Mistborn', 7, 5, 'Shadows of Self', 'shadows of self', 'sanderson'),
		('mistborn', 'Mistborn', 7, 6, 'The Bands of Mourning', 'the bands of mourning', 'sanderson'),
		('mistborn', 'Mistborn', 7, 7, 'The Lost Metal', 'the lost metal', 'sanderson')
),
canonical_known_books as (
	select distinct on (series_slug, book_order)
		series_slug,
		series_name,
		total_books,
		book_order,
		title
	from known_books
	order by series_slug, book_order, length(title) desc
)
insert into series_book (series_id, book_id, title_override, book_order, publication_order, chronological_order, metadata)
select
	s.id,
	null,
	k.title,
	k.book_order,
	k.book_order,
	k.book_order,
	'{"source":"known-series-v1"}'::jsonb
from canonical_known_books k
join series s on s.slug = k.series_slug
where not exists (
	select 1
	from series_book existing
	where existing.series_id = s.id
		and existing.book_id is null
		and existing.book_order = k.book_order
);

with known_books(series_slug, book_order, title, match_title, author_key) as (
	values
		('harry-potter', 1, 'Harry Potter and the Sorcerer''s Stone', 'harry potter and the sorcerer s stone', 'rowling'),
		('harry-potter', 1, 'Harry Potter and the Sorcerer''s Stone', 'harry potter and the philosopher s stone', 'rowling'),
		('harry-potter', 2, 'Harry Potter and the Chamber of Secrets', 'harry potter and the chamber of secrets', 'rowling'),
		('harry-potter', 3, 'Harry Potter and the Prisoner of Azkaban', 'harry potter and the prisoner of azkaban', 'rowling'),
		('harry-potter', 4, 'Harry Potter and the Goblet of Fire', 'harry potter and the goblet of fire', 'rowling'),
		('harry-potter', 5, 'Harry Potter and the Order of the Phoenix', 'harry potter and the order of the phoenix', 'rowling'),
		('harry-potter', 6, 'Harry Potter and the Half-Blood Prince', 'harry potter and the half blood prince', 'rowling'),
		('harry-potter', 7, 'Harry Potter and the Deathly Hallows', 'harry potter and the deathly hallows', 'rowling'),
		('the-lord-of-the-rings', 1, 'The Fellowship of the Ring', 'the fellowship of the ring', 'tolkien'),
		('the-lord-of-the-rings', 1, 'The Fellowship of the Ring', 'fellowship of the ring', 'tolkien'),
		('the-lord-of-the-rings', 2, 'The Two Towers', 'the two towers', 'tolkien'),
		('the-lord-of-the-rings', 3, 'The Return of the King', 'the return of the king', 'tolkien'),
		('the-empyrean', 1, 'Fourth Wing', 'fourth wing', 'yarros'),
		('the-empyrean', 2, 'Iron Flame', 'iron flame', 'yarros'),
		('the-empyrean', 3, 'Onyx Storm', 'onyx storm', 'yarros'),
		('wings-of-fire', 1, 'The Dragonet Prophecy', 'the dragonet prophecy', 'sutherland'),
		('wings-of-fire', 2, 'The Lost Heir', 'the lost heir', 'sutherland'),
		('wings-of-fire', 3, 'The Hidden Kingdom', 'the hidden kingdom', 'sutherland'),
		('wings-of-fire', 4, 'The Dark Secret', 'the dark secret', 'sutherland'),
		('wings-of-fire', 5, 'The Brightest Night', 'the brightest night', 'sutherland'),
		('wings-of-fire', 6, 'Moon Rising', 'moon rising', 'sutherland'),
		('wings-of-fire', 7, 'Winter Turning', 'winter turning', 'sutherland'),
		('wings-of-fire', 8, 'Escaping Peril', 'escaping peril', 'sutherland'),
		('wings-of-fire', 9, 'Talons of Power', 'talons of power', 'sutherland'),
		('wings-of-fire', 10, 'Darkness of Dragons', 'darkness of dragons', 'sutherland'),
		('wings-of-fire', 11, 'The Lost Continent', 'the lost continent', 'sutherland'),
		('wings-of-fire', 12, 'The Hive Queen', 'the hive queen', 'sutherland'),
		('wings-of-fire', 13, 'The Poison Jungle', 'the poison jungle', 'sutherland'),
		('wings-of-fire', 14, 'The Dangerous Gift', 'the dangerous gift', 'sutherland'),
		('wings-of-fire', 15, 'The Flames of Hope', 'the flames of hope', 'sutherland'),
		('wings-of-fire', 16, 'The Hybrid Prince', 'the hybrid prince', 'sutherland'),
		('a-series-of-unfortunate-events', 1, 'The Bad Beginning', 'the bad beginning', 'snicket'),
		('a-series-of-unfortunate-events', 2, 'The Reptile Room', 'the reptile room', 'snicket'),
		('a-series-of-unfortunate-events', 3, 'The Wide Window', 'the wide window', 'snicket'),
		('a-series-of-unfortunate-events', 4, 'The Miserable Mill', 'the miserable mill', 'snicket'),
		('a-series-of-unfortunate-events', 5, 'The Austere Academy', 'the austere academy', 'snicket'),
		('a-series-of-unfortunate-events', 6, 'The Ersatz Elevator', 'the ersatz elevator', 'snicket'),
		('a-series-of-unfortunate-events', 7, 'The Vile Village', 'the vile village', 'snicket'),
		('a-series-of-unfortunate-events', 8, 'The Hostile Hospital', 'the hostile hospital', 'snicket'),
		('a-series-of-unfortunate-events', 9, 'The Carnivorous Carnival', 'the carnivorous carnival', 'snicket'),
		('a-series-of-unfortunate-events', 10, 'The Slippery Slope', 'the slippery slope', 'snicket'),
		('a-series-of-unfortunate-events', 11, 'The Grim Grotto', 'the grim grotto', 'snicket'),
		('a-series-of-unfortunate-events', 12, 'The Penultimate Peril', 'the penultimate peril', 'snicket'),
		('a-series-of-unfortunate-events', 13, 'The End', 'the end', 'snicket'),
		('mistborn', 1, 'Mistborn: The Final Empire', 'mistborn the final empire', 'sanderson'),
		('mistborn', 1, 'Mistborn: The Final Empire', 'the final empire', 'sanderson'),
		('mistborn', 2, 'The Well of Ascension', 'the well of ascension', 'sanderson'),
		('mistborn', 3, 'The Hero of Ages', 'the hero of ages', 'sanderson'),
		('mistborn', 4, 'The Alloy of Law', 'the alloy of law', 'sanderson'),
		('mistborn', 5, 'Shadows of Self', 'shadows of self', 'sanderson'),
		('mistborn', 6, 'The Bands of Mourning', 'the bands of mourning', 'sanderson'),
		('mistborn', 7, 'The Lost Metal', 'the lost metal', 'sanderson')
),
matched_books as (
	select distinct on (s.id, b.id)
		s.id as series_id,
		b.id as book_id,
		b.work_id,
		k.book_order
	from known_books k
	join series s on s.slug = k.series_slug
	join book b on
		btrim(regexp_replace(lower(coalesce(b.title, '')), '[^a-z0-9]+', ' ', 'g')) in (k.match_title, regexp_replace(k.match_title, '^(the|a|an) ', ''))
		and btrim(regexp_replace(lower(coalesce(b.primary_author, '')), '[^a-z0-9]+', ' ', 'g')) like '%' || k.author_key || '%'
	order by s.id, b.id, k.book_order asc
)
insert into series_book (series_id, book_id, title_override, book_order, publication_order, chronological_order, metadata)
select
	series_id,
	book_id,
	'',
	book_order,
	book_order,
	book_order,
	'{"source":"known-series-v1"}'::jsonb
from matched_books
on conflict do nothing;

with real_entries as (
	select series_id, book_order
	from series_book
	where book_id is not null
)
delete from series_book placeholder
using real_entries real_entry
where placeholder.series_id = real_entry.series_id
	and placeholder.book_id is null
	and placeholder.book_order = real_entry.book_order;

update book_work bw
set
	series_id = sb.series_id,
	series_position = sb.book_order,
	updated_at = now()
from book b
join series_book sb on sb.book_id = b.id
where b.work_id = bw.id
	and sb.book_id is not null
	and (bw.series_id is distinct from sb.series_id or bw.series_position is distinct from sb.book_order);
