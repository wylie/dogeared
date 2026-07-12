import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	normalizeCollectionState,
	orderCollectionBooks,
	parseCollectionBookLines,
	selectFeaturedCollections,
	slugifyCollection
} from "../src/lib/collections.ts";

test("collection helpers normalize slugs and publication state", () => {
	assert.equal(slugifyCollection("Books That Feel Like Autumn!"), "books-that-feel-like-autumn");
	assert.equal(normalizeCollectionState("published"), "published");
	assert.equal(normalizeCollectionState("archived"), "archived");
	assert.equal(normalizeCollectionState("private"), "draft");
});

test("collection books sort by custom order", () => {
	const ordered = orderCollectionBooks([
		{ title: "Third", sortOrder: 3 },
		{ title: "First", sortOrder: 1 },
		{ title: "Second", sortOrder: 2 }
	]);
	assert.deepEqual(ordered.map((book) => book.title), ["First", "Second", "Third"]);
});

test("featured collections only include published collections and preserve priority", () => {
	const selected = selectFeaturedCollections([
		{ title: "Draft Pick", featured: true, publicationState: "draft" as const, sortOrder: 1 },
		{ title: "Second", featured: true, publicationState: "published" as const, sortOrder: 2 },
		{ title: "First", featured: true, publicationState: "published" as const, sortOrder: 1 },
		{ title: "Unfeatured", featured: false, publicationState: "published" as const, sortOrder: 0 }
	], 2);
	assert.deepEqual(selected.map((collection) => collection.title), ["First", "Second"]);
});

test("admin book lines parse book IDs, notes, quotes, and order", () => {
	const books = parseCollectionBookLines("12 | Start here | A bright opener | 2\nbad\n14 | Short note");
	assert.equal(books.length, 2);
	assert.equal(books[0]?.bookId, "12");
	assert.equal(books[0]?.editorNote, "Start here");
	assert.equal(books[0]?.featuredQuote, "A bright opener");
	assert.equal(books[0]?.sortOrder, "2");
	assert.equal(books[1]?.bookId, "14");
});

test("collection routes, search, featured home, and admin management are wired", () => {
	const collectionPage = readFileSync("src/pages/collections/[slug].astro", "utf8");
	const collectionIndex = readFileSync("src/pages/collections/index.astro", "utf8");
	const home = readFileSync("src/pages/index.astro", "utf8");
	const searchApi = readFileSync("src/pages/api/books/search.ts", "utf8");
	const admin = readFileSync("src/pages/admin/collections.astro", "utf8");

	assert.match(collectionPage, /loadCollectionBySlug/);
	assert.match(collectionPage, /CollectionBookCard/);
	assert.match(collectionIndex, /loadPublishedCollections/);
	assert.match(home, /Featured Collections/);
	assert.match(home, /loadFeaturedCollections/);
	assert.match(searchApi, /collectionResults/);
	assert.match(searchApi, /searchCollections/);
	assert.match(admin, /publicationState/);
	assert.match(admin, /published/);
	assert.match(admin, /archived/);
});
