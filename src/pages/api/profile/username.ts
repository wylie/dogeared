import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { canSetUsername } from "../../../lib/usernamePolicy";

export const prerender = false;

function normalizeUsername(value: unknown) {
	return String(value || "")
		.trim()
		.toLowerCase()
		replace(/^@+/, "")
		.replace(/[^a-z0-9._-]/g, "")
		.slice(0, 40);
}

async function ensureUsernameSchema() {
	const sql = getNeonSql();
	await sql`alter table app_user add column if not exists username text`;
	await sql`create unique index if not exists idx_app_user_username_lower on app_user (lower(username)) where username is not null`;
}

async function lookupByUsername(username: string) {
	const sql = getNeonSql();
	const rows = await sql<{ id: string }[]>`
		select id
		from app_user
		where lower(coalesce(username, '')) = lower(${username})
		limit 1
	`;
	return String(rows[0]?.id || "");
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		await ensureUsernameSchema();
		const normalized = normalizeUsername(url.searchParams.get("username"));
		if (!normalized) return json(200, { available: false, normalized, reason: "Username is required." });
		if (normalized.length < 3) return json(200, { available: false, normalized, reason: "Use at least 3 characters." });

		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to validate usernames." });
		const currentUserId = session.userId;
		const existingUserId = await lookupByUsername(normalized);
		const ownedByCurrentUser = !!existingUserId && existingUserId === currentUserId;
		const available = !existingUserId || ownedByCurrentUser;
		return json(200, {
			available,
			ownedByCurrentUser,
			normalized,
			reason: available ? "" : "That username is already taken."
		});
	} catch (error) {
		return json(500, {
			error: "Failed to validate username.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		await ensureUsernameSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to save usernames." });
		const body = await request.json() as { username?: unknown };
		const normalized = normalizeUsername(body?.username);
		const userId = session.userId;

		const sql = getNeonSql();
		const currentRows = await sql<Array<{ username: string | null }>>`
			select username
			from app_user
			where id = ${userId}::uuid
			limit 1
		`;
		if (!normalized) {
			const mutableCheck = canSetUsername(currentRows[0]?.username, normalized);
			if (!mutableCheck.ok) {
				return json(409, { error: mutableCheck.error, username: normalizeUsername(currentRows[0]?.username) });
			}
			await sql`update app_user set username = null where id = ${userId}::uuid`;
			return json(200, { ok: true, username: "" });
		}
		if (normalized.length < 3) {
			return json(400, { error: "Username must be at least 3 characters.", username: normalized });
		}
		const mutableCheck = canSetUsername(currentRows[0]?.username, normalized);
		if (!mutableCheck.ok) {
			return json(409, { error: mutableCheck.error, username: normalizeUsername(currentRows[0]?.username) });
		}

		const existingUserId = await lookupByUsername(normalized);
		if (existingUserId && existingUserId !== userId) {
			return json(409, { error: "Username already taken.", username: normalized });
		}

		await sql`update app_user set username = ${normalized} where id = ${userId}::uuid`;
		return json(200, { ok: true, username: normalized });
	} catch (error) {
		return json(500, {
			error: "Failed to save username.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
