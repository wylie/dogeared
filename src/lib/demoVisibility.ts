import { getNeonSql } from "./neon";

export const DEMO_TEST_USERNAME = "test";
const DEFAULT_DEMO_VISIBLE_TO_USERNAME = "wylie";

function normalizeText(value: unknown) {
	return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

export function isDemoTestUsername(value: unknown) {
	return normalizeText(value) === DEMO_TEST_USERNAME;
}

export function demoVisibleToUsername() {
	return normalizeText(import.meta.env.TEST_USER_VISIBLE_TO_USERNAME) || DEFAULT_DEMO_VISIBLE_TO_USERNAME;
}

export async function canViewerSeeDemoTestUser(viewerUserId: string) {
	const normalizedViewerUserId = String(viewerUserId || "").trim();
	if (!normalizedViewerUserId) return false;
	const sql = getNeonSql();
	const rows = await sql<Array<{ exists: number }>>`
		select 1::int as exists
		from app_user
		where id = ${normalizedViewerUserId}::uuid
			and lower(coalesce(username, '')) = ${demoVisibleToUsername()}
		limit 1
	`;
	return Number(rows[0]?.exists || 0) > 0;
}
