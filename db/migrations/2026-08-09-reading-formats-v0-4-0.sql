-- DogEared v0.4.0: reading formats belong to a reader's shelf/progress instance.

alter table user_book
	add column if not exists reading_format text not null default 'unknown';

update user_book
set reading_format = 'unknown'
where reading_format is null
	or reading_format not in ('unknown', 'physical', 'ebook', 'audio');

do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'user_book_reading_format_check'
	) then
		alter table user_book
			add constraint user_book_reading_format_check
			check (reading_format in ('unknown', 'physical', 'ebook', 'audio'));
	end if;
end $$;

create index if not exists idx_user_book_user_reading_format
	on user_book(user_id, reading_format, status);
