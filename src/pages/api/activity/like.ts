import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { createNotification } from "../../../lib/notifications";

export const prerender = false;

function normalizeActivityId(value: unknown) {
	const id = Number(value || 0);
	return Number.isFinite(id) ? Math.max(0, Math.trunc(id)) : 0;
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureActivityLikeTable() {
	const sql = getNeonSql();
	await sql`
		create table if not exists user_activity_like (
			activity_id bigint not null references user_activity(id) on delete cascade,
			user_id uuid not null references app_user(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (activity_id, user_id)
		)
	`;
	await sql`create index if not exists idx_user_activity_like_activity on user_activity_like(activity_id)`;
	await sql`create index if not exists idx_user_activity_like_user on user_activity_like(user_id, created_at desc)`;
}

async function resolveLikeState(activityId: number, viewerUserId: string) {
	const sql = getNeonSql();
	const rows = await sql<Array<{ like_count: number; viewer_liked: boolean }>>`
		select
			count(*)::int as like_count,
			bool_or(user_id = ${viewerUserId}::uuid) as viewer_liked
		from user_activity_like
		where activity_id = ${activityId}
	`;
	return {
		likeCount: Math.max(0, Number(rows[0]?.like_count || 0)),
		viewerLiked: !!rows[0]?.viewer_liked
	};
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to like activity." });
		const viewerUserId = session.userId;
		const body = await request.json() as { activityId?: unknown };
		const activityId = normalizeActivityId(body?.activityId);
		if (activityId <= 0) return json(400, { error: "Invalid activity id." });

		await ensureActivityLikeTable();
		const sql = getNeonSql();
		const activityRows = await sql<Array<{ actor_user_id: string }>>`
			select user_id::text as actor_user_id
			from user_activity
			where id = ${activityId}
			limit 1
		`;
		if (activityRows.length === 0) return json(404, { error: "Activity not found." });
		if (String(activityRows[0]?.actor_user_id || "") === viewerUserId) {
			return json(400, { error: "You cannot like your own activity." });
		}

		const insertedLike = await sql<Array<{ inserted: number }>>`
			with inserted as (
				insert into user_activity_like (activity_id, user_id)
				values (${activityId}, ${viewerUserId}::uuid)
				on conflict (activity_id, user_id) do nothing
				returning 1 as inserted
			)
			select coalesce(sum(inserted), 0)::int as inserted
			from inserted
		`;
		const likeInserted = Math.max(0, Number(insertedLike[0]?.inserted || 0)) > 0;
		if (likeInserted) {
			const ownerUserId = String(activityRows[0]?.actor_user_id || "");
			if (ownerUserId && ownerUserId !== viewerUserId) {
				await createNotification(sql, {
					userId: ownerUserId,
					actorUserId: viewerUserId,
					activityId,
					type: "activity_like",
					groupKey: `activity_like:${activityId}`
				});
			}
		}
		const state = await resolveLikeState(activityId, viewerUserId);
		return json(200, { ok: true, ...state });
	} catch (error) {
		return json(500, {
			error: "Failed to like activity.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to unlike activity." });
		const viewerUserId = session.userId;
		const body = await request.json() as { activityId?: unknown };
		const activityId = normalizeActivityId(body?.activityId);
		if (activityId <= 0) return json(400, { error: "Invalid activity id." });

		await ensureActivityLikeTable();
		const sql = getNeonSql();
		await sql`
			delete from user_activity_like
			where activity_id = ${activityId}
				and user_id = ${viewerUserId}::uuid
		`;
		const state = await resolveLikeState(activityId, viewerUserId);
		return json(200, { ok: true, ...state });
	} catch (error) {
		return json(500, {
			error: "Failed to unlike activity.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
