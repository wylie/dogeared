import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	CATALOG_COVER_RESOLUTION_ORDER,
	resolveCatalogCover,
	resolvedCatalogCoverUrl
} from "../src/lib/catalogCovers.ts";

test("catalog cover resolver prefers Edition, then Work, then placeholder", () => {
	assert.deepEqual(CATALOG_COVER_RESOLUTION_ORDER, ["edition", "work", "placeholder"]);
	assert.deepEqual(resolveCatalogCover({
		editionCoverUrl: " https://example.com/edition.jpg ",
		workCoverUrl: "https://example.com/work.jpg"
	}), {
		coverUrl: "https://example.com/edition.jpg",
		source: "edition"
	});
	assert.deepEqual(resolveCatalogCover({
		workCoverUrl: "https://example.com/work.jpg"
	}), {
		coverUrl: "https://example.com/work.jpg",
		source: "work"
	});
	assert.deepEqual(resolveCatalogCover({}), {
		coverUrl: "",
		source: "placeholder"
	});
});

test("legacy book cover is treated as an Edition compatibility cover", () => {
	assert.equal(resolvedCatalogCoverUrl({
		legacyBookCoverUrl: "https://example.com/book.jpg",
		workCoverUrl: "https://example.com/work.jpg"
	}), "https://example.com/book.jpg");
});

test("Reading Timeline loads selected Edition covers before Work fallback", () => {
	const finishedBooks = readFileSync("src/lib/finishedBooks.ts", "utf8");
	const readingLife = readFileSync("src/pages/reading-life.astro", "utf8");

	assert.match(finishedBooks, /import \{ resolvedCatalogCoverUrl \} from "\.\/catalogCovers\.ts"/);
	assert.match(finishedBooks, /ub\.edition_id is not null and be\.id = ub\.edition_id/);
	assert.match(finishedBooks, /edition_cover_url/);
	assert.match(finishedBooks, /work_cover_url/);
	assert.match(readingLife, /import \{ resolvedCatalogCoverUrl \} from "\.\.\/lib\/catalogCovers"/);
	assert.match(readingLife, /ub\.edition_id is not null and be\.id = ub\.edition_id/);
	assert.match(readingLife, /editionCoverUrl: row\.edition_cover_url/);
});

test("BookCard and Reading Life fall back when a cover image URL breaks", () => {
	const bookCard = readFileSync("src/components/BookCard.astro", "utf8");
	const readingLife = readFileSync("src/pages/reading-life.astro", "utf8");

	assert.match(bookCard, /data-cover-placeholder/);
	assert.match(bookCard, /onerror="this\.hidden=true;/);
	assert.match(readingLife, /onerror="this\.hidden=true; this\.nextElementSibling\?\.removeAttribute\('hidden'\);"/);
});

test("Catalog Editor saves invalidate catalog cover caches", () => {
	const adminCatalog = readFileSync("src/lib/adminCatalog.ts", "utf8");
	const runtimeCache = readFileSync("src/lib/runtimeCache.ts", "utf8");

	assert.match(adminCatalog, /import \{ invalidateCatalogRuntimeCaches \} from "\.\/runtimeCache\.ts"/);
	assert.match(adminCatalog, /invalidateCatalogRuntimeCaches\(\);/);
	assert.match(runtimeCache, /"search:dbd:"/);
	assert.match(runtimeCache, /"home:"/);
	assert.doesNotMatch(runtimeCache, /"search:google:"/);
});
