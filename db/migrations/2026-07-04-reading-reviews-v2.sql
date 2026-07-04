alter table user_book add column if not exists rating int;
alter table user_book add column if not exists finished_reflection text not null default '';
alter table user_book add column if not exists review_title text not null default '';
alter table user_book add column if not exists review_spoiler boolean not null default false;
alter table user_book add column if not exists review_updated_at timestamptz;

update user_book
set review_updated_at = updated_at
where review_updated_at is null
	and char_length(trim(coalesce(finished_reflection, ''))) > 0;
