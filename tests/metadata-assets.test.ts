import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import {
	MANIFEST_ICON_PATHS,
	METADATA_ICON_LINKS,
	REQUIRED_METADATA_ASSET_PATHS,
	SITE_THEME_COLOR,
	WEB_APP_MANIFEST_PATH
} from "../src/lib/metadataAssets.ts";
import {
	DEFAULT_ROBOTS_DIRECTIVE,
	DEFAULT_SOCIAL_IMAGE_ALT,
	DEFAULT_TWITTER_CARD,
	PAGE_METADATA_VIEWPORT,
	buildPageMetadata
} from "../src/lib/pageMetadata.ts";

function publicAssetUrl(path: string) {
	return new URL(`../public${path}`, import.meta.url);
}

function projectFileUrl(path: string) {
	return new URL(`../${path}`, import.meta.url);
}

function collectAstroPages(directoryUrl: URL): URL[] {
	const files: URL[] = [];
	for (const entry of readdirSync(directoryUrl)) {
		const entryUrl = new URL(`${entry}`, directoryUrl);
		const stats = statSync(entryUrl);
		if (stats.isDirectory()) {
			if (entry === "api") continue;
			files.push(...collectAstroPages(new URL(`${entry}/`, directoryUrl)));
			continue;
		}
		if (entry.endsWith(".astro")) files.push(entryUrl);
	}
	return files;
}

test("layout includes sharing, icon, and manifest metadata", () => {
	const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
	assert.match(layout, /buildPageMetadata/);
	assert.match(layout, /metadata\.iconLinks/);
	assert.match(layout, /metadata\.themeColor/);
	for (const expected of [
		'property="og:site_name"',
		'property="og:image"',
		'name="twitter:card"'
	]) assert.match(layout, new RegExp(expected));
});

test("shared page metadata includes the complete baseline head contract", () => {
	const metadata = buildPageMetadata({
		title: "Search",
		description: "Search DogEared.",
		canonicalUrl: "/search",
		site: "https://dogeared.app/"
	});
	assert.equal(metadata.viewport, PAGE_METADATA_VIEWPORT);
	assert.equal(metadata.themeColor, SITE_THEME_COLOR);
	assert.equal(metadata.robots, DEFAULT_ROBOTS_DIRECTIVE);
	assert.equal(metadata.title, "Search | DogEared");
	assert.equal(metadata.description, "Search DogEared.");
	assert.equal(metadata.canonicalUrl, "https://dogeared.app/search");
	assert.equal(metadata.socialImageUrl, "https://dogeared.app/og-image.png");
	assert.equal(metadata.socialImageAlt, DEFAULT_SOCIAL_IMAGE_ALT);
	assert.equal(metadata.ogType, "website");
	assert.equal(metadata.twitterCard, DEFAULT_TWITTER_CARD);
	assert.deepEqual(metadata.iconLinks, METADATA_ICON_LINKS);
	assert.match(metadata.websiteStructuredData, /"@type":"WebSite"/);
});

test("display pages either use the shared layout metadata or redirect", () => {
	const pagesRoot = projectFileUrl("src/pages/");
	const failures: string[] = [];
	for (const pageUrl of collectAstroPages(pagesRoot)) {
		const source = readFileSync(pageUrl, "utf8");
		if (source.includes("<Layout") && source.includes("import Layout")) continue;
		if (source.includes("Astro.redirect(")) continue;
		failures.push(relative(new URL("..", import.meta.url).pathname, pageUrl.pathname));
	}
	assert.deepEqual(failures, []);
});

test("manifest has installable icon definitions and brand colors", () => {
	const manifest = JSON.parse(readFileSync(publicAssetUrl(WEB_APP_MANIFEST_PATH), "utf8"));
	assert.equal(manifest.name, "DogEared Reading Community");
	assert.equal(manifest.short_name, "DogEared");
	assert.equal(manifest.theme_color, SITE_THEME_COLOR);
	assert.equal(manifest.background_color, SITE_THEME_COLOR);
	assert.deepEqual(manifest.icons.map((icon: { src: string }) => icon.src), MANIFEST_ICON_PATHS);
	assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ["192x192", "512x512"]);
});

test("metadata asset configuration covers modern browser and social assets", () => {
	assert.ok(METADATA_ICON_LINKS.some((link) => link.href === "/favicon.svg" && link.type === "image/svg+xml"));
	assert.ok(METADATA_ICON_LINKS.some((link) => link.href === "/favicon.ico"));
	assert.ok(METADATA_ICON_LINKS.some((link) => link.rel === "apple-touch-icon" && link.sizes === "180x180"));
	assert.ok(METADATA_ICON_LINKS.some((link) => link.rel === "manifest" && link.href === WEB_APP_MANIFEST_PATH));
	assert.ok(REQUIRED_METADATA_ASSET_PATHS.includes("/og-image.png"));
	assert.equal(new Set(REQUIRED_METADATA_ASSET_PATHS).size, REQUIRED_METADATA_ASSET_PATHS.length);
});

test("all configured sharing and icon assets exist", () => {
	for (const path of REQUIRED_METADATA_ASSET_PATHS) {
		assert.equal(existsSync(publicAssetUrl(path)), true, `${path} should exist`);
	}
});
