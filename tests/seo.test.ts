import test from "node:test";
import assert from "node:assert/strict";
import { buildBreadcrumbList, resolveSiteUrl, toAbsoluteUrl } from "../src/lib/seo.ts";

test("resolveSiteUrl falls back to the production site", () => {
	assert.equal(resolveSiteUrl(), "https://dogeared.app/");
});

test("toAbsoluteUrl converts relative paths to absolute URLs", () => {
	assert.equal(
		toAbsoluteUrl("/books/project-hail-mary", "https://dogeared.app/"),
		"https://dogeared.app/books/project-hail-mary"
	);
});

test("toAbsoluteUrl rejects placeholder and malformed breadcrumb URLs", () => {
	assert.equal(toAbsoluteUrl("", "https://dogeared.app/"), "");
	assert.equal(toAbsoluteUrl("#", "https://dogeared.app/"), "");
	assert.equal(toAbsoluteUrl("undefined", "https://dogeared.app/"), "");
	assert.equal(toAbsoluteUrl("null", "https://dogeared.app/"), "");
});

test("buildBreadcrumbList emits sequential positions and absolute item URLs", () => {
	const breadcrumb = buildBreadcrumbList([
		{ name: "Home", item: "/" },
		{ name: "Books", item: "/books" },
		{ name: "Project Hail Mary", item: "/books/project-hail-mary" }
	], { site: "https://dogeared.app/" });
	assert.deepEqual(breadcrumb.itemListElement, [
		{
			"@type": "ListItem",
			position: 1,
			name: "Home",
			item: "https://dogeared.app/"
		},
		{
			"@type": "ListItem",
			position: 2,
			name: "Books",
			item: "https://dogeared.app/books"
		},
		{
			"@type": "ListItem",
			position: 3,
			name: "Project Hail Mary",
			item: "https://dogeared.app/books/project-hail-mary"
		}
	]);
});

test("buildBreadcrumbList drops invalid breadcrumb entries instead of emitting malformed schema", () => {
	const breadcrumb = buildBreadcrumbList([
		{ name: "Home", item: "/" },
		{ name: "Broken", item: "#" },
		{ name: "Books", item: "/books" }
	], { site: "https://dogeared.app/" });
	assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), [1, 2]);
	assert.deepEqual(breadcrumb.itemListElement.map((item) => item.name), ["Home", "Books"]);
});
