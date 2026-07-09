import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { loadUnreadNotificationCount } from "../../../lib/notifications";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(200, { unreadCount: 0 });
		const sql = getNeonSql();
		const unreadCount = await loadUnreadNotificationCount(sql, session.userId);
		return json(200, { unreadCount });
	} catch (error) {
		return json(200, { unreadCount: 0 });
	}
};
