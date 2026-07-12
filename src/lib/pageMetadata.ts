import { DEFAULT_SOCIAL_IMAGE, METADATA_ICON_LINKS, SITE_THEME_COLOR, type MetadataIconLink } from "./metadataAssets.ts";
import { buildSeoMetadata } from "./seo.ts";

export const DEFAULT_ROBOTS_DIRECTIVE = "index,follow";
export const DEFAULT_SOCIAL_IMAGE_ALT = "DogEared, a calm reading community and personal reading journal";
export const DEFAULT_TWITTER_CARD = "summary_large_image";
export const PAGE_METADATA_CHARSET = "UTF-8";
export const PAGE_METADATA_VIEWPORT = "width=device-width, initial-scale=1";

export type PageMetadataOgType = "website" | "article" | "book" | "profile";

export type PageMetadataInput = {
	title?: unknown;
	description?: unknown;
	robots?: unknown;
	canonicalUrl?: unknown;
	socialImage?: unknown;
	socialImageAlt?: unknown;
	ogType?: PageMetadataOgType;
	structuredData?: unknown;
	site?: string | URL | null;
};

export type PageMetadata = {
	charset: typeof PAGE_METADATA_CHARSET;
	viewport: typeof PAGE_METADATA_VIEWPORT;
	title: string;
	description: string;
	robots: string;
	canonicalUrl: string;
	iconLinks: MetadataIconLink[];
	themeColor: string;
	socialImageUrl: string;
	socialImageAlt: string;
	ogType: PageMetadataOgType;
	twitterCard: typeof DEFAULT_TWITTER_CARD;
	websiteStructuredData: string;
	pageStructuredData: string;
};

function normalizeRobotsDirective(value: unknown) {
	const text = String(value || "").trim();
	return text || DEFAULT_ROBOTS_DIRECTIVE;
}

function normalizeSocialImageAlt(value: unknown) {
	const text = String(value || "").trim();
	return text || DEFAULT_SOCIAL_IMAGE_ALT;
}

function buildWebsiteStructuredData(canonicalUrl: string) {
	const siteOrigin = new URL(canonicalUrl).origin;
	return JSON.stringify({
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: "DogEared",
		url: siteOrigin,
		potentialAction: {
			"@type": "SearchAction",
			target: `${siteOrigin}/search?q={search_term_string}`,
			"query-input": "required name=search_term_string"
		}
	});
}

export function buildPageMetadata(input: PageMetadataInput = {}): PageMetadata {
	const seo = buildSeoMetadata({
		title: input.title,
		description: input.description,
		canonicalUrl: input.canonicalUrl,
		socialImage: input.socialImage || DEFAULT_SOCIAL_IMAGE,
		site: input.site
	});
	return {
		charset: PAGE_METADATA_CHARSET,
		viewport: PAGE_METADATA_VIEWPORT,
		title: seo.title,
		description: seo.description,
		robots: normalizeRobotsDirective(input.robots),
		canonicalUrl: seo.canonicalUrl,
		iconLinks: METADATA_ICON_LINKS,
		themeColor: SITE_THEME_COLOR,
		socialImageUrl: seo.imageUrl,
		socialImageAlt: normalizeSocialImageAlt(input.socialImageAlt),
		ogType: input.ogType || "website",
		twitterCard: DEFAULT_TWITTER_CARD,
		websiteStructuredData: buildWebsiteStructuredData(seo.canonicalUrl),
		pageStructuredData: String(input.structuredData || "").trim()
	};
}
