import assert from "node:assert/strict";
import test from "node:test";
import {
	buildBookSeriesContext,
	groupAuthorBooksBySeries,
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

test("continue reading chooses the next existing book and skips missing placeholders", () => {
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
