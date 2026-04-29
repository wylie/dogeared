import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { resolvePublicProfileBundle, resolvePublicRecentActivity } from "../../../lib/publicProfile";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const GET: APIRoute = async ({ request, url }) => {
	try {
		const session = await resolveUserBySession(request);
		const viewerUserId = String(session?.userId || "");
		const username = String(url.searchParams.get("username") || "").trim();
		const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || 10) || 10));
		const profile = await resolvePublicProfileBundle({ username, viewerUserId });
		if (profile.status !== "ok" || !profile.targetUserId) return json(200, { status: profile.status, updates: [] });
		if (!profile.canViewActivity) return json(200, { status: "ok", updates: [] });
		const updates = await resolvePublicRecentActivity(profile.targetUserId, limit);
		return json(200, { status: "ok", updates });
	} catch (error) {
		return json(500, {
			error: "Failed to load public activity.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
