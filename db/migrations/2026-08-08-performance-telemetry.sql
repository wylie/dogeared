create table if not exists performance_event (
	id bigserial primary key,
	operation_name text not null,
	route text not null default '',
	total_ms numeric not null default 0,
	success boolean not null default true,
	http_status int not null default 0,
	release_version text not null default '',
	environment text not null default '',
	external_provider text not null default '',
	spans jsonb not null default '[]'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_performance_event_created
	on performance_event(created_at desc);

create index if not exists idx_performance_event_operation_created
	on performance_event(operation_name, created_at desc);

create index if not exists idx_performance_event_route_created
	on performance_event(route, created_at desc);

create index if not exists idx_performance_event_release_created
	on performance_event(release_version, created_at desc);

create index if not exists idx_performance_event_provider_created
	on performance_event(external_provider, created_at desc);

create index if not exists idx_performance_event_slow_created
	on performance_event(created_at desc, total_ms desc);
