type RawReviewRow = {
	user_id?: unknown;
	username?: unknown;
	email_local?: unknown;
	rating?: unknown;
	finished_reflection?: unknown;
	updated_at?: unknown;
};

export type BookReview = {
	userId: string;
	username: string;
	rating: number;
	reviewDate: string;
	body: string;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function buildBookReviewList(rows: RawReviewRow[]) {
	const list = Array.isArray(rows) ? rows : [];
	return list
		.map((row) => ({
			userId: normalizeText(row.user_id),
			username: normalizeText(row.username) || normalizeText(row.email_local) || "reader",
			rating: Math.max(0, Math.min(5, Number(row.rating || 0) || 0)),
			reviewDate: normalizeText(row.updated_at),
			body: normalizeText(row.finished_reflection)
		}))
		.filter((row) => row.body.length > 0)
		.sort((a, b) => Date.parse(b.reviewDate || "") - Date.parse(a.reviewDate || ""));
}
