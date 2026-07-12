import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeSearchResult, summarizeSearchResultForLog } from "../src/lib/searchResults.ts";

test("normalizes malformed search metadata without dropping a valid title", () => {
	const result = normalizeSearchResult({
		source: "google_books",
		title: "Here for a Good Time",
		authors: null,
		categories: "Fiction",
		pageCount: "597",
		thumbnail: "https://example.com/cover.jpg",
		googleBooksId: "abc123",
		variants: [
			{
				title: "Here for a Good Time",
				author: null,
				pageCount: "597",
				format: "",
				language: "en",
				publishedDate: "2026"
			}
		]
	}, { source: "test", index: 0, query: "here for a good time" });

	assert.ok(result);
	assert.equal(result.title, "Here for a Good Time");
	assert.deepEqual(result.authors, []);
	assert.deepEqual(result.categories, ["Fiction"]);
	assert.equal(result.pageCount, 597);
	assert.equal(result.variants?.[0]?.author, "");
	assert.equal(result.variants?.[0]?.format, "Book");
});

test("skips search results that cannot render a BookCard title", () => {
	const result = normalizeSearchResult({
		source: "open_library",
		authors: ["A. Reader"],
		categories: ["Fiction"]
	}, { source: "test", index: 1, query: "missing title" });

	assert.equal(result, null);
});

test("search result logs include render diagnostics without requiring private data", () => {
	const result = normalizeSearchResult({
		source: "dbd",
		title: "Wool",
		authors: ["Hugh Howey"],
		bookId: 42,
		authorId: 8,
		isbn13: "9781476733951",
		categories: ["Science Fiction"],
		seriesLabel: "Silo • Book 1"
	});

	assert.ok(result);
	assert.deepEqual(summarizeSearchResultForLog(result, 2), {
		index: 2,
		source: "dbd",
		workId: 42,
		editionId: "9781476733951",
		bookId: 42,
		authorId: 8,
		title: "Wool",
		author: "Hugh Howey",
		slug: "",
		cover: "",
		series: "Silo • Book 1",
		genres: ["Science Fiction"],
		description: ""
	});
});

test("search results preserve external source identifiers for canonical resolution", () => {
	const result = normalizeSearchResult({
		source: "open_library",
		title: "The Fellowship of the Ring",
		authors: ["J.R.R. Tolkien"],
		sourceWorkId: "OL27448W",
		sourceEditionId: "OL7353617M"
	});

	assert.ok(result);
	assert.equal(result.sourceWorkId, "OL27448W");
	assert.equal(result.sourceEditionId, "OL7353617M");
});

test("search API resolves external results through canonical catalog engine", () => {
	const source = readFileSync(new URL("../src/pages/api/books/search.ts", import.meta.url), "utf8");

	assert.match(source, /resolveCanonicalCatalogWork/);
	assert.match(source, /catalogSourcesForResult/);
	assert.match(source, /const sourceWorkId = openLibraryId/);
	assert.match(source, /`catalog:\$\{catalogBookId\}`/);
});

test("search page validates API results before rendering BookCard props", () => {
	const source = readFileSync(new URL("../src/pages/search.astro", import.meta.url), "utf8");

	assert.match(source, /normalizeSearchResult\(result, \{ source: "search\.page"/);
	assert.match(source, /\[search\.result\.skipped\]/);
	assert.match(source, /const primaryAuthor = authors\[0\] \|\| "Unknown author"/);
	assert.match(source, /data-book-id/);
	assert.match(source, /Already in DogEared/);
	assert.doesNotMatch(source, /results = Array\.isArray\(payload\?\.results\) \? payload\.results : \[\];/);
});
