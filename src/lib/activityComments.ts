export type ActivityComment = {
	id: number;
	username: string;
	body: string;
	createdAt: string;
	isMine?: boolean;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function buildReviewComment(input: {
	body: unknown;
	username: unknown;
	createdAt: unknown;
	isMine?: boolean;
}) {
	const body = normalizeText(input.body);
	if (!body) return null;
	const username = normalizeText(input.username).replace(/^@+/, "") || "reader";
	return {
		id: 0,
		username,
		body,
		createdAt: normalizeText(input.createdAt),
		isMine: !!input.isMine
	} satisfies ActivityComment;
}

export function mergeActivityComments(seed: ActivityComment[], fetched: ActivityComment[]) {
	const seedList = Array.isArray(seed) ? seed : [];
	const fetchedList = Array.isArray(fetched) ? fetched : [];
	const out: ActivityComment[] = [];
	const seen = new Set<string>();
	for (const comment of [...seedList, ...fetchedList]) {
		const body = normalizeText(comment?.body);
		if (!body) continue;
		const key = `${normalizeText(comment?.username).toLowerCase()}::${body.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			id: Math.max(0, Number(comment?.id || 0) || 0),
			username: normalizeText(comment?.username).replace(/^@+/, "") || "reader",
			body,
			createdAt: normalizeText(comment?.createdAt),
			isMine: !!comment?.isMine
		});
	}
	return out;
}
