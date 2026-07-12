export type SearchResultSource = "dbd" | "google_books" | "open_library";

export type SearchResultVariant = {
	title: string;
	author: string;
	pageCount: number;
	thumbnail: string;
	language: string;
	publishedDate: string;
	publisher: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	sourceWorkId?: string;
	sourceEditionId?: string;
	bookId?: number;
	authorId?: number;
	format: string;
	optionLabel: string;
	detailLabel: string;
};

export type SearchResult = {
	source?: SearchResultSource;
	title: string;
	subtitle: string;
	authors: string[];
	description: string;
	publisher: string;
	publishedDate: string;
	printType: string;
	pageCount: number | null;
	categories: string[];
	language: string;
	thumbnail: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	sourceWorkId?: string;
	sourceEditionId?: string;
	bookId?: number;
	authorId?: number;
	seriesName?: string;
	seriesBookOrder?: number;
	seriesLabel?: string;
	variantCount?: number;
	variants?: SearchResultVariant[];
};

type NormalizeContext = {
	source?: string;
	index?: number;
	query?: string;
};

function text(value: unknown) {
	return String(value ?? "").trim();
}

function textArray(value: unknown) {
	if (Array.isArray(value)) {
		return value.map((entry) => text(entry)).filter(Boolean);
	}
	const single = text(value);
	return single ? [single] : [];
}

function positiveNumber(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : 0;
}

function pageCount(value: unknown) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return null;
	return Math.round(number);
}

function source(value: unknown): SearchResultSource | undefined {
	const normalized = text(value);
	if (normalized === "dbd" || normalized === "google_books" || normalized === "open_library") {
		return normalized;
	}
	return undefined;
}

function isDevRuntime() {
	return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
}

function normalizeVariant(value: unknown): SearchResultVariant | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const title = text(record.title);
	if (!title) return null;
	const format = text(record.format) || "Book";
	const language = text(record.language);
	const publishedDate = text(record.publishedDate);
	const optionParts = [format, language || "Unknown language", publishedDate.match(/\d{4}/)?.[0] || "Unknown year"];
	const detailParts = [
		format,
		text(record.publisher) ? `Publisher: ${text(record.publisher)}` : "",
		positiveNumber(record.pageCount) ? `${positiveNumber(record.pageCount)} pages` : "",
		text(record.isbn13) ? `ISBN-13 ${text(record.isbn13)}` : (text(record.isbn10) ? `ISBN-10 ${text(record.isbn10)}` : ""),
		publishedDate ? `Published ${publishedDate}` : ""
	].filter(Boolean);
	return {
		title,
		author: text(record.author),
		pageCount: positiveNumber(record.pageCount),
		thumbnail: text(record.thumbnail),
		language,
		publishedDate,
		publisher: text(record.publisher),
		isbn10: text(record.isbn10),
		isbn13: text(record.isbn13),
		googleBooksId: text(record.googleBooksId),
		sourceWorkId: text(record.sourceWorkId),
		sourceEditionId: text(record.sourceEditionId),
		bookId: positiveNumber(record.bookId),
		authorId: positiveNumber(record.authorId),
		format,
		optionLabel: text(record.optionLabel) || optionParts.filter(Boolean).join(" • "),
		detailLabel: text(record.detailLabel) || detailParts.join(" • ")
	};
}

export function normalizeSearchResult(value: unknown, context: NormalizeContext = {}): SearchResult | null {
	if (!value || typeof value !== "object") {
		if (isDevRuntime()) {
			console.warn("[search.result.invalid]", {
				reason: "not an object",
				source: context.source,
				index: context.index,
				query: context.query
			});
		}
		return null;
	}

	const record = value as Record<string, unknown>;
	const title = text(record.title);
	if (!title) {
		if (isDevRuntime()) {
			console.warn("[search.result.invalid]", {
				reason: "missing title",
				source: context.source,
				index: context.index,
				query: context.query
			});
		}
		return null;
	}

	const normalizedVariants = Array.isArray(record.variants)
		? record.variants.map((variant) => normalizeVariant(variant)).filter((variant): variant is SearchResultVariant => !!variant)
		: [];
	const normalizedPageCount = pageCount(record.pageCount);
	const seriesBookOrder = positiveNumber(record.seriesBookOrder);
	const variantCount = positiveNumber(record.variantCount) || normalizedVariants.length || undefined;

	return {
		source: source(record.source),
		title,
		subtitle: text(record.subtitle),
		authors: textArray(record.authors),
		description: text(record.description),
		publisher: text(record.publisher),
		publishedDate: text(record.publishedDate),
		printType: text(record.printType),
		pageCount: normalizedPageCount,
		categories: textArray(record.categories),
		language: text(record.language),
		thumbnail: text(record.thumbnail),
		isbn10: text(record.isbn10),
		isbn13: text(record.isbn13),
		googleBooksId: text(record.googleBooksId),
		sourceWorkId: text(record.sourceWorkId),
		sourceEditionId: text(record.sourceEditionId),
		bookId: positiveNumber(record.bookId),
		authorId: positiveNumber(record.authorId),
		seriesName: text(record.seriesName),
		seriesBookOrder,
		seriesLabel: text(record.seriesLabel),
		variantCount,
		variants: normalizedVariants
	};
}

export function summarizeSearchResultForLog(result: SearchResult, index = 0) {
	return {
		index,
		source: result.source || "",
		workId: result.bookId || 0,
		editionId: result.isbn13 || result.isbn10 || result.googleBooksId || "",
		bookId: result.bookId || 0,
		authorId: result.authorId || 0,
		title: result.title,
		author: result.authors[0] || "",
		slug: "",
		cover: result.thumbnail || "",
		series: result.seriesLabel || result.seriesName || "",
		genres: result.categories,
		description: result.description ? `${result.description.slice(0, 120)}${result.description.length > 120 ? "..." : ""}` : ""
	};
}
