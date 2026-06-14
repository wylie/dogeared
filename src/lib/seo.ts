const DEFAULT_SITE_URL = "https://dogeared.app/";

export type BreadcrumbInput = {
	name: string;
	item?: string | null;
};

export type BreadcrumbListItem = {
	"@type": "ListItem";
	position: number;
	name: string;
	item: string;
};

function normalizeSiteCandidate(value: unknown) {
	const text = String(value || "").trim();
	if (!text) return "";
	try {
		return new URL(text).toString();
	} catch {
		return "";
	}
}

export function resolveSiteUrl(site?: string | URL | null) {
	const explicit = normalizeSiteCandidate(site);
	if (explicit) return explicit;
	const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
	const envSite = normalizeSiteCandidate(env.SITE);
	if (envSite) return envSite;
	const publicSite = normalizeSiteCandidate(env.PUBLIC_SITE_URL);
	if (publicSite) return publicSite;
	return DEFAULT_SITE_URL;
}

export function toAbsoluteUrl(value: unknown, site?: string | URL | null) {
	const text = String(value || "").trim();
	if (!text || text === "#" || /^undefined$/i.test(text) || /^null$/i.test(text)) return "";
	try {
		return new URL(text, resolveSiteUrl(site)).toString();
	} catch {
		return "";
	}
}

export function buildBreadcrumbList(
	items: BreadcrumbInput[],
	options?: {
		site?: string | URL | null;
		logErrors?: boolean;
	}
) {
	const validItems: BreadcrumbListItem[] = [];
	for (const item of items) {
		const name = String(item?.name || "").trim();
		const absoluteItem = toAbsoluteUrl(item?.item, options?.site);
		if (!name || !absoluteItem) {
			if (options?.logErrors) {
				console.error("Invalid breadcrumb item; skipping structured data entry.", {
					name,
					item: item?.item
				});
			}
			continue;
		}
		validItems.push({
			"@type": "ListItem",
			position: validItems.length + 1,
			name,
			item: absoluteItem
		});
	}
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: validItems
	};
}
