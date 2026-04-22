import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveActiveUserId } from "../../../lib/auth";

export const prerender = false;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeProfileText(value: unknown, maxLength: number) {
	return normalizeText(value).slice(0, maxLength);
}

function normalizeProfilePayload(input: unknown) {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	const genres = Array.isArray(source.genres)
		? source.genres.map((item) => normalizeProfileText(item, 40)).filter(Boolean).slice(0, 20)
		: [];
	const avatar = normalizeText(source.avatar).slice(0, 500000);
	return {
		avatar: avatar.startsWith("data:image/") || /^https?:\/\//i.test(avatar) ? avatar : "",
		name: normalizeProfileText(source.name, 80),
		location: normalizeProfileText(source.location, 80),
		readingGoal: normalizeProfileText(source.readingGoal, 80),
		favoriteBook: normalizeProfileText(source.favoriteBook, 120),
		blurb: normalizeProfileText(source.blurb, 400),
		genres
	};
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureProfileSchema() {
	const sql = getNeonSql();
	await sql`alter table app_user add column if not exists profile_data jsonb not null default '{}'::jsonb`;
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		await ensureProfileSchema();
		const userKey = normalizeText(url.searchParams.get("userKey"));
		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) return json(200, { profile: null });

		const sql = getNeonSql();
		const rows = await sql<Array<{ username: string | null; profile_data: unknown }>>`
			select username, profile_data
			from app_user
			where id = ${userId}::uuid
			limit 1
		`;
		const row = rows[0];
		const normalized = normalizeProfilePayload(row?.profile_data);
		return json(200, {
			profile: {
				...normalized,
				username: normalizeProfileText(row?.username, 40)
			}
		});
	} catch (error) {
		return json(500, {
			error: "Failed to load profile info.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		await ensureProfileSchema();
		const body = await request.json() as { userKey?: unknown; profile?: unknown };
		const userKey = normalizeText(body?.userKey);
		const userId = await resolveActiveUserId(request, userKey);
		if (!userId) return json(500, { error: "Failed to resolve user." });

		const profile = normalizeProfilePayload(body?.profile);
		const sql = getNeonSql();
		await sql`
			update app_user
			set profile_data = ${JSON.stringify(profile)}::jsonb
			where id = ${userId}::uuid
		`;

		const rows = await sql<Array<{ username: string | null }>>`
			select username
			from app_user
			where id = ${userId}::uuid
			limit 1
		`;

		return json(200, {
			ok: true,
			profile: {
				...profile,
				username: normalizeProfileText(rows[0]?.username, 40)
			}
		});
	} catch (error) {
		return json(500, {
			error: "Failed to save profile info.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
