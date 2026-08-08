type RawReviewRow = {
	user_id?: unknown;
	username?: unknown;
	email_local?: unknown;
	rating?: unknown;
	review_title?: unknown;
	finished_reflection?: unknown;
	review_spoiler?: unknown;
	review_updated_at?: unknown;
	updated_at?: unknown;
};

export type BookReview = {
	userId: string;
	username: string;
	rating: number;
	reviewDate: string;
	title: string;
	body: string;
	hasSpoiler: boolean;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

let reviewSchemaReady: Promise<void> | null = null;

export function normalizeReviewTitle(value: unknown) {
	return normalizeText(value).slice(0, 160);
}

export function normalizeReviewBody(value: unknown) {
	return normalizeText(value).slice(0, 4000);
}

export function normalizeReviewRating(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export async function ensureReviewSchema(sql: any) {
	if (!reviewSchemaReady) {
		reviewSchemaReady = Promise.all([
			sql`alter table user_book add column if not exists rating int`,
			sql`alter table user_book add column if not exists finished_reflection text not null default ''`,
			sql`alter table user_book add column if not exists review_title text not null default ''`,
			sql`alter table user_book add column if not exists review_spoiler boolean not null default false`,
			sql`alter table user_book add column if not exists review_updated_at timestamptz`
		]).then(() => undefined);
	}
	try {
		await reviewSchemaReady;
	} catch (error) {
		reviewSchemaReady = null;
		throw error;
	}
}

export function buildBookReviewList(rows: RawReviewRow[]) {
	const list = Array.isArray(rows) ? rows : [];
	return list
		.map((row) => ({
			userId: normalizeText(row.user_id),
			username: normalizeText(row.username) || normalizeText(row.email_local) || "reader",
			rating: Math.max(0, Math.min(5, Number(row.rating || 0) || 0)),
			reviewDate: normalizeText(row.review_updated_at) || normalizeText(row.updated_at),
			title: normalizeReviewTitle(row.review_title),
			body: normalizeReviewBody(row.finished_reflection),
			hasSpoiler: row.review_spoiler === true || String(row.review_spoiler || "").toLowerCase() === "true"
		}))
		.filter((row) => row.title.length > 0 || row.body.length > 0)
		.sort((a, b) => Date.parse(b.reviewDate || "") - Date.parse(a.reviewDate || ""));
}
