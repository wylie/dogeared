import test from "node:test";
import assert from "node:assert/strict";
import {
	canonicalCatalogWorkKey,
	canonicalCatalogDisplayWorkKey,
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	dedupeCatalogItemsByDisplayWork,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn
} from "../src/lib/catalogKeys.ts";

test("canonicalCatalogWorkKey prefers ISBN identifiers over title and author", () => {
	assert.equal(
		canonicalCatalogWorkKey({
			title: "The Fellowship of the Ring",
			author: "J.R.R. Tolkien",
			isbn10: " 0-618-34625-2 ",
			isbn13: "978-0-618-34625-7"
		}),
		"isbn13:9780618346257"
	);

	assert.equal(
		canonicalCatalogWorkKey({
			title: "The Fellowship of the Ring",
			author: "J.R.R. Tolkien",
			isbn10: "0-618-34625-2",
			isbn13: ""
		}),
		"isbn10:0618346252"
	);
});

test("display work keys and UI dedupe collapse duplicate editions", () => {
	assert.equal(
		canonicalCatalogDisplayWorkKey({
			title: "Project Hail Mary (Kindle Edition)",
			author: "Andy Weir"
		}),
		"title_author:project hail mary|andy weir"
	);
	const deduped = dedupeCatalogItemsByDisplayWork([
		{ title: "Project Hail Mary", authors: ["Andy Weir"], shelfCount: 3, thumbnail: "" },
		{ title: "Project Hail Mary: Deluxe Edition", authors: ["Andy Weir"], shelfCount: 12, thumbnail: "cover.jpg" },
		{ title: "The Martian", authors: ["Andy Weir"], shelfCount: 8 }
	]);
	assert.equal(deduped.length, 2);
	assert.equal(deduped[0]?.title, "Project Hail Mary: Deluxe Edition");
});

test("canonical title and author collapse common formatting differences", () => {
	assert.equal(
		canonicalizeCatalogTitle("The Fellowship of the Ring: Lord of the Rings #1 (Kindle Edition)"),
		"fellowship of the ring"
	);
	assert.equal(canonicalizeCatalogTitle("A Promised Land (Audiobook)"), "promised land");
	assert.equal(canonicalizeCatalogAuthor("By J.R.R. Tolkien"), "j r r tolkien");
	assert.equal(canonicalizeCatalogAuthor("V. E. Schwab"), "v e schwab");
});

test("catalog source keys include both work and edition IDs for lookup", () => {
	assert.equal(
		getCatalogSourceKey({
			source: "open_library",
			sourceWorkId: "OL82563W",
			sourceEditionId: "OL37846972M"
		}),
		"OL82563W"
	);
	assert.deepEqual(
		getCatalogSourceKeys({
			source: "open_library",
			sourceWorkId: "OL82563W",
			sourceEditionId: "OL37846972M"
		}),
		["OL82563W", "OL37846972M"]
	);
});

test("normalizeCatalogIsbn removes punctuation and preserves X check digits", () => {
	assert.equal(normalizeCatalogIsbn("0-8044-2957-X"), "080442957X");
});
