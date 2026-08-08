import type { NeonQueryFunction } from "@neondatabase/serverless";

export type CustomShelfRow = {
	id: number;
	name: string;
	slug: string;
	position: number;
	icon?: string;
	book_count?: number;
};

export const CUSTOM_SHELF_ICON_OPTIONS = [
	"bookmarks",
	"flag",
	"local_fire_department",
	"psychology",
	"auto_stories",
	"rocket_launch",
	"favorite",
	"history_edu",
	"auto_awesome",
	"star",
	"lightbulb",
	"workspace_premium",
	"explore",
	"science",
	"library_music",
	"public"
] as const;

let customShelfSchemaReady: Promise<void> | null = null;

export function normalizeCustomShelfIcon(value: unknown) {
	const icon = String(value || "").trim();
	return CUSTOM_SHELF_ICON_OPTIONS.includes(icon as (typeof CUSTOM_SHELF_ICON_OPTIONS)[number])
		? icon
		: "bookmarks";
}

export function normalizeCustomShelfName(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function toCustomShelfSlug(name: string) {
	return normalizeCustomShelfName(name)
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

export async function ensureCustomShelfSchema(sql: NeonQueryFunction<false, false>) {
	if (!customShelfSchemaReady) {
		customShelfSchemaReady = (async () => {
			await sql`
				create table if not exists user_custom_shelf (
					id bigserial primary key,
					user_id uuid not null references app_user(id) on delete cascade,
					name text not null,
					slug text not null,
					position int not null default 0,
					created_at timestamptz not null default now(),
					updated_at timestamptz not null default now(),
					unique (user_id, slug)
				)
			`;
			await sql`alter table user_custom_shelf add column if not exists icon text not null default 'bookmarks'`;

			await sql`
				create table if not exists user_custom_shelf_book (
					user_id uuid not null references app_user(id) on delete cascade,
					shelf_id bigint not null references user_custom_shelf(id) on delete cascade,
					book_id bigint not null references book(id) on delete cascade,
					created_at timestamptz not null default now(),
					primary key (user_id, shelf_id, book_id)
				)
			`;

			await sql`
				create index if not exists idx_user_custom_shelf_user_position
				on user_custom_shelf (user_id, position, id)
			`;

			await sql`
				create index if not exists idx_user_custom_shelf_book_user_book
				on user_custom_shelf_book (user_id, book_id)
			`;
		})();
	}
	try {
		await customShelfSchemaReady;
	} catch (error) {
		customShelfSchemaReady = null;
		throw error;
	}
}

export async function resolveCustomShelfOptions(sql: NeonQueryFunction<false, false>, userId: string) {
	await ensureCustomShelfSchema(sql);
	const rows = await sql<Array<{ id: number; name: string; icon: string; position: number }>>`
		select id, name, icon, position
		from user_custom_shelf
		where user_id = ${userId}::uuid
		order by position asc, id asc
	`;
	return rows
		.map((row) => ({
			id: Math.max(0, Number(row.id || 0) || 0),
			name: String(row.name || "").trim(),
			icon: normalizeCustomShelfIcon(row.icon)
		}))
		.filter((row) => row.id > 0 && row.name)
		.slice(0, 24);
}
