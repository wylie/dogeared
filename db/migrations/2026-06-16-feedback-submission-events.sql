create table if not exists feedback_submission_event (
	id bigserial primary key,
	user_id uuid references app_user(id) on delete set null,
	ip_hash text not null default '',
	feedback_type text not null default 'general',
	created_at timestamptz not null default now()
);

create index if not exists idx_feedback_submission_event_ip on feedback_submission_event(ip_hash, created_at desc);
create index if not exists idx_feedback_submission_event_user on feedback_submission_event(user_id, created_at desc);
