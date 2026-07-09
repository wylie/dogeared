create table if not exists founding_reader_config (
	id integer primary key default 1 check (id = 1),
	mode text not null default 'open' check (mode in ('open', 'waitlist', 'invite_only')),
	target_capacity integer not null default 100 check (target_capacity > 0),
	auto_waitlist_at_capacity boolean not null default true,
	updated_at timestamptz not null default now()
);

insert into founding_reader_config (id, mode, target_capacity, auto_waitlist_at_capacity)
values (1, 'open', 100, true)
on conflict (id) do nothing;

create table if not exists founding_reader_waitlist (
	id bigserial primary key,
	email text not null,
	email_normalized text not null unique,
	display_name text not null default '',
	status text not null default 'pending' check (status in ('pending', 'approved', 'invited', 'joined', 'declined')),
	requested_at timestamptz not null default now(),
	approved_at timestamptz,
	invited_at timestamptz,
	joined_at timestamptz,
	declined_at timestamptz,
	updated_at timestamptz not null default now()
);

create index if not exists idx_founding_reader_waitlist_status_requested
	on founding_reader_waitlist(status, requested_at desc);

create index if not exists idx_founding_reader_waitlist_email_normalized
	on founding_reader_waitlist(email_normalized);
