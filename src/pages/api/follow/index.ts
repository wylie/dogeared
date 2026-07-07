import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { resolvePublicProfileBundle } from "../../../lib/publicProfile";
import { canFollowUser } from "../../../lib/followPolicy";
import { createNotification } from "../../../lib/notifications";

export const prerender = false;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function resolveTarget(input: { username: string; viewerUserId: string }) {
	const bundle = await resolvePublicProfileBundle({
		username: input.username,
		viewerUserId: input.viewerUserId
	});
	if (!bundle.targetUserId) return null;
	return {
		targetUserId: bundle.targetUserId,
		followersCount: bundle.followersCount,
		followingCount: bundle.followingCount,
		isViewerFollowing: bundle.isViewerFollowing,
		allowFollowRequests: bundle.allowFollowRequests
	};
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		const viewerUserId = String(session?.userId || "");
		const username = normalizeText(url.searchParams.get("username"));
		const target = await resolveTarget({ username, viewerUserId });
		if (!target) return json(404, { error: "User not found." });
		return json(200, {
			followersCount: target.followersCount,
			followingCount: target.followingCount,
			isViewerFollowing: target.isViewerFollowing,
			canFollow: !!viewerUserId && viewerUserId !== target.targetUserId && target.allowFollowRequests
		});
	} catch (error) {
		return json(500, {
			error: "Failed to load follow status.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to follow users." });
		const viewerUserId = session.userId;
		const body = await request.json() as { username?: unknown };
		const username = normalizeText(body?.username);
		const target = await resolveTarget({ username, viewerUserId });
		if (!target) return json(404, { error: "User not found." });
		const followCheck = canFollowUser(viewerUserId, target.targetUserId);
		if (!followCheck.ok) return json(400, { error: followCheck.error });
		if (!target.allowFollowRequests) return json(403, { error: "This user is not accepting follow requests." });

		const sql = getNeonSql();
		const insertedRows = await sql<Array<{ inserted: number }>>`
			with inserted as (
				insert into user_follow (follower_user_id, followed_user_id)
				values (${viewerUserId}::uuid, ${target.targetUserId}::uuid)
				on conflict (follower_user_id, followed_user_id) do nothing
				returning 1 as inserted
			)
			select coalesce(sum(inserted), 0)::int as inserted
			from inserted
		`;
		if (Number(insertedRows[0]?.inserted || 0) > 0) {
			await createNotification(sql, {
				userId: target.targetUserId,
				actorUserId: viewerUserId,
				type: "user_follow",
				groupKey: `user_follow:${target.targetUserId}`,
				actionUrl: `/profile/${encodeURIComponent(username)}/followers`
			});
		}

		const refreshed = await resolveTarget({ username, viewerUserId });
		return json(200, {
			ok: true,
			isViewerFollowing: true,
			followersCount: Number(refreshed?.followersCount || 0),
			followingCount: Number(refreshed?.followingCount || 0)
		});
	} catch (error) {
		return json(500, {
			error: "Failed to follow user.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to unfollow users." });
		const viewerUserId = session.userId;
		const body = await request.json() as { username?: unknown };
		const username = normalizeText(body?.username);
		const target = await resolveTarget({ username, viewerUserId });
		if (!target) return json(404, { error: "User not found." });
		const followCheck = canFollowUser(viewerUserId, target.targetUserId);
		if (!followCheck.ok) return json(400, { error: followCheck.error });

		const sql = getNeonSql();
		await sql`
			delete from user_follow
			where follower_user_id = ${viewerUserId}::uuid
				and followed_user_id = ${target.targetUserId}::uuid
		`;

		const refreshed = await resolveTarget({ username, viewerUserId });
		return json(200, {
			ok: true,
			isViewerFollowing: false,
			followersCount: Number(refreshed?.followersCount || 0),
			followingCount: Number(refreshed?.followingCount || 0)
		});
	} catch (error) {
		return json(500, {
			error: "Failed to unfollow user.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
