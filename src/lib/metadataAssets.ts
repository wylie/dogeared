export const SITE_THEME_COLOR = "#C8DEEB";
export const DEFAULT_SOCIAL_IMAGE = "/og-image.png";
export const WEB_APP_MANIFEST_PATH = "/manifest.webmanifest";

export type MetadataIconLink = {
	rel: "icon" | "apple-touch-icon" | "manifest";
	href: string;
	type?: string;
	sizes?: string;
};

export const METADATA_ICON_LINKS: MetadataIconLink[] = [
	{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
	{ rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
	{ rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
	{ rel: "icon", sizes: "32x32", href: "/favicon.ico" },
	{ rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
	{ rel: "manifest", href: WEB_APP_MANIFEST_PATH }
];

export const MANIFEST_ICON_PATHS = [
	"/icons/icon-192.png",
	"/icons/icon-512.png"
] as const;

export const REQUIRED_METADATA_ASSET_PATHS = [
	DEFAULT_SOCIAL_IMAGE,
	...METADATA_ICON_LINKS.map((link) => link.href),
	...MANIFEST_ICON_PATHS
];
