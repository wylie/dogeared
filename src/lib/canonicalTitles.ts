import { canonicalizeCatalogTitle, normalizeCatalogText } from "./catalogKeys.ts";

export type CanonicalSeriesTitleInput = {
	title?: unknown;
	seriesName?: unknown;
	bookOrder?: unknown;
};

export type CanonicalSeriesTitleResult = {
	title: string;
	changed: boolean;
	removedSuffix: string;
};

function normalizeComparable(value: unknown) {
	return normalizeCatalogText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9#\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeOrder(value: unknown) {
	const order = Number(value || 0);
	return Number.isFinite(order) && order > 0 ? Math.floor(order) : 0;
}

function hasMatchingBookOrder(suffix: string, bookOrder: number) {
	const text = normalizeComparable(suffix);
	if (!text || bookOrder <= 0) return false;
	const order = String(bookOrder);
	return new RegExp(`(?:^|\\s)#\\s*${order}(?:\\s|$)`).test(text)
		|| new RegExp(`(?:^|\\s)book\\s*#?\\s*${order}(?:\\s|$)`).test(text);
}

function removeBookOrderMarkers(suffix: string, bookOrder: number) {
	const order = String(bookOrder);
	return normalizeComparable(suffix)
		.replace(new RegExp(`(?:^|\\s)#\\s*${order}(?:\\s|$)`, "g"), " ")
		.replace(new RegExp(`(?:^|\\s)book\\s*#?\\s*${order}(?:\\s|$)`, "g"), " ")
		.replace(/\bof\s+\d+\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function isGenericBookOrderSuffix(suffix: string, bookOrder: number) {
	if (!hasMatchingBookOrder(suffix, bookOrder)) return false;
	return removeBookOrderMarkers(suffix, bookOrder).length === 0;
}

function suffixMatchesSeries(suffix: string, seriesName: string, bookOrder: number) {
	if (!hasMatchingBookOrder(suffix, bookOrder)) return false;
	if (isGenericBookOrderSuffix(suffix, bookOrder)) return true;
	const suffixSeries = canonicalizeCatalogTitle(removeBookOrderMarkers(suffix, bookOrder));
	const expectedSeries = canonicalizeCatalogTitle(seriesName);
	return !!suffixSeries && !!expectedSeries && (
		suffixSeries === expectedSeries
		|| suffixSeries.includes(expectedSeries)
		|| expectedSeries.includes(suffixSeries)
	);
}

export function normalizeRedundantSeriesTitle(input: CanonicalSeriesTitleInput): CanonicalSeriesTitleResult {
	const originalTitle = normalizeCatalogText(input.title);
	const seriesName = normalizeCatalogText(input.seriesName);
	const bookOrder = normalizeOrder(input.bookOrder);
	const unchanged = { title: originalTitle, changed: false, removedSuffix: "" };
	if (!originalTitle || !seriesName || bookOrder <= 0) return unchanged;

	const match = originalTitle.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
	if (!match) return unchanged;

	const baseTitle = normalizeCatalogText(match[1]);
	const suffix = normalizeCatalogText(match[2]);
	if (!baseTitle || !suffix) return unchanged;
	if (!suffixMatchesSeries(suffix, seriesName, bookOrder)) return unchanged;

	return {
		title: baseTitle,
		changed: baseTitle !== originalTitle,
		removedSuffix: suffix
	};
}
