import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { monitorEvent } from "../../../lib/monitoring";
import { publicReaderAccountFilterSql } from "../../../lib/publicReaderPolicy";

export const prerender = false;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

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

async function ensureCommentTable() {
	const sql = getNeonSql();
	await sql`
		create table if not exists user_activity_comment (
			id bigserial primary key,
			activity_id bigint not null references user_activity(id) on delete cascade,
			user_id uuid not null references app_user(id) on delete cascade,
			body text not null default '',
			created_at timestamptz not null default now(),
			check (char_length(trim(body)) between 1 and 500)
		)
	`;
	await sql`create index if not exists idx_user_activity_comment_activity on user_activity_comment(activity_id, created_at asc, id asc)`;
	await sql`create index if not exists idx_user_activity_comment_user on user_activity_comment(user_id, created_at desc)`;
}

async function ensureNotificationTable() {
	const sql = getNeonSql();
	await sql`
		create table if not exists user_notification (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			actor_user_id uuid not null references app_user(id) on delete cascade,
			activity_id bigint not null references user_activity(id) on delete cascade,
			type text not null check (type in ('activity_like', 'activity_comment')),
			created_at timestamptz not null default now(),
			read_at timestamptz null
		)
	`;
	await sql`create index if not exists idx_user_notification_user_read on user_notification(user_id, read_at, created_at desc)`;
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to load comments." });
		const activityId = normalizeActivityId(url.searchParams.get("activityId"));
		if (activityId <= 0) return json(400, { error: "Invalid activity id." });
		await ensureCommentTable();
		const sql = getNeonSql();
		const rows = await sql<Array<{
			id: number;
			body: string;
			created_at: string;
			user_id: string;
			username: string | null;
		}>>`
			select
				uac.id,
				uac.body,
				uac.created_at::text as created_at,
				uac.user_id::text as user_id,
				au.username
			from user_activity_comment uac
			join app_user au on au.id = uac.user_id
			where uac.activity_id = ${activityId}
				${publicReaderAccountFilterSql(sql)}
			order by uac.created_at asc, uac.id asc
			limit 100
		`;
		return json(200, {
			comments: rows.map((row) => ({
				id: Number(row.id || 0),
				body: normalizeText(row.body).slice(0, 500),
				createdAt: normalizeText(row.created_at),
				userId: normalizeText(row.user_id),
				username: normalizeText(row.username) || "reader",
				isMine: normalizeText(row.user_id) === session.userId
			}))
		});
	} catch (error) {
		return json(500, { error: "Failed to load comments.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			monitorEvent("activity.comment.unauthorized", {}, "warn");
			return json(401, { error: "You must be logged in to comment." });
		}
		const body = await request.json() as { activityId?: unknown; body?: unknown };
		const activityId = normalizeActivityId(body?.activityId);
		const message = normalizeText(body?.body).slice(0, 500);
		if (activityId <= 0) {
			monitorEvent("activity.comment.invalid_activity", { userId: session.userId }, "warn");
			return json(400, { error: "Invalid activity id." });
		}
		if (!message) {
			monitorEvent("activity.comment.empty", { userId: session.userId, activityId }, "warn");
			return json(400, { error: "Comment cannot be empty." });
		}
		await ensureCommentTable();
		await ensureNotificationTable();
		const sql = getNeonSql();
		const activityRows = await sql<Array<{ actor_user_id: string }>>`
			select user_id::text as actor_user_id
			from user_activity
			where id = ${activityId}
			limit 1
		`;
		if (activityRows.length === 0) {
			monitorEvent("activity.comment.activity_missing", { userId: session.userId, activityId }, "warn");
			return json(404, { error: "Activity not found." });
		}
		const inserted = await sql<Array<{ id: number; created_at: string; username: string | null }>>`
			with inserted as (
				insert into user_activity_comment (activity_id, user_id, body)
				values (${activityId}, ${session.userId}::uuid, ${message})
				returning id, created_at
			)
			select i.id, i.created_at::text as created_at, au.username
			from inserted i
			join app_user au on au.id = ${session.userId}::uuid
		`;
		const counts = await sql<Array<{ comment_count: number }>>`
			select count(*)::int as comment_count
			from user_activity_comment
			where activity_id = ${activityId}
		`;
		const ownerUserId = String(activityRows[0]?.actor_user_id || "");
		if (ownerUserId && ownerUserId !== session.userId) {
			await sql`
				insert into user_notification (user_id, actor_user_id, activity_id, type)
				values (${ownerUserId}::uuid, ${session.userId}::uuid, ${activityId}, 'activity_comment')
			`;
		}
		monitorEvent("activity.comment.success", { userId: session.userId, activityId, commentId: Number(inserted[0]?.id || 0) });
		return json(200, {
			ok: true,
			commentCount: Math.max(0, Number(counts[0]?.comment_count || 0)),
			comment: {
				id: Number(inserted[0]?.id || 0),
				body: message,
				createdAt: normalizeText(inserted[0]?.created_at),
				userId: session.userId,
				username: normalizeText(inserted[0]?.username) || "reader",
				isMine: true
			}
		});
	} catch (error) {
		monitorEvent("activity.comment.error", { message: error instanceof Error ? error.message : "Unknown error" }, "error");
		return json(500, { error: "Failed to post comment.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to delete comments." });
		const body = await request.json().catch(() => ({})) as { commentId?: unknown; activityId?: unknown };
		const commentId = normalizeActivityId(body?.commentId);
		const activityId = normalizeActivityId(body?.activityId);
		if (commentId <= 0) return json(400, { error: "Invalid comment id." });
		await ensureCommentTable();
		const sql = getNeonSql();
		const deleted = await sql<Array<{ id: number; activity_id: number }>>`
			delete from user_activity_comment
			where id = ${commentId}
				and user_id = ${session.userId}::uuid
			returning id, activity_id
		`;
		if (deleted.length === 0) return json(404, { error: "Comment not found." });
		const resolvedActivityId = Math.max(0, Number(deleted[0]?.activity_id || 0) || activityId);
		const counts = resolvedActivityId > 0
			? await sql<Array<{ comment_count: number }>>`
				select count(*)::int as comment_count
				from user_activity_comment
				where activity_id = ${resolvedActivityId}
			`
			: [{ comment_count: 0 }];
		return json(200, {
			ok: true,
			commentId,
			activityId: resolvedActivityId,
			commentCount: Math.max(0, Number(counts[0]?.comment_count || 0))
		});
	} catch (error) {
		return json(500, { error: "Failed to delete comment.", detail: error instanceof Error ? error.message : "Unknown error" });
	}
};
