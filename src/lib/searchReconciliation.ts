import {
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	normalizeCatalogIsbn,
	normalizeCatalogText
} from "./catalogKeys.ts";
import { normalizeSearchResult, type SearchResult, type SearchResultSource, type SearchResultVariant } from "./searchResults.ts";

type ReconciliationMetrics = {
	inputCount: number;
	outputCount: number;
	groupsMerged: number;
	providerGroupsMerged: number;
	identifierMergeCount: number;
	metadataMergeCount: number;
	editionVariantCount: number;
	falseMergeGuardCount: number;
};

export type ReconciledSearchResults = {
	results: SearchResult[];
	metrics: ReconciliationMetrics;
};

const NOISE_TERMS = /\b(study guide|summary|workbook|teacher'?s guide|reader'?s guide|analysis|sparknotes|cliffsnotes|graphic novel|graphic adaptation|adapted by|complete works|collected works|selected works)\b/i;

function positiveNumber(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function publishedYear(value: unknown) {
	const match = String(value || "").match(/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/);
	const year = match ? Number(match[1]) : 0;
	return Number.isFinite(year) && year > 0 ? year : 0;
}

function sourceLabel(source: SearchResultSource | undefined) {
	if (source === "dbd") return "DogEared";
	if (source === "google_books") return "Google Books";
	if (source === "open_library") return "Open Library";
	return "Provider";
}

function sourceRank(source: SearchResultSource | undefined) {
	if (source === "dbd") return 1000;
	if (source === "google_books") return 30;
	if (source === "open_library") return 25;
	return 0;
}

function resultCompleteness(result: SearchResult) {
	return (
		sourceRank(result.source)
		+ (normalizeCatalogText(result.thumbnail) ? 12 : 0)
		+ (normalizeCatalogText(result.description) ? Math.min(24, normalizeCatalogText(result.description).length / 40) : 0)
		+ (positiveNumber(result.pageCount) > 0 ? 10 : 0)
		+ (normalizeCatalogText(result.publisher) ? 8 : 0)
		+ (normalizeCatalogText(result.isbn13) ? 8 : 0)
		+ (normalizeCatalogText(result.isbn10) ? 5 : 0)
		+ (normalizeCatalogText(result.googleBooksId) ? 4 : 0)
		+ (normalizeCatalogText(result.sourceWorkId) ? 4 : 0)
		+ (normalizeCatalogText(result.sourceEditionId) ? 3 : 0)
		+ (Array.isArray(result.categories) ? Math.min(8, result.categories.length) : 0)
	);
}

function titleKey(result: SearchResult) {
	return canonicalizeCatalogTitle(result.title);
}

function authorKey(result: SearchResult) {
	const authors = Array.isArray(result.authors) ? result.authors : [];
	return canonicalizeCatalogAuthor(authors[0] || "");
}

function hasMergeRiskNoise(result: SearchResult) {
	const haystack = [
		result.title,
		result.subtitle,
		result.description,
		Array.isArray(result.categories) ? result.categories.join(" ") : ""
	].join(" ");
	return NOISE_TERMS.test(haystack);
}

function canUseMetadataKey(result: SearchResult) {
	const title = titleKey(result);
	const author = authorKey(result);
	if (!title || !author) return false;
	if (hasMergeRiskNoise(result)) return false;
	const titleTokens = title.split(" ").filter(Boolean);
	return title.length >= 8 || titleTokens.length >= 2;
}

function canMergeByMetadata(left: SearchResult, right: SearchResult) {
	if (!canUseMetadataKey(left) || !canUseMetadataKey(right)) return false;
	if (titleKey(left) !== titleKey(right)) return false;
	if (authorKey(left) !== authorKey(right)) return false;
	const leftYear = publishedYear(left.publishedDate);
	const rightYear = publishedYear(right.publishedDate);
	if (leftYear > 0 && rightYear > 0 && Math.abs(leftYear - rightYear) > 4) return false;
	return true;
}

function uniqueStrings(values: unknown[]) {
	return Array.from(new Set(values.map((value) => normalizeCatalogText(value)).filter(Boolean)));
}

function strongIdentityKeys(result: SearchResult) {
	const keys: string[] = [];
	const bookId = positiveNumber(result.bookId);
	if (bookId > 0) keys.push(`catalog:${bookId}`);
	const isbn13 = normalizeCatalogIsbn(result.isbn13);
	const isbn10 = normalizeCatalogIsbn(result.isbn10);
	if (isbn13) keys.push(`isbn13:${isbn13}`);
	if (isbn10) keys.push(`isbn10:${isbn10}`);
	const googleBooksId = normalizeCatalogText(result.googleBooksId);
	if (googleBooksId) keys.push(`google_books:${googleBooksId}`);
	if (result.source === "open_library") {
		const workId = normalizeCatalogText(result.sourceWorkId);
		const editionId = normalizeCatalogText(result.sourceEditionId);
		if (workId) keys.push(`open_library:work:${workId}`);
		if (editionId) keys.push(`open_library:edition:${editionId}`);
	}
	return keys;
}

function toVariant(result: SearchResult): SearchResultVariant {
	const authors = Array.isArray(result.authors) ? result.authors : [];
	const year = publishedYear(result.publishedDate);
	const format = normalizeCatalogText(result.printType) || "Book";
	const language = normalizeCatalogText(result.language);
	const publisher = normalizeCatalogText(result.publisher);
	const pageCount = positiveNumber(result.pageCount);
	const isbn13 = normalizeCatalogIsbn(result.isbn13);
	const isbn10 = normalizeCatalogIsbn(result.isbn10);
	const detailParts = [
		format,
		publisher ? `Publisher: ${publisher}` : "",
		pageCount > 0 ? `${pageCount} pages` : "",
		isbn13 ? `ISBN-13 ${isbn13}` : (isbn10 ? `ISBN-10 ${isbn10}` : ""),
		normalizeCatalogText(result.publishedDate) ? `Published ${normalizeCatalogText(result.publishedDate)}` : ""
	].filter(Boolean);
	return {
		source: result.source,
		title: normalizeCatalogText(result.title),
		author: authors[0] || "",
		pageCount,
		thumbnail: normalizeCatalogText(result.thumbnail),
		language,
		publishedDate: normalizeCatalogText(result.publishedDate),
		publisher,
		isbn10,
		isbn13,
		googleBooksId: normalizeCatalogText(result.googleBooksId),
		sourceWorkId: normalizeCatalogText(result.sourceWorkId),
		sourceEditionId: normalizeCatalogText(result.sourceEditionId),
		bookId: positiveNumber(result.bookId),
		authorId: positiveNumber(result.authorId),
		format,
		optionLabel: [format, language || "Unknown language", year || "Unknown year"].filter(Boolean).join(" • "),
		detailLabel: detailParts.join(" • ")
	};
}

function chooseText(
	items: SearchResult[],
	field: keyof Pick<SearchResult, "title" | "description" | "publisher" | "publishedDate" | "language" | "thumbnail" | "isbn10" | "isbn13" | "googleBooksId" | "sourceWorkId" | "sourceEditionId">
) {
	const candidates = items
		.map((item) => ({ item, value: normalizeCatalogText(item[field]) }))
		.filter((entry) => entry.value);
	if (candidates.length === 0) return { value: "", source: undefined as SearchResultSource | undefined };
	if (field === "description") {
		candidates.sort((a, b) => (
			sourceRank(b.item.source) - sourceRank(a.item.source)
			|| b.value.length - a.value.length
			|| resultCompleteness(b.item) - resultCompleteness(a.item)
		));
	} else {
		candidates.sort((a, b) => (
			sourceRank(b.item.source) - sourceRank(a.item.source)
			|| resultCompleteness(b.item) - resultCompleteness(a.item)
		));
	}
	return { value: candidates[0]?.value || "", source: candidates[0]?.item.source };
}

function chooseCategories(items: SearchResult[]) {
	const categories: string[] = [];
	for (const item of [...items].sort((a, b) => resultCompleteness(b) - resultCompleteness(a))) {
		for (const category of Array.isArray(item.categories) ? item.categories : []) {
			const value = normalizeCatalogText(category);
			if (!value || categories.some((existing) => existing.toLowerCase() === value.toLowerCase())) continue;
			categories.push(value);
			if (categories.length >= 8) return categories;
		}
	}
	return categories;
}

function chooseNumber(items: SearchResult[], field: keyof Pick<SearchResult, "pageCount" | "bookId" | "authorId" | "seriesBookOrder">) {
	const candidates = items
		.map((item) => ({ item, value: positiveNumber(item[field]) }))
		.filter((entry) => entry.value > 0)
		.sort((a, b) => sourceRank(b.item.source) - sourceRank(a.item.source) || resultCompleteness(b.item) - resultCompleteness(a.item));
	return { value: candidates[0]?.value || 0, source: candidates[0]?.item.source };
}

function mergeGroup(items: SearchResult[], queryText: string) {
	const sorted = [...items].sort((a, b) => resultCompleteness(b) - resultCompleteness(a));
	const title = chooseText(sorted, "title");
	const description = chooseText(sorted, "description");
	const publisher = chooseText(sorted, "publisher");
	const publishedDate = chooseText(sorted, "publishedDate");
	const language = chooseText(sorted, "language");
	const thumbnail = chooseText(sorted, "thumbnail");
	const isbn10 = chooseText(sorted, "isbn10");
	const isbn13 = chooseText(sorted, "isbn13");
	const googleBooksId = chooseText(sorted, "googleBooksId");
	const sourceWorkId = chooseText(sorted.filter((item) => item.source === "open_library"), "sourceWorkId");
	const sourceEditionId = chooseText(sorted.filter((item) => item.source === "open_library"), "sourceEditionId");
	const pageCount = chooseNumber(sorted, "pageCount");
	const bookId = chooseNumber(sorted, "bookId");
	const authorId = chooseNumber(sorted, "authorId");
	const seriesBookOrder = chooseNumber(sorted, "seriesBookOrder");
	const authorCarrier = sorted.find((item) => Array.isArray(item.authors) && item.authors.some((author) => normalizeCatalogText(author)));
	const seriesCarrier = sorted.find((item) => item.seriesName || item.seriesLabel || item.seriesBookOrder);
	const sourceValues = uniqueStrings(sorted.map((item) => item.source));
	const source = sourceValues.includes("open_library")
		? "open_library"
		: (sourceValues.includes("dbd") ? "dbd" : (sourceValues.includes("google_books") ? "google_books" : sorted[0]?.source));
	const provenance: Record<string, string> = {};
	for (const [field, selection] of Object.entries({
		title,
		description,
		publisher,
		publishedDate,
		language,
		thumbnail,
		isbn10,
		isbn13,
		googleBooksId,
		sourceWorkId,
		sourceEditionId,
		pageCount,
		bookId,
		authorId,
		seriesBookOrder
	})) {
		if (selection.source) provenance[field] = sourceLabel(selection.source);
	}

	const seenVariantKeys = new Set<string>();
	const variants = sorted.map(toVariant).filter((variant) => {
		const key = [
			normalizeCatalogText(variant.source),
			normalizeCatalogText(variant.googleBooksId),
			normalizeCatalogIsbn(variant.isbn13 || variant.isbn10),
			normalizeCatalogText(variant.sourceWorkId),
			normalizeCatalogText(variant.sourceEditionId),
			canonicalizeCatalogTitle(variant.title),
			canonicalizeCatalogAuthor(variant.author),
			normalizeCatalogText(variant.format),
			normalizeCatalogText(variant.publisher),
			normalizeCatalogText(variant.publishedDate),
			positiveNumber(variant.pageCount)
		].join("|");
		if (seenVariantKeys.has(key)) return false;
		seenVariantKeys.add(key);
		return true;
	});

	const merged: SearchResult = {
		source,
		title: title.value || sorted[0]?.title || "Untitled",
		subtitle: chooseText(sorted, "title").value === sorted[0]?.title ? sorted[0]?.subtitle || "" : "",
		authors: authorCarrier?.authors || [],
		description: description.value,
		publisher: publisher.value,
		publishedDate: publishedDate.value,
		printType: sorted.find((item) => normalizeCatalogText(item.printType))?.printType || "BOOK",
		pageCount: pageCount.value || null,
		categories: chooseCategories(sorted),
		language: language.value,
		thumbnail: thumbnail.value,
		isbn10: normalizeCatalogIsbn(isbn10.value),
		isbn13: normalizeCatalogIsbn(isbn13.value),
		googleBooksId: googleBooksId.value,
		sourceWorkId: sourceWorkId.value,
		sourceEditionId: sourceEditionId.value,
		bookId: bookId.value || undefined,
		authorId: authorId.value || undefined,
		seriesName: normalizeCatalogText(seriesCarrier?.seriesName),
		seriesBookOrder: seriesBookOrder.value || undefined,
		seriesLabel: normalizeCatalogText(seriesCarrier?.seriesLabel),
		variantCount: variants.length,
		variants,
		providerSources: sourceValues,
		metadataProvenance: provenance
	};
	return {
		result: merged,
		score: resultCompleteness(merged) + (canonicalizeCatalogTitle(merged.title).includes(canonicalizeCatalogTitle(queryText)) ? 10 : 0)
	};
}

export function reconcileCanonicalSearchResults(input: SearchResult[], queryText = ""): ReconciledSearchResults {
	const items = input
		.map((item, index) => normalizeSearchResult(item, { source: "search.reconciliation", index, query: queryText }))
		.filter((item): item is SearchResult => !!item);
	const parent = items.map((_, index) => index);
	const metrics: ReconciliationMetrics = {
		inputCount: items.length,
		outputCount: items.length,
		groupsMerged: 0,
		providerGroupsMerged: 0,
		identifierMergeCount: 0,
		metadataMergeCount: 0,
		editionVariantCount: 0,
		falseMergeGuardCount: 0
	};

	const find = (index: number): number => {
		let current = index;
		while (parent[current] !== current) current = parent[current] ?? current;
		while (parent[index] !== index) {
			const next = parent[index] ?? index;
			parent[index] = current;
			index = next;
		}
		return current;
	};
	const union = (left: number, right: number, reason: "identifier" | "metadata") => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot === rightRoot) return;
		parent[rightRoot] = leftRoot;
		if (reason === "identifier") metrics.identifierMergeCount += 1;
		else metrics.metadataMergeCount += 1;
	};

	const strongBuckets = new Map<string, number>();
	items.forEach((item, index) => {
		for (const key of strongIdentityKeys(item)) {
			const existing = strongBuckets.get(key);
			if (existing === undefined) strongBuckets.set(key, index);
			else union(existing, index, "identifier");
		}
	});

	const metadataBuckets = new Map<string, number[]>();
	items.forEach((item, index) => {
		if (!canUseMetadataKey(item)) {
			if (titleKey(item) && authorKey(item)) metrics.falseMergeGuardCount += 1;
			return;
		}
		const key = `title_author:${titleKey(item)}|${authorKey(item)}`;
		const bucket = metadataBuckets.get(key) || [];
		bucket.push(index);
		metadataBuckets.set(key, bucket);
	});
	for (const bucket of metadataBuckets.values()) {
		for (let i = 1; i < bucket.length; i += 1) {
			const first = bucket[0] ?? 0;
			const next = bucket[i] ?? 0;
			if (canMergeByMetadata(items[first] as SearchResult, items[next] as SearchResult)) union(first, next, "metadata");
			else metrics.falseMergeGuardCount += 1;
		}
	}

	const groups = new Map<number, SearchResult[]>();
	items.forEach((item, index) => {
		const root = find(index);
		const group = groups.get(root) || [];
		group.push(item);
		groups.set(root, group);
	});
	const merged = Array.from(groups.values())
		.map((group) => mergeGroup(group, queryText))
		.sort((a, b) => b.score - a.score)
		.map((entry) => entry.result);
	metrics.outputCount = merged.length;
	metrics.groupsMerged = Math.max(0, metrics.inputCount - metrics.outputCount);
	metrics.providerGroupsMerged = Array.from(groups.values()).filter((group) => new Set(group.map((item) => item.source).filter(Boolean)).size > 1).length;
	metrics.editionVariantCount = merged.reduce((sum, result) => sum + Math.max(0, Number(result.variantCount || result.variants?.length || 0)), 0);
	return { results: merged, metrics };
}
