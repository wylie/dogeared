alter table book_edition
	add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table book_work
	add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists admin_catalog_audit_event (
	id bigserial primary key,
	admin_user_id uuid references app_user(id) on delete set null,
	entity_type text not null check (entity_type in ('work', 'edition')),
	entity_id bigint not null,
	changed_fields jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_admin_catalog_audit_entity
	on admin_catalog_audit_event(entity_type, entity_id, created_at desc);

create index if not exists idx_book_edition_format
	on book_edition(lower(format));

create index if not exists idx_book_edition_metadata_gin
	on book_edition using gin(metadata);
