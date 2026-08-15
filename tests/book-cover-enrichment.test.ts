import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("cover enrichment cache keys prefer stable book ids", () => {
	const source = readFileSync("src/lib/bookCoverEnrichment.ts", "utf8");

	assert.match(source, /if \(bookId > 0\) return `book:\$\{bookId\}`/);
});

test("cover enrichment cache keys support missing series placeholders", () => {
	const source = readFileSync("src/lib/bookCoverEnrichment.ts", "utf8");

	assert.match(source, /return `series:\$\{seriesId\}:\$\{order \|\| "unknown"\}:\$\{title\}:\$\{author\}`/);
});

test("cover enrichment persists successful covers and caches misses", () => {
	const source = readFileSync("src/lib/bookCoverEnrichment.ts", "utf8");

	assert.match(source, /create table if not exists book_cover_enrichment_cache/);
	assert.match(source, /loadExistingDogEaredCover/);
	assert.match(source, /lookupOpenLibraryCover/);
	assert.match(source, /lookupGoogleBooksCover/);
	assert.ok(source.indexOf("loadExistingDogEaredCover") < source.indexOf("lookupOpenLibraryCover"));
	assert.ok(source.indexOf("lookupOpenLibraryCover") < source.indexOf("lookupGoogleBooksCover"));
	assert.match(source, /update book[\s\S]+cover_url = case when nullif\(trim\(cover_url\), ''\) is null then \$\{coverUrl\}/);
	assert.match(source, /update book_work[\s\S]+preferred_cover_url/);
	assert.match(source, /update book_edition[\s\S]+cover_url/);
	assert.match(source, /update series_book[\s\S]+'coverUrl'/);
	assert.match(source, /COVER_NO_RESULT_TTL_DAYS = 30/);
	assert.match(source, /if \(cached && !cached\.retryOpen\) return null/);
});

test("book detail schedules series cover enrichment without blocking rendering", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /import \{ enrichMissingSeriesBookCovers \} from "\.\.\/lib\/bookCoverEnrichment"/);
	assert.match(source, /void enrichMissingSeriesBookCovers\(sql, seriesContext\.books\)\.catch/);
});

test("series loader uses Work, Edition, and cached series cover metadata", () => {
	const source = readFileSync("src/lib/series.ts", "utf8");

	assert.match(source, /bw\.preferred_cover_url/);
	assert.match(source, /candidate\.cover_url/);
	assert.match(source, /sb\.metadata ->> 'coverUrl'/);
	assert.match(source, /nullif\(trim\(b\.cover_url\), ''\),\s*nullif\(trim\(be\.cover_url\), ''\),\s*nullif\(trim\(bw\.preferred_cover_url\), ''\)/s);
});

test("Book Detail backfills missing compatibility covers from Edition before Work fallback", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /select nullif\(trim\(be\.cover_url\), ''\)/);
	assert.match(source, /be\.book_id = \$\{resolvedBookId\}/);
	assert.match(source, /nullif\(trim\(bw\.preferred_cover_url\), ''\)/);
	assert.ok(source.indexOf("select nullif(trim(be.cover_url), '')") < source.indexOf("nullif(trim(bw.preferred_cover_url), '')"));
});

test("search and canonical lookup prepare card covers with Edition before Work fallback", () => {
	const search = readFileSync("src/pages/api/books/search.ts", "utf8");
	const catalog = readFileSync("src/lib/catalog.ts", "utf8");
	const enrichment = readFileSync("src/lib/bookCoverEnrichment.ts", "utf8");

	for (const source of [search, catalog, enrichment]) {
		assert.match(source, /nullif\(trim\(b\.cover_url\), ''\),\s*nullif\(trim\((?:be|ed)\.cover_url\), ''\),\s*nullif\(trim\(bw\.preferred_cover_url\), ''\)/s);
	}
});
