import { getNeonSql } from "./neon";
import { resolveUserBySession } from "./auth";

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeList(input: unknown) {
	return String(input || "")
		.split(",")
		.map((item) => normalizeText(item).toLowerCase())
		.filter(Boolean);
}

export async function resolveAdminSession(request: Request) {
	const session = await resolveUserBySession(request);
	if (!session?.userId) return { isAdmin: false, userId: "", username: "" };

	const sql = getNeonSql();
	const rows = await sql<Array<{ username: string | null }>>`
		select username
		from app_user
		where id = ${session.userId}::uuid
		limit 1
	`;
	const username = normalizeText(rows[0]?.username).toLowerCase();
	const allowedUsernames = normalizeList(import.meta.env.ADMIN_USERNAMES || "wylie");
	const isAdmin = !!username && allowedUsernames.includes(username);

	return {
		isAdmin,
		userId: session.userId,
		username
	};
}

