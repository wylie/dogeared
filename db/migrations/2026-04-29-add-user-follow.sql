create table if not exists user_follow (
	follower_user_id uuid not null references app_user(id) on delete cascade,
	followed_user_id uuid not null references app_user(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (follower_user_id, followed_user_id),
	check (follower_user_id <> followed_user_id)
);

create index if not exists idx_user_follow_follower on user_follow(follower_user_id, created_at desc);
create index if not exists idx_user_follow_followed on user_follow(followed_user_id, created_at desc);
