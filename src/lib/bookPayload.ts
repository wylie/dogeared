export type BookPayload = {
	title: string;
	author: string;
	description: string;
	pageCount: number;
	coverUrl: string;
	categories: string[];
	format: string;
	language: string;
	publisher: string;
	publishedDate: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeIsbn(value: unknown) {
	return normalizeText(value).replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normalizePositiveInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function normalizeCategories(value: unknown) {
	const source = Array.isArray(value) ? value : [];
	return source.map((item) => normalizeText(item)).filter(Boolean);
}

export function normalizeBookPayload(input: unknown): BookPayload {
	const source = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
	return {
		title: normalizeText(source.title),
		author: normalizeText(source.author),
		description: normalizeText(source.description),
		pageCount: normalizePositiveInt(source.pageCount),
		coverUrl: normalizeText(source.coverUrl),
		categories: normalizeCategories(source.categories),
		format: normalizeText(source.format),
		language: normalizeText(source.language),
		publisher: normalizeText(source.publisher),
		publishedDate: normalizeText(source.publishedDate),
		isbn10: normalizeIsbn(source.isbn10),
		isbn13: normalizeIsbn(source.isbn13),
		googleBooksId: normalizeText(source.googleBooksId)
	};
}

export function fromShelfEntryInput(entry: unknown) {
	const source = (entry && typeof entry === "object") ? (entry as Record<string, unknown>) : {};
	return normalizeBookPayload({
		title: source.title,
		author: source.author,
		description: source.description,
		pageCount: source.totalPages,
		coverUrl: source.coverUrl,
		categories: source.categories,
		format: source.format,
		language: source.language,
		publisher: source.publisher,
		publishedDate: source.publishedDate,
		isbn10: source.isbn10,
		isbn13: source.isbn13,
		googleBooksId: source.googleBooksId
	});
}
