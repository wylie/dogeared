create table if not exists user_recommendation_feedback (
	user_id uuid not null references app_user(id) on delete cascade,
	book_id bigint not null references book(id) on delete cascade,
	feedback text not null check (feedback in ('interesting', 'not_interested')),
	source text not null default '',
	reason text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, book_id)
);

create index if not exists idx_recommendation_feedback_user_updated on user_recommendation_feedback(user_id, updated_at desc);
