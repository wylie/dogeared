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

function stripDisplayEditionSuffix(value: unknown) {
	return String(value || "").replace(
		/\s*:\s*(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition|deluxe edition|illustrated edition|special edition|collector'?s edition)\s*$/i,
		""
	);
}

export function canonicalCatalogWorkKey(input: { title?: unknown; author?: unknown; isbn10?: unknown; isbn13?: unknown }) {
	const title = canonicalizeCatalogTitle(input.title) || "untitled";
	const author = canonicalizeCatalogAuthor(input.author) || "unknown";
	return `title_author:${title}|${author}`;
}

export function canonicalCatalogDisplayWorkKey(input: { title?: unknown; author?: unknown }) {
	const title = canonicalizeCatalogTitle(stripDisplayEditionSuffix(input.title));
	const author = canonicalizeCatalogAuthor(input.author);
	if (!title && !author) return "";
	return `title_author:${title || "untitled"}|${author || "unknown"}`;
}

function numericRank(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function itemAuthor(input: Record<string, unknown>) {
	if (Array.isArray(input.authors)) return input.authors.map((author) => String(author || "").trim()).find(Boolean) || "";
	return String(input.author || input.primary_author || input.primaryAuthor || "").trim();
}

function itemTimestamp(input: Record<string, unknown>) {
	const date = new Date(String(input.updatedAt || input.updated_at || input.publishedDate || "").trim());
	return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function catalogDisplayScore(input: Record<string, unknown>) {
	return (
		numericRank(input.shelfCount || input.shelf_count || input.shelfEntries)
		+ numericRank(input.readerCount || input.reader_count || input.readers)
		+ numericRank(input.ratingCount || input.rating_count)
		+ numericRank(input.averageRating || input.average_rating)
		+ (String(input.thumbnail || input.cover_url || input.coverUrl || "").trim() ? 1 : 0)
		+ (String(input.description || input.synopsis || "").trim() ? 1 : 0)
	);
}

export function dedupeCatalogItemsByDisplayWork<T extends object>(items: T[]) {
	const byKey = new Map<string, T>();
	for (const item of items) {
		const record = item as Record<string, unknown>;
		const key = canonicalCatalogDisplayWorkKey({
			title: record.title,
			author: itemAuthor(record)
		});
		if (!key) continue;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, item);
			continue;
		}
		const existingRecord = existing as Record<string, unknown>;
		const existingScore = catalogDisplayScore(existingRecord);
		const itemScore = catalogDisplayScore(record);
		if (itemScore > existingScore || (itemScore === existingScore && itemTimestamp(record) > itemTimestamp(existingRecord))) {
			byKey.set(key, item);
		}
	}
	return Array.from(byKey.values());
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

export function canonicalCatalogEditionKey(input: {
	isbn10?: unknown;
	isbn13?: unknown;
	googleBooksId?: unknown;
	sources?: CatalogSourceInput[];
	fallback?: unknown;
}) {
	const isbn13 = normalizeCatalogIsbn(input.isbn13);
	const isbn10 = normalizeCatalogIsbn(input.isbn10);
	if (isbn13) return `isbn13:${isbn13}`;
	if (isbn10) return `isbn10:${isbn10}`;
	const googleBooksId = normalizeCatalogText(input.googleBooksId);
	if (googleBooksId) return `google_books:${googleBooksId}`;
	for (const source of input.sources || []) {
		const editionId = normalizeCatalogText(source.sourceEditionId);
		if (editionId) return `${source.source}:edition:${editionId}`;
		const workId = normalizeCatalogText(source.sourceWorkId);
		if (workId) return `${source.source}:work:${workId}`;
	}
	const fallback = normalizeCatalogText(input.fallback);
	return fallback ? `fallback:${fallback}` : "";
}
