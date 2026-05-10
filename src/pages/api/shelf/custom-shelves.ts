import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";
import {
	ensureCustomShelfSchema,
	normalizeCustomShelfIcon,
	normalizeCustomShelfName,
	toCustomShelfSlug
} from "../../../lib/customShelves";

export const prerender = false;

function json(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function resolveUniqueSlug(sql: ReturnType<typeof getNeonSql>, userId: string, baseName: string, excludeShelfId = 0) {
	const baseSlug = toCustomShelfSlug(baseName) || "shelf";
	for (let i = 0; i < 50; i += 1) {
		const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
		const rows = await sql<Array<{ id: number }>>`
			select id
			from user_custom_shelf
			where user_id = ${userId}::uuid
				and slug = ${candidate}
				and id <> ${excludeShelfId}
			limit 1
		`;
		if (rows.length === 0) return candidate;
	}
	return `${baseSlug}-${Date.now()}`;
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to view custom shelves." });
		const sql = getNeonSql();
		await ensureCustomShelfSchema(sql);
		const shelves = await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number; book_count: number }>>`
			select
				s.id,
				s.name,
				s.slug,
				s.icon,
				s.position,
				coalesce(count(sb.book_id), 0)::int as book_count
			from user_custom_shelf s
			left join user_custom_shelf_book sb
				on sb.shelf_id = s.id
				and sb.user_id = s.user_id
			where s.user_id = ${session.userId}::uuid
			group by s.id, s.name, s.slug, s.position
			order by s.position asc, s.id asc
		`;
		return json(200, { shelves });
	} catch (error) {
		return json(500, { error: "Failed to load custom shelves.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to create custom shelves." });
		const body = await request.json().catch(() => ({})) as { name?: unknown };
		const name = normalizeCustomShelfName(body.name);
		if (!name) return json(400, { error: "Shelf name is required." });
		const icon = normalizeCustomShelfIcon((body as { icon?: unknown }).icon);
		const sql = getNeonSql();
		await ensureCustomShelfSchema(sql);
		const slug = await resolveUniqueSlug(sql, session.userId, name);
		const inserted = await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
			with max_position as (
				select coalesce(max(position), -1) as max_pos
				from user_custom_shelf
				where user_id = ${session.userId}::uuid
			)
			insert into user_custom_shelf (user_id, name, slug, icon, position)
			select ${session.userId}::uuid, ${name}, ${slug}, ${icon}, max_pos + 1
			from max_position
			returning id, name, slug, icon, position
		`;
		return json(200, { shelf: inserted[0] || null });
	} catch (error) {
		return json(500, { error: "Failed to create custom shelf.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};

export const PATCH: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to update custom shelves." });
		const body = await request.json().catch(() => ({})) as {
			shelfId?: unknown;
			name?: unknown;
			position?: unknown;
			swapWithShelfId?: unknown;
			icon?: unknown;
		};
		const shelfId = Math.max(0, Number(body.shelfId || 0) || 0);
		if (!shelfId) return json(400, { error: "Shelf id is required." });
		const sql = getNeonSql();
		await ensureCustomShelfSchema(sql);
		const swapWithShelfId = Math.max(0, Number(body.swapWithShelfId || 0) || 0);
		if (swapWithShelfId > 0) {
			const shelfRows = await sql<Array<{ id: number; position: number }>>`
				select id, position
				from user_custom_shelf
				where user_id = ${session.userId}::uuid
					and id = any(${[shelfId, swapWithShelfId]}::bigint[])
				order by id asc
			`;
			if (shelfRows.length !== 2) return json(404, { error: "Custom shelf not found." });
			const source = shelfRows.find((row) => Number(row.id || 0) === shelfId);
			const target = shelfRows.find((row) => Number(row.id || 0) === swapWithShelfId);
			if (!source || !target) return json(404, { error: "Custom shelf not found." });
			await sql`
				update user_custom_shelf
				set
					position = case
						when id = ${source.id} then ${target.position}
						when id = ${target.id} then ${source.position}
						else position
					end,
					updated_at = now()
				where user_id = ${session.userId}::uuid
					and id = any(${[source.id, target.id]}::bigint[])
			`;
			const rows = await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
				select id, name, slug, icon, position
				from user_custom_shelf
				where user_id = ${session.userId}::uuid
					and id = ${shelfId}
				limit 1
			`;
			return json(200, { shelf: rows[0] || null });
		}
		let nextName = normalizeCustomShelfName(body.name);
		const nextIcon = normalizeCustomShelfIcon(body.icon);
		let nextSlug = "";
		const hasName = !!nextName;
		const hasIcon = String(body.icon || "").trim().length > 0;
		const position = Number(body.position);
		const hasPosition = Number.isFinite(position);
		if (!hasName && !hasPosition && !hasIcon) return json(400, { error: "No valid updates provided." });
		if (hasName) {
			nextSlug = await resolveUniqueSlug(sql, session.userId, nextName, shelfId);
		}
		const rows = hasName && hasPosition && hasIcon
			? await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
				update user_custom_shelf
				set
					name = ${nextName},
					slug = ${nextSlug},
					icon = ${nextIcon},
					position = ${Math.max(0, Math.floor(position))},
					updated_at = now()
				where id = ${shelfId}
					and user_id = ${session.userId}::uuid
				returning id, name, slug, icon, position
			`
			: (hasName && hasPosition
				? await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
					update user_custom_shelf
					set
						name = ${nextName},
						slug = ${nextSlug},
						position = ${Math.max(0, Math.floor(position))},
						updated_at = now()
					where id = ${shelfId}
						and user_id = ${session.userId}::uuid
					returning id, name, slug, icon, position
				`
				: (hasName && hasIcon
					? await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
						update user_custom_shelf
						set
							name = ${nextName},
							slug = ${nextSlug},
							icon = ${nextIcon},
							updated_at = now()
						where id = ${shelfId}
							and user_id = ${session.userId}::uuid
						returning id, name, slug, icon, position
					`
					: (hasName
						? await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
					update user_custom_shelf
					set
						name = ${nextName},
						slug = ${nextSlug},
						updated_at = now()
					where id = ${shelfId}
						and user_id = ${session.userId}::uuid
					returning id, name, slug, icon, position
				`
						: (hasPosition
							? await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
					update user_custom_shelf
					set
						position = ${Math.max(0, Math.floor(position))},
						updated_at = now()
					where id = ${shelfId}
						and user_id = ${session.userId}::uuid
					returning id, name, slug, icon, position
				`
							: await sql<Array<{ id: number; name: string; slug: string; icon: string; position: number }>>`
								update user_custom_shelf
								set
									icon = ${nextIcon},
									updated_at = now()
								where id = ${shelfId}
									and user_id = ${session.userId}::uuid
								returning id, name, slug, icon, position
							`))));
		if (rows.length === 0) return json(404, { error: "Custom shelf not found." });
		return json(200, { shelf: rows[0] });
	} catch (error) {
		return json(500, { error: "Failed to update custom shelf.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to delete custom shelves." });
		const body = await request.json().catch(() => ({})) as { shelfId?: unknown };
		const shelfId = Math.max(0, Number(body.shelfId || 0) || 0);
		if (!shelfId) return json(400, { error: "Shelf id is required." });
		const sql = getNeonSql();
		await ensureCustomShelfSchema(sql);
		await sql`
			delete from user_custom_shelf
			where id = ${shelfId}
				and user_id = ${session.userId}::uuid
		`;
		return json(200, { ok: true });
	} catch (error) {
		return json(500, { error: "Failed to delete custom shelf.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};
