import { getNeonSql } from "./neon";

export type ActiveAnnouncement = {
	id: number;
	title: string;
	body: string;
	dismissible: boolean;
};

function normalizeText(value: unknown, maxLength = 1000) {
	return String(value || "").trim().slice(0, maxLength);
}

export async function loadActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
	try {
		const sql = getNeonSql();
		const flagRows = await sql<Array<{ enabled: boolean }>>`
			select enabled
			from admin_feature_flag
			where flag_key = 'announcement_banner'
			limit 1
		`;
		if (!flagRows[0]?.enabled) return null;
		const rows = await sql<Array<{ id: number; title: string; body: string; dismissible: boolean }>>`
			select id, title, body, dismissible
			from admin_announcement
			where status = 'active'
				and (starts_at is null or starts_at <= now())
				and (ends_at is null or ends_at >= now())
			order by updated_at desc, id desc
			limit 1
		`;
		const row = rows[0];
		if (!row?.id || !normalizeText(row.title) || !normalizeText(row.body)) return null;
		return {
			id: Number(row.id || 0),
			title: normalizeText(row.title, 160),
			body: normalizeText(row.body, 1000),
			dismissible: row.dismissible !== false
		};
	} catch {
		return null;
	}
}
