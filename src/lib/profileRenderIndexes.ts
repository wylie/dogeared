import type { getNeonSql } from "./neon.ts";

type Sql = ReturnType<typeof getNeonSql>;

let profileRenderIndexesReady: Promise<void> | null = null;

export async function ensureProfileRenderIndexes(sql: Sql) {
	if (!profileRenderIndexesReady) {
		profileRenderIndexesReady = (async () => {
			await Promise.all([
				sql`create index if not exists idx_user_book_user_status_updated on user_book(user_id, status, updated_at desc)`,
				sql`create index if not exists idx_user_book_user_finished_date on user_book(user_id, finished_date desc, updated_at desc) where status = 'finished'`,
				sql`create index if not exists idx_user_activity_user_event_created on user_activity(user_id, event_type, created_at desc, id desc)`,
				sql`create index if not exists idx_user_custom_shelf_book_user_shelf_created on user_custom_shelf_book(user_id, shelf_id, created_at desc)`
			]);
		})();
	}
	try {
		await profileRenderIndexesReady;
	} catch (error) {
		profileRenderIndexesReady = null;
		throw error;
	}
}
