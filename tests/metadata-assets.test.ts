import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
	MANIFEST_ICON_PATHS,
	METADATA_ICON_LINKS,
	REQUIRED_METADATA_ASSET_PATHS,
	SITE_THEME_COLOR,
	WEB_APP_MANIFEST_PATH
} from "../src/lib/metadataAssets.ts";

function publicAssetUrl(path: string) {
	return new URL(`../public${path}`, import.meta.url);
}

test("layout includes sharing, icon, and manifest metadata", () => {
	const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
	assert.match(layout, /METADATA_ICON_LINKS/);
	assert.match(layout, /SITE_THEME_COLOR/);
	for (const expected of [
		'property="og:site_name"',
		'property="og:image"',
		'name="twitter:card"'
	]) assert.match(layout, new RegExp(expected));
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
