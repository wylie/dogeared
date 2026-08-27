import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileCanonicalSearchResults } from "../src/lib/searchReconciliation.ts";
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

test("search reconciliation collapses Google Books and Open Library evidence into one canonical book", () => {
	const { results, metrics } = reconcileCanonicalSearchResults([
		{
			source: "open_library",
			title: "When the Tiger Came Down the Mountain",
			subtitle: "",
			authors: ["Nghi Vo"],
			description: "",
			publisher: "",
			publishedDate: "2020",
			printType: "BOOK",
			pageCount: null,
			categories: ["Fiction"],
			language: "eng",
			thumbnail: "https://covers.openlibrary.org/b/id/123-M.jpg",
			isbn10: "",
			isbn13: "9781250786135",
			googleBooksId: "",
			sourceWorkId: "OL20814295W",
			sourceEditionId: "OL28000000M"
		},
		{
			source: "google_books",
			title: "When the Tiger Came Down the Mountain",
			subtitle: "",
			authors: ["Nghi Vo"],
			description: "The cleric Chih records another tale.",
			publisher: "Tordotcom",
			publishedDate: "2020-12-08",
			printType: "BOOK",
			pageCount: 83,
			categories: ["Fiction"],
			language: "en",
			thumbnail: "",
			isbn10: "1250786139",
			isbn13: "9781250786135",
			googleBooksId: "google-volume-1"
		}
	], "when the tiger came");

	assert.equal(results.length, 1);
	assert.equal(results[0]?.title, "When the Tiger Came Down the Mountain");
	assert.deepEqual(results[0]?.authors, ["Nghi Vo"]);
	assert.equal(results[0]?.pageCount, 83);
	assert.equal(results[0]?.publisher, "Tordotcom");
	assert.equal(results[0]?.googleBooksId, "google-volume-1");
	assert.equal(results[0]?.sourceWorkId, "OL20814295W");
	assert.deepEqual(results[0]?.providerSources?.sort(), ["google_books", "open_library"]);
	assert.equal(results[0]?.variants?.length, 2);
	assert.equal(metrics.groupsMerged, 1);
	assert.equal(metrics.providerGroupsMerged, 1);
});

test("search reconciliation prefers existing DogEared Work metadata while filling missing provider fields", () => {
	const { results } = reconcileCanonicalSearchResults([
		{
			source: "dbd",
			title: "The Last Graduate",
			subtitle: "",
			authors: ["Naomi Novik"],
			description: "Curated DogEared description.",
			publisher: "",
			publishedDate: "2021",
			printType: "BOOK",
			pageCount: null,
			categories: [],
			language: "",
			thumbnail: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "",
			bookId: 294,
			authorId: 12
		},
		{
			source: "google_books",
			title: "The Last Graduate",
			subtitle: "",
			authors: ["Naomi Novik"],
			description: "Provider description should not replace curated text.",
			publisher: "Del Rey",
			publishedDate: "2021-09-28",
			printType: "BOOK",
			pageCount: 400,
			categories: ["Fantasy"],
			language: "en",
			thumbnail: "https://example.com/cover.jpg",
			isbn10: "",
			isbn13: "9780593128862",
			googleBooksId: "gb-last-graduate"
		}
	], "last graduate");

	assert.equal(results.length, 1);
	assert.equal(results[0]?.bookId, 294);
	assert.equal(results[0]?.authorId, 12);
	assert.equal(results[0]?.description, "Curated DogEared description.");
	assert.equal(results[0]?.publisher, "Del Rey");
	assert.equal(results[0]?.pageCount, 400);
	assert.equal(results[0]?.thumbnail, "https://example.com/cover.jpg");
	assert.equal(results[0]?.metadataProvenance?.description, "DogEared");
	assert.equal(results[0]?.metadataProvenance?.pageCount, "Google Books");
});

test("search reconciliation preserves separate results when metadata confidence is low", () => {
	const similar = reconcileCanonicalSearchResults([
		{
			source: "google_books",
			title: "Hamlet",
			subtitle: "",
			authors: ["William Shakespeare"],
			description: "",
			publisher: "",
			publishedDate: "1603",
			printType: "BOOK",
			pageCount: 120,
			categories: ["Drama"],
			language: "en",
			thumbnail: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "hamlet"
		},
		{
			source: "open_library",
			title: "The Complete Works of William Shakespeare",
			subtitle: "",
			authors: ["William Shakespeare"],
			description: "",
			publisher: "",
			publishedDate: "1623",
			printType: "BOOK",
			pageCount: 1200,
			categories: ["Drama"],
			language: "eng",
			thumbnail: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "",
			sourceWorkId: "OL-COMPLETE-W"
		}
	], "hamlet");
	const differentAuthor = reconcileCanonicalSearchResults([
		{
			source: "google_books",
			title: "The Orchard",
			subtitle: "",
			authors: ["Author One"],
			description: "",
			publisher: "",
			publishedDate: "2020",
			printType: "BOOK",
			pageCount: 200,
			categories: [],
			language: "en",
			thumbnail: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "orchard-1"
		},
		{
			source: "open_library",
			title: "The Orchard",
			subtitle: "",
			authors: ["Author Two"],
			description: "",
			publisher: "",
			publishedDate: "2020",
			printType: "BOOK",
			pageCount: 210,
			categories: [],
			language: "eng",
			thumbnail: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "",
			sourceWorkId: "OL-ORCHARD-W"
		}
	], "orchard");

	assert.equal(similar.results.length, 2);
	assert.equal(differentAuthor.results.length, 2);
	assert.equal(similar.metrics.falseMergeGuardCount >= 1, true);
});

test("search API resolves external results through canonical catalog engine", () => {
	const source = readFileSync(new URL("../src/pages/api/books/search.ts", import.meta.url), "utf8");

	assert.match(source, /resolveCanonicalCatalogWorksForSearch/);
	assert.match(source, /reconcileCanonicalSearchResults/);
	assert.match(source, /skipSchemaBackfill: true/);
	assert.match(source, /CANONICAL_MATCH_TIMEOUT_MS/);
	assert.match(source, /canonicalTimeoutCount/);
	assert.match(source, /canonicalDbQueryCount/);
	assert.match(source, /canonicalDogEaredCandidateCount/);
	assert.match(source, /canonicalComparisonCount/);
	assert.match(source, /catalogSourcesForResult/);
	assert.match(source, /const sourceWorkId = openLibraryId/);
	assert.match(source, /measureSearchSpanSync\("metadata merge"/);
	assert.match(source, /measureSearchSpanSync\("result ranking"/);
});

test("search canonical matching is batched and bounded by stable signals", () => {
	const catalog = readFileSync(new URL("../src/lib/catalog.ts", import.meta.url), "utf8");
	const batchStart = catalog.indexOf("export async function resolveCanonicalCatalogWorksForSearch");
	const batchSource = catalog.slice(batchStart);

	assert.ok(batchStart > -1);
	for (const span of [
		"candidate preparation",
		"identifier matching",
		"ISBN matching",
		"edition lookup",
		"normalized title matching",
		"series matching",
		"existing Work lookup",
		"candidate scoring",
		"dedupe"
	]) {
		assert.match(batchSource, new RegExp(span));
	}
	assert.match(batchSource, /maxDatabaseCandidates/);
	assert.match(batchSource, /candidateComparisons/);
	assert.match(batchSource, /cacheHits/);
	assert.match(batchSource, /cacheMisses/);
	assert.match(batchSource, /truncatedCandidateSet/);
	assert.match(batchSource, /b\.google_books_id = any/);
	assert.match(batchSource, /be\.isbn13 = any/);
	assert.match(batchSource, /be\.edition_key = any/);
	assert.match(batchSource, /b\.canonical_work_key = any/);
	assert.match(batchSource, /bw\.work_key = any/);
	assert.doesNotMatch(batchSource, /lower\(coalesce\(b\.title, ''\)\) like/);
	assert.doesNotMatch(batchSource, /limit 80/);
});

test("search page validates API results before rendering BookCard props", () => {
	const source = readFileSync(new URL("../src/pages/search.astro", import.meta.url), "utf8");

	assert.match(source, /normalizeSearchResult\(result, \{ source: "search\.page"/);
	assert.match(source, /\[search\.result\.skipped\]/);
	assert.match(source, /const primaryAuthor = authors\[0\] \|\| "Unknown author"/);
	assert.match(source, /data-book-id/);
	assert.match(source, /Already in DogEared/);
	assert.doesNotMatch(source, /Found through/);
	assert.doesNotMatch(source, /results = Array\.isArray\(payload\?\.results\) \? payload\.results : \[\];/);
});

test("search cards use the shared under-cover ShelfButton presentation", () => {
	const source = readFileSync(new URL("../src/pages/search.astro", import.meta.url), "utf8");
	const progressiveRenderStart = source.indexOf("function renderProgressiveResult(result)");
	const progressiveRender = source.slice(progressiveRenderStart);

	assert.ok(progressiveRenderStart > -1);
	assert.match(source, /<div slot="actions">\s*<ShelfDropdown attrs=/s);
	assert.match(progressiveRender, /<div class="progressive-cover-wrap">[\s\S]*<div class="cover-actions">\$\{renderProgressiveShelfDropdown\(result, author, categories\)\}<\/div>[\s\S]*<div class="progressive-card-body">/);
	assert.match(source, /#search-results \.progressive-cover-wrap \.cover-actions \.shelf-dropdown\s*{[^}]*--shelf-trigger-width: 100%;/s);
	assert.match(source, /#search-results \.progressive-cover-wrap \.cover-actions \.shelf-trigger\.shelf-fab\s*{[^}]*height: var\(--shelf-trigger-height, 32px\);/s);
	assert.doesNotMatch(source, /progressive-shelf-dropdown/);
	assert.doesNotMatch(progressiveRender, /<p class="shelf-state">Not on Shelf<\/p>/);
	assert.doesNotMatch(source, /progressive-book-card \.progressive-shelf-dropdown/);
});
