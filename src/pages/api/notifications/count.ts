import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { publicReaderAccountFilterSql } from "../../../lib/publicReaderPolicy";

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
		const rows = await sql<Array<{ unread_count: number }>>`
			select count(*)::int as unread_count
			from user_notification n
			join user_activity ua on ua.id = n.activity_id
			join app_user au on au.id = n.actor_user_id
			join book b on b.id = ua.book_id
			where n.user_id = ${session.userId}::uuid
				and n.read_at is null
				${publicReaderAccountFilterSql(sql, { requirePublicProfile: false })}
	`;
		const unreadCount = Math.max(0, Number(rows[0]?.unread_count || 0));
		return json(200, { unreadCount });
	} catch (error) {
		return json(200, { unreadCount: 0 });
	}
};
