import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { resolvePublicProfileBundle, resolvePublicShelfSummary } from "../../../lib/publicProfile";

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
		const profile = await resolvePublicProfileBundle({ username, viewerUserId });
		if (profile.status !== "ok" || !profile.targetUserId) return json(200, { status: profile.status, summary: null });
		const summary = await resolvePublicShelfSummary(profile.targetUserId);
		return json(200, { status: "ok", summary });
	} catch (error) {
		return json(500, {
			error: "Failed to load public shelf summary.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
