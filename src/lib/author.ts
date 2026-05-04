export function normalizeAuthorName(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

export function slugifyAuthor(value: unknown) {
	return normalizeAuthorName(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function canonicalizeAuthor(value: unknown) {
	return normalizeAuthorName(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

export function authorHref(value: unknown, authorId: unknown = 0) {
	const name = normalizeAuthorName(value);
	if (!name) return "";
	const id = Number(authorId || 0);
	if (id > 0) return `/author?authorId=${encodeURIComponent(String(id))}`;
	return `/author/${encodeURIComponent(slugifyAuthor(name))}?name=${encodeURIComponent(name)}`;
}
