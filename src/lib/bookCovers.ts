type GoogleImageLinks = Record<string, unknown> | null | undefined;

export function normalizeBookCoverUrl(value: unknown) {
	const input = String(value || "").trim();
	if (!input) return "";
	const httpsUrl = input.startsWith("http://") ? `https://${input.slice(7)}` : input;
	if (!/\/\/books\.google\.[^/]+\/books\/content/i.test(httpsUrl)) return httpsUrl;

	try {
		const url = new URL(httpsUrl);
		url.searchParams.set("zoom", "1");
		url.searchParams.set("edge", "curl");
		return url.toString();
	} catch {
		return httpsUrl;
	}
}

export function isGoogleBooksCoverUrl(value: unknown) {
	const normalized = normalizeBookCoverUrl(value);
	return /\/\/books\.google\.[^/]+\/books\/(?:publisher\/)?content/i.test(normalized);
}

export function displayBookCoverUrl(value: unknown) {
	const normalized = normalizeBookCoverUrl(value);
	if (!normalized || !isGoogleBooksCoverUrl(normalized)) return normalized;
	return `/api/books/cover?url=${encodeURIComponent(normalized)}`;
}

export function googleBooksCoverUrl(imageLinks: GoogleImageLinks, quality: "card" | "detail" = "card") {
	if (!imageLinks || typeof imageLinks !== "object") return "";
	const candidates = quality === "detail"
		? [
			imageLinks.extraLarge,
			imageLinks.large,
			imageLinks.medium,
			imageLinks.small,
			imageLinks.thumbnail,
			imageLinks.smallThumbnail
		]
		: [
			imageLinks.thumbnail,
			imageLinks.smallThumbnail,
			imageLinks.small,
			imageLinks.medium,
			imageLinks.large,
			imageLinks.extraLarge
		];
	return normalizeBookCoverUrl(candidates.find((candidate) => String(candidate || "").trim()));
}
