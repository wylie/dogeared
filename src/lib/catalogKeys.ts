export type CatalogSource = "google_books" | "open_library" | "nyt";

export type CatalogSourceInput = {
	source: CatalogSource;
	sourceWorkId?: string;
	sourceEditionId?: string;
	sourceUrl?: string;
};

export function normalizeCatalogText(value: unknown) {
	return String(value || "").trim();
}

export function normalizeCatalogIsbn(value: unknown) {
	return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function canonicalizeCatalogTitle(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)/g, " ")
		.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)\b/g, " ")
		.split(":")[0]
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function canonicalizeCatalogAuthor(value: unknown) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/^(by\s+)/, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function canonicalCatalogWorkKey(input: { title?: unknown; author?: unknown; isbn10?: unknown; isbn13?: unknown }) {
	const isbn13 = normalizeCatalogIsbn(input.isbn13);
	const isbn10 = normalizeCatalogIsbn(input.isbn10);
	if (isbn13) return `isbn13:${isbn13}`;
	if (isbn10) return `isbn10:${isbn10}`;
	const title = canonicalizeCatalogTitle(input.title) || "untitled";
	const author = canonicalizeCatalogAuthor(input.author) || "unknown";
	return `title_author:${title}|${author}`;
}

export function getCatalogSourceKey(input: CatalogSourceInput) {
	const workId = normalizeCatalogText(input.sourceWorkId);
	const editionId = normalizeCatalogText(input.sourceEditionId);
	if (workId) return workId;
	if (editionId) return editionId;
	return "";
}

export function getCatalogSourceKeys(input: CatalogSourceInput) {
	const keys = [
		normalizeCatalogText(input.sourceWorkId),
		normalizeCatalogText(input.sourceEditionId)
	].filter(Boolean);
	return Array.from(new Set(keys));
}
