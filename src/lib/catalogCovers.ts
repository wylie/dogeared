export type CatalogCoverSource = "edition" | "work" | "placeholder";

export type CatalogCoverInput = {
	editionCoverUrl?: unknown;
	workCoverUrl?: unknown;
	legacyBookCoverUrl?: unknown;
};

export type CatalogCoverResolution = {
	coverUrl: string;
	source: CatalogCoverSource;
};

export const CATALOG_COVER_RESOLUTION_ORDER: readonly CatalogCoverSource[] = ["edition", "work", "placeholder"];

function cleanCoverUrl(value: unknown) {
	return String(value || "").trim();
}

export function resolveCatalogCover(input: CatalogCoverInput): CatalogCoverResolution {
	const editionCoverUrl = cleanCoverUrl(input.editionCoverUrl) || cleanCoverUrl(input.legacyBookCoverUrl);
	if (editionCoverUrl) return { coverUrl: editionCoverUrl, source: "edition" };
	const workCoverUrl = cleanCoverUrl(input.workCoverUrl);
	if (workCoverUrl) return { coverUrl: workCoverUrl, source: "work" };
	return { coverUrl: "", source: "placeholder" };
}

export function resolvedCatalogCoverUrl(input: CatalogCoverInput) {
	return resolveCatalogCover(input).coverUrl;
}
