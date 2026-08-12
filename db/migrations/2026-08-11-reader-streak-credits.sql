-- Administrative streak credits repair streak continuity without fabricating reading volume.

create table if not exists reader_streak_credit (
	id bigserial primary key,
	user_id uuid not null references app_user(id) on delete cascade,
	credit_date date not null,
	reason text not null default '',
	created_at timestamptz not null default now(),
	created_by_admin uuid references app_user(id) on delete set null,
	unique (user_id, credit_date)
);

create index if not exists idx_reader_streak_credit_user_date
	on reader_streak_credit(user_id, credit_date desc);

create index if not exists idx_reader_streak_credit_admin_created
	on reader_streak_credit(created_by_admin, created_at desc);
