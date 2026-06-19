import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("layout includes sharing, icon, and manifest metadata", () => {
	const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
	for (const expected of [
		'property="og:site_name"',
		'property="og:image"',
		'name="twitter:card"',
		'rel="apple-touch-icon"',
		'rel="manifest"'
	]) assert.match(layout, new RegExp(expected));
});

test("manifest has installable icon definitions and brand colors", () => {
	const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
	assert.equal(manifest.name, "DogEared Reading Community");
	assert.equal(manifest.short_name, "DogEared");
	assert.equal(manifest.theme_color, "#C8DEEB");
	assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ["192x192", "512x512"]);
});

test("all referenced sharing and icon assets exist", () => {
	for (const path of [
		"../public/og-image.png",
		"../public/apple-touch-icon.png",
		"../public/favicon.ico",
		"../public/favicon.svg",
		"../public/icons/icon-192.png",
		"../public/icons/icon-512.png"
	]) assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} should exist`);
});
