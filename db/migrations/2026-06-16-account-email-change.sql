create table if not exists account_email_change (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references app_user(id) on delete cascade,
	new_email_hash text not null,
	new_email_enc bytea not null,
	token_hash text not null unique,
	requested_ip text not null default '',
	user_agent text not null default '',
	expires_at timestamptz not null,
	used_at timestamptz,
	created_at timestamptz not null default now(),
	verified_at timestamptz
);

create index if not exists idx_account_email_change_user on account_email_change(user_id, created_at desc);
create index if not exists idx_account_email_change_token on account_email_change(token_hash);
create index if not exists idx_account_email_change_expires on account_email_change(expires_at);
