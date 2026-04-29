import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";
import { resolvePrivacySettings, resolveViewerProfileAccess } from "../../../lib/privacy";

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
		favoriteAuthor: normalizeProfileText(source.favoriteAuthor, 120),
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
		const session = await resolveUserBySession(request);
		const viewerUserId = String(session?.userId || "");
		const requestedUsername = normalizeText(url.searchParams.get("username")).toLowerCase();

		const sql = getNeonSql();
		let rows: Array<{ id: string; username: string | null; profile_data: unknown }> = [];
		if (requestedUsername) {
			rows = await sql<Array<{ id: string; username: string | null; profile_data: unknown }>>`
				select id::text as id, username, profile_data
				from app_user
				where lower(coalesce(username, '')) = ${requestedUsername}
				limit 1
			`;
		} else if (viewerUserId) {
			rows = await sql<Array<{ id: string; username: string | null; profile_data: unknown }>>`
				select id::text as id, username, profile_data
				from app_user
				where id = ${viewerUserId}::uuid
				limit 1
			`;
		}

		const row = rows[0];
		if (!row?.id) return json(200, { profile: null });

		const targetUserId = String(row.id || "");
		const privacy = resolvePrivacySettings(row.profile_data);
		const access = resolveViewerProfileAccess({
			viewerUserId,
			targetUserId,
			privacy
		});
		if (!access.canViewProfile) return json(200, { profile: null, visibility: { access, privacy } });

		const normalized = normalizeProfilePayload(row?.profile_data);
		if (!access.canViewLocation) normalized.location = "";
		return json(200, {
			profile: {
				...normalized,
				username: normalizeProfileText(row?.username, 40)
			},
			visibility: { access, privacy }
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
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to save profile info." });
		const body = await request.json() as { profile?: unknown };

		const profile = normalizeProfilePayload(body?.profile);
		const sql = getNeonSql();
		const existingRows = await sql<Array<{ settings: unknown }>>`
			select coalesce(profile_data->'settings', '{}'::jsonb) as settings
			from app_user
			where id = ${session.userId}::uuid
			limit 1
		`;
		const profileData = {
			...profile,
			settings: existingRows[0]?.settings || {}
		};
		await sql`
			update app_user
			set profile_data = ${JSON.stringify(profileData)}::jsonb
			where id = ${session.userId}::uuid
		`;

		const rows = await sql<Array<{ username: string | null }>>`
			select username
			from app_user
			where id = ${session.userId}::uuid
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
