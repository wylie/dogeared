import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureNotificationTable() {
	const sql = getNeonSql();
	try {
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
	} catch {
		// Ignore DDL failures on restricted production roles.
	}
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(200, { unreadCount: 0 });
		await ensureNotificationTable();
		const sql = getNeonSql();
		const rows = await sql<Array<{ unread_count: number }>>`
			select count(*)::int as unread_count
			from user_notification n
			join user_activity ua on ua.id = n.activity_id
			join book b on b.id = ua.book_id
			where n.user_id = ${session.userId}::uuid
				and n.read_at is null
		`;
		const unreadCount = Math.max(0, Number(rows[0]?.unread_count || 0));
		return json(200, { unreadCount });
	} catch (error) {
		return json(200, { unreadCount: 0 });
	}
};
