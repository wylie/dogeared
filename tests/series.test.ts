import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	buildBookSeriesContext,
	groupAuthorBooksBySeries,
	inferKnownSeriesMetadata,
	orderSeriesBooks
} from "../src/lib/series.ts";

test("series books sort by book order before fallback metadata", () => {
	const ordered = orderSeriesBooks([
		{ seriesId: 1, seriesName: "Quartet", bookId: 3, title: "Third", bookOrder: 3 },
		{ seriesId: 1, seriesName: "Quartet", bookId: 1, title: "First", bookOrder: 1 },
		{ seriesId: 1, seriesName: "Quartet", bookId: 2, title: "Second", bookOrder: 2 }
	]);

	assert.deepEqual(ordered.map((book) => book.bookId), [1, 2, 3]);
});

test("series context marks the current book and read completion state", () => {
	const context = buildBookSeriesContext({
		currentBookId: 2,
		series: { id: 1, name: "Quartet", description: "", coverUrl: "", totalBooks: 3 },
		books: [
			{ seriesId: 1, seriesName: "Quartet", bookId: 1, title: "First", bookOrder: 1, shelfStatus: "finished" },
			{ seriesId: 1, seriesName: "Quartet", bookId: 2, title: "Second", bookOrder: 2, shelfStatus: "finished" },
			{ seriesId: 1, seriesName: "Quartet", bookId: 3, title: "Third", bookOrder: 3 }
		]
	});

	assert.equal(context?.currentBook?.bookId, 2);
	assert.equal(context?.currentBook?.isCurrent, true);
	assert.equal(context?.books[0]?.shelfStatus, "finished");
	assert.equal(context?.books[1]?.orderLabel, "Book 2");
});

test("series context exposes previous and next existing books for navigation", () => {
	const context = buildBookSeriesContext({
		currentBookId: 2,
		series: { id: 1, name: "Quartet", description: "", coverUrl: "", totalBooks: 4 },
		books: [
			{ seriesId: 1, seriesName: "Quartet", bookId: 1, title: "First", bookOrder: 1 },
			{ seriesId: 1, seriesName: "Quartet", bookId: 2, title: "Second", bookOrder: 2 },
			{ seriesId: 1, seriesName: "Quartet", bookId: 0, title: "Missing Interlude", bookOrder: 3 },
			{ seriesId: 1, seriesName: "Quartet", bookId: 4, title: "Fourth", bookOrder: 4, shelfStatus: "want_to_read" }
		]
	});

	assert.equal(context?.books[2]?.canOpenBook, false);
	assert.equal(context?.books[2]?.bookHref, "");
	assert.equal(context?.previousBook?.bookId, 1);
	assert.equal(context?.nextBook?.bookId, 4);
	assert.equal(context?.nextBook?.shelfStatus, "want_to_read");
});

test("series context returns null for standalone books", () => {
	const context = buildBookSeriesContext({
		currentBookId: 10,
		series: { id: 0, name: "", description: "", coverUrl: "", totalBooks: 0 },
		books: [
			{ seriesId: 0, seriesName: "", bookId: 10, title: "Standalone" }
		]
	});

	assert.equal(context, null);
});

test("author books group by series and keep standalone books separate", () => {
	const groups = groupAuthorBooksBySeries([
		{ id: 2, title: "Series Two", seriesId: 10, seriesName: "A Series", bookOrder: 2 },
		{ id: 1, title: "Series One", seriesId: 10, seriesName: "A Series", bookOrder: 1 },
		{ id: 3, title: "Standalone" }
	]);

	assert.equal(groups.length, 2);
	assert.equal(groups[0]?.title, "A Series");
	assert.deepEqual(groups[0]?.books.map((book) => book.id), [1, 2]);
	assert.equal(groups[1]?.title, "Standalone Books");
	assert.deepEqual(groups[1]?.books.map((book) => book.id), [3]);
});

test("known series metadata is inferred for regression fixtures", () => {
	const cases = [
		["Harry Potter and the Chamber of Secrets", "J.K. Rowling", "Harry Potter", 2],
		["The Fellowship of the Ring", "J. R. R. Tolkien", "The Lord of the Rings", 1],
		["Fourth Wing", "Rebecca Yarros", "The Empyrean", 1],
		["The Dragonet Prophecy", "Tui T. Sutherland", "Wings of Fire", 1],
		["Moon Rising", "Tui T. Sutherland", "Wings of Fire", 6],
		["The Bad Beginning", "Lemony Snicket", "A Series of Unfortunate Events", 1],
		["The Final Empire", "Brandon Sanderson", "Mistborn", 1]
	] as const;

	for (const [title, author, seriesName, bookOrder] of cases) {
		const inferred = inferKnownSeriesMetadata({ title, author });
		assert.equal(inferred?.seriesName, seriesName);
		assert.equal(inferred?.bookOrder, bookOrder);
	}
});

test("Wings of Fire known series matches Book Detail release fixture total", () => {
	const source = readFileSync("src/lib/series.ts", "utf8");

	assert.match(source, /name: "Wings of Fire"[\s\S]+totalBooks: 16/);
});

test("series context loader falls back from representative books to canonical Work membership", () => {
	const source = readFileSync("src/lib/series.ts", "utf8");

	assert.match(source, /with direct_book as/);
	assert.match(source, /bw\.series_id as work_series_id/);
	assert.match(source, /select db\.work_series_id/);
	assert.match(source, /where not exists \([\s\S]+from series_book existing[\s\S]+existing\.book_id = b\.id/);
});

test("series inference is wired through search, shelf import, recommendations, and migration", () => {
	const search = readFileSync("src/pages/api/books/search.ts", "utf8");
	const shelfEntries = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const recommendations = readFileSync("src/lib/recommendations.ts", "utf8");
	const migration = readFileSync("db/migrations/2026-07-06-known-series-backfill.sql", "utf8");

	assert.match(search, /inferKnownSeriesMetadata/);
	assert.match(shelfEntries, /upsertKnownSeriesForBook/);
	assert.match(recommendations, /next_series/);
	assert.match(recommendations, /Next in/);
	for (const fixture of ["harry-potter", "the-lord-of-the-rings", "the-empyrean", "wings-of-fire", "a-series-of-unfortunate-events", "mistborn"]) {
		assert.match(migration, new RegExp(fixture));
	}
});
