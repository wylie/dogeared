import { slugifyAuthor } from "./author.ts";
import { normalizeGenreEntry } from "./genres.ts";

export type RelatedKind = "author" | "book" | "genre" | "topic";

export type RelatedIndexingInput = {
	kind: RelatedKind;
	value: string;
	bookCount: number;
	uniqueAuthorCount: number;
	readerCount: number;
	hasError?: boolean;
};

export type RelatedIndexingDecision = {
	robots: "index,follow" | "noindex,follow" | "noindex,nofollow";
	indexable: boolean;
	reason: string;
};

const ALLOWED_RELATED_KINDS = new Set<RelatedKind>(["author", "book", "genre", "topic"]);

const KNOWN_DISCOVERY_GENRE_SLUGS = new Set([
	"adventure",
	"autobiography",
	"biography",
	"classic",
	"crime",
	"fantasy",
	"history",
	"horror",
	"memoir",
	"mystery",
	"poetry",
	"romance",
	"science-fiction",
	"self-help",
	"thriller",
	"true-crime",
	"young-adult"
]);

const WEAK_RELATED_VALUES = new Set([
	"form",
	"internet",
	"juvenile fiction",
	"large type books",
	"legislators spouses"
]);

export function normalizeRelatedKind(value: unknown): RelatedKind {
	const text = String(value || "").trim().toLowerCase() as RelatedKind;
	return ALLOWED_RELATED_KINDS.has(text) ? text : "author";
}

export function normalizeIndexingText(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

export function slugifyIndexingValue(value: unknown) {
	return normalizeIndexingText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function canonicalRelatedValue(kind: RelatedKind, value: unknown) {
	const text = normalizeIndexingText(value);
	if (!text) return "";
	if (kind === "genre") {
		const normalized = normalizeGenreEntry(text)[0];
		return normalized?.name || text;
	}
	return text;
}

export function relatedCanonicalPath(kind: RelatedKind, value: unknown) {
	const canonicalValue = canonicalRelatedValue(kind, value);
	if (!canonicalValue) return "/related";
	const params = new URLSearchParams();
	params.set("kind", kind);
	params.set("value", canonicalValue);
	return `/related?${params.toString()}`;
}

export function authorCanonicalPath(name: unknown) {
	const slug = slugifyAuthor(name);
	return slug ? `/author/${encodeURIComponent(slug)}` : "/authors";
}

export function isWeakRelatedValue(value: unknown) {
	const slug = slugifyIndexingValue(value);
	if (!slug || slug.length < 3) return true;
	if (/^\d+$/.test(slug)) return true;
	if (/^\d{4}(-\d{2})?(-\d{2})?$/.test(slug)) return true;
	if (slug.length > 80) return true;
	return WEAK_RELATED_VALUES.has(slug.replace(/-/g, " "));
}

export function hasKnownDiscoveryPotential(kind: RelatedKind, value: unknown) {
	if (kind !== "genre") return false;
	const normalized = normalizeGenreEntry(value)[0];
	const slug = normalized?.slug || slugifyIndexingValue(value);
	return KNOWN_DISCOVERY_GENRE_SLUGS.has(slug);
}

export function decideRelatedIndexing(input: RelatedIndexingInput): RelatedIndexingDecision {
	if (input.hasError) {
		return { robots: "noindex,nofollow", indexable: false, reason: "error" };
	}
	if (!normalizeIndexingText(input.value)) {
		return { robots: "index,follow", indexable: true, reason: "related landing page" };
	}
	if (input.kind === "author") {
		return { robots: "noindex,follow", indexable: false, reason: "duplicate of canonical author page" };
	}
	if (input.kind === "book") {
		return { robots: "noindex,follow", indexable: false, reason: "duplicate of canonical book page" };
	}
	if (isWeakRelatedValue(input.value)) {
		return { robots: "noindex,follow", indexable: false, reason: "weak or overly broad metadata" };
	}
	if (input.bookCount >= 5) {
		return { robots: "index,follow", indexable: true, reason: "at least five books" };
	}
	if (input.uniqueAuthorCount >= 3) {
		return { robots: "index,follow", indexable: true, reason: "at least three unique authors" };
	}
	if (input.readerCount >= 5 && hasKnownDiscoveryPotential(input.kind, input.value)) {
		return { robots: "index,follow", indexable: true, reason: "known discovery genre with reader activity" };
	}
	return { robots: "noindex,follow", indexable: false, reason: "thin related collection" };
}
