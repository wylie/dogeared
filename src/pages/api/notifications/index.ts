import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import {
	deleteNotification,
	loadNotifications,
	loadUnreadNotificationCount,
	markAllNotificationsRead,
	markNotificationRead
} from "../../../lib/notifications";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

function normalizeId(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.floor(parsed));
}

export const GET: APIRoute = async ({ request, url }) => {
	const session = await resolveUserBySession(request);
	if (!session?.userId) return json(401, { error: "You must be logged in to load notifications." });
	const sql = getNeonSql();
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40) || 40));
	const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
	const [notifications, unreadCount] = await Promise.all([
		loadNotifications(sql, session.userId, { limit, offset }),
		loadUnreadNotificationCount(sql, session.userId)
	]);
	return json(200, { notifications, unreadCount, limit, offset });
};

export const POST: APIRoute = async ({ request }) => {
	const session = await resolveUserBySession(request);
	if (!session?.userId) return json(401, { error: "You must be logged in to update notifications." });
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const intent = String(body.intent || "").trim();
	const notificationId = normalizeId(body.notificationId);
	const sql = getNeonSql();
	if (intent === "mark_all_read") {
		await markAllNotificationsRead(sql, session.userId);
	} else if (intent === "mark_read" && notificationId > 0) {
		await markNotificationRead(sql, session.userId, notificationId);
	} else if (intent === "delete" && notificationId > 0) {
		await deleteNotification(sql, session.userId, notificationId);
	} else {
		return json(400, { error: "Invalid notification action." });
	}
	const unreadCount = await loadUnreadNotificationCount(sql, session.userId);
	return json(200, { ok: true, unreadCount });
};
