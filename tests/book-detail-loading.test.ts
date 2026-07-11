import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("book detail imports public reader policy before activity queries use it", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /import \{ publicReaderAccountFilterSql \} from "\.\.\/lib\/publicReaderPolicy"/);
	assert.match(source, /publicReaderAccountFilterSql\(sql, \{ requireActivitySharing: true \}\)/);
});

test("book detail logs server failures without rendering raw exception messages", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /function logBookDetailLoadError/);
	assert.doesNotMatch(source, /errorMessage = error instanceof Error \? error\.message/);
	assert.match(source, /errorMessage = book \? "" : "We couldn't load this book right now\."/);
	assert.match(source, /\{errorMessage && !book && <p class="error">\{errorMessage\}<\/p>\}/);
});

test("book detail isolates optional data queries so one failure does not block the page", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	for (const stage of [
		"series-upsert",
		"editions",
		"genres",
		"topics",
		"activity",
		"reviews",
		"viewer-state",
		"journal",
		"series",
		"recommendations"
	]) {
		assert.match(source, new RegExp(`logBookDetailLoadError\\("${stage}"`));
	}
	assert.match(source, /upsertKnownSeriesForBook\(sql/);
	assert.match(source, /loadBookSeriesContext\(sql, book\.id/);
	assert.match(source, /loadReadersAlsoEnjoyed\(sql, book\.id/);
});

test("book detail keeps reviews, activity, and recommendations wired", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /buildBookReviewList\(reviewRows\)/);
	assert.match(source, /<section class="panel reviews-panel" id="reviews">/);
	assert.match(source, /<section class="panel activity-panel">/);
	assert.match(source, /readersAlsoEnjoyed\.books\.map/);
});

test("book detail series section reuses BookCard and shared shelf actions", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");
	const seriesSection = source.slice(source.indexOf('{seriesContext && ('), source.indexOf('<section class="panel synopsis-panel">'));

	assert.match(seriesSection, /<BookCard/);
	assert.match(seriesSection, /variant="compact-series"/);
	assert.match(seriesSection, /seriesLabel=\{seriesBook\.bookOrder > 0 \? `Book \$\{seriesBook\.bookOrder\}` : ""\}/);
	assert.match(seriesSection, /<ShelfDropdown/);
	assert.match(seriesSection, /data-current-series-book/);
	assert.match(seriesSection, /class="series-eyebrow">Series/);
	assert.match(seriesSection, /<h2 id="series-heading" class="series-name">\{seriesContext\.series\.name\}<\/h2>/);
	assert.doesNotMatch(seriesSection, /Previous Book/);
	assert.doesNotMatch(seriesSection, /Jump to Current/);
	assert.doesNotMatch(seriesSection, /Next Book/);
	assert.doesNotMatch(seriesSection, /data-action="jump-to-current-series-book"/);
	assert.doesNotMatch(seriesSection, /series-add-link/);
	assert.doesNotMatch(seriesSection, /Add to DogEared/);
	assert.doesNotMatch(seriesSection, /Current Book/);
	assert.doesNotMatch(seriesSection, /Shelf: \{/);
	assert.doesNotMatch(seriesSection, /series-card-kickers/);
	assert.doesNotMatch(seriesSection, /slot="preTitle"/);
	assert.doesNotMatch(seriesSection, /seriesContext\.series\.name\}\$\{seriesBook\.bookOrder/);
	assert.doesNotMatch(seriesSection, /No ratings yet\./);
});

test("book detail series cards stay compact without header navigation controls", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");

	assert.doesNotMatch(source, /const previousSeriesBook/);
	assert.doesNotMatch(source, /const nextSeriesBook/);
	assert.doesNotMatch(source, /scrollIntoView/);
	assert.match(source, /\.series-list \{[\s\S]+align-items: start/);
	assert.match(source, /\.series-list \{[\s\S]+grid-auto-rows: max-content/);
	assert.doesNotMatch(source, /:global\(\.series-list \.book-card\) \{[\s\S]+grid-template-columns: 76px minmax\(0, 1fr\)/);
	assert.doesNotMatch(source, /:global\(\.series-list \.book-card \.cover\) \{[\s\S]+height: 114px/);
});
