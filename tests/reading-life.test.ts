import assert from "node:assert/strict";
import test from "node:test";
import {
	buildGenreInsights,
	buildReadingCalendar,
	buildReadingLifeSummary,
	buildReadingTimeline,
	calculateReadingStreak,
	filterReadingTimeline
} from "../src/lib/readingLife.ts";

const finishedBooks = [
	{
		id: 1,
		title: "Winter Pages",
		author: "Avery Stone",
		pageCount: 320,
		publishedYear: 1999,
		finishedDate: "2026-01-12",
		rating: 5,
		genres: [{ slug: "fiction", name: "Fiction" }],
		seriesId: 10,
		seriesName: "The Seasons"
	},
	{
		id: 2,
		title: "Spring Notes",
		author: "Avery Stone",
		pageCount: 180,
		publishedYear: 2024,
		finishedDate: "2026-02-02",
		rating: 4,
		genres: [{ slug: "fiction", name: "Fiction" }]
	},
	{
		id: 3,
		title: "Ancient Libraries",
		author: "Mira Chen",
		pageCount: 420,
		publishedYear: 1950,
		finishedDate: "2025-12-30",
		rating: 5,
		genres: [{ slug: "history", name: "History" }]
	}
];

test("buildReadingLifeSummary calculates personal overview statistics", () => {
	const summary = buildReadingLifeSummary({
		finishedBooks,
		currentBooks: [{ id: 4, title: "Summer Margins", author: "Avery Stone" }],
		progressEvents: [
			{ bookId: 4, date: "2026-02-03", pageDelta: 12 },
			{ bookId: 4, date: "2026-02-04", pageDelta: 20 }
		],
		annualGoal: 12,
		now: new Date("2026-02-04T12:00:00Z")
	});

	assert.equal(summary.overview.booksCompletedThisYear, 2);
	assert.equal(summary.overview.pagesReadThisYear, 500);
	assert.equal(summary.overview.currentBooks, 1);
	assert.equal(summary.overview.favoriteGenre, "Fiction");
	assert.equal(summary.overview.favoriteAuthor, "Avery Stone");
	assert.equal(summary.overview.averageBookLength, 250);
	assert.equal(summary.overview.goalProgress.goal, 12);
	assert.deepEqual(summary.availableYears, [2026, 2025]);
});

test("reading streak uses recent progress and finished dates", () => {
	assert.equal(calculateReadingStreak(["2026-02-01", "2026-02-03", "2026-02-04"], new Date("2026-02-04T12:00:00Z")), 2);
	assert.equal(calculateReadingStreak(["2026-02-01"], new Date("2026-02-04T12:00:00Z")), 0);
});

test("timeline supports year, month, and search filters", () => {
	const timeline = buildReadingTimeline(finishedBooks);
	assert.deepEqual(timeline.map((book) => book.title), ["Spring Notes", "Winter Pages", "Ancient Libraries"]);
	assert.deepEqual(filterReadingTimeline(timeline, { year: 2026 }).map((book) => book.title), ["Spring Notes", "Winter Pages"]);
	assert.deepEqual(filterReadingTimeline(timeline, { year: 2026, month: 1 }).map((book) => book.title), ["Winter Pages"]);
	assert.deepEqual(filterReadingTimeline(timeline, { year: 2026, month: 0 }).map((book) => book.title), ["Spring Notes", "Winter Pages"]);
	assert.deepEqual(filterReadingTimeline(timeline, { year: 2026, query: "spring" }).map((book) => book.title), ["Spring Notes"]);
	assert.deepEqual(filterReadingTimeline(timeline, { year: 2026, query: "avery" }).map((book) => book.title), ["Spring Notes", "Winter Pages"]);
	assert.deepEqual(filterReadingTimeline(timeline, { query: "libraries" }).map((book) => book.title), ["Ancient Libraries"]);
});

test("reading life canonicalizes finished Works before overview and timeline counts", () => {
	const summary = buildReadingLifeSummary({
		finishedBooks: [
			{
				id: 10,
				bookId: 10,
				workId: 100,
				title: "The Same Work",
				author: "Jordan Bell",
				pageCount: 250,
				finishedDate: "2026-05-10",
				updatedAt: "2026-05-10T12:00:00Z",
				genres: [{ slug: "memoir", name: "Memoir" }]
			},
			{
				id: 11,
				bookId: 11,
				workId: 100,
				title: "The Same Work: Paperback",
				author: "Jordan Bell",
				pageCount: 250,
				finishedDate: "2026-05-10",
				updatedAt: "2026-05-10T11:00:00Z",
				genres: [{ slug: "memoir", name: "Memoir" }]
			},
			{
				id: 12,
				bookId: 12,
				workId: 101,
				title: "Moved Out and Back",
				author: "Riley Moon",
				pageCount: 300,
				finishedDate: "2026-06-02",
				updatedAt: "2026-06-03T10:00:00Z",
				genres: [{ slug: "fiction", name: "Fiction" }]
			},
			{
				id: 13,
				bookId: 13,
				workId: 101,
				title: "Moved Out and Back",
				author: "Riley Moon",
				pageCount: 300,
				finishedDate: "2026-06-02",
				updatedAt: "2026-06-02T10:00:00Z",
				genres: [{ slug: "fiction", name: "Fiction" }]
			},
			{
				id: 14,
				bookId: 14,
				workId: 102,
				title: "Activity Timestamp Only",
				author: "Riley Moon",
				pageCount: 120,
				updatedAt: "2026-07-01T10:00:00Z",
				genres: [{ slug: "fiction", name: "Fiction" }]
			}
		],
		currentBooks: [],
		progressEvents: [
			{ bookId: 10, date: "2026-05-09", pageDelta: 40 },
			{ bookId: 10, date: "2026-05-10", pageDelta: 20 }
		],
		annualGoal: 10,
		now: new Date("2026-07-01T12:00:00Z")
	});

	assert.equal(summary.overview.booksCompletedThisYear, 2);
	assert.equal(summary.overview.goalProgress.completed, 2);
	assert.equal(summary.timeline.length, 2);
	assert.deepEqual(summary.timeline.map((book) => book.title), ["Moved Out and Back", "The Same Work"]);
	assert.equal(filterReadingTimeline(summary.timeline, { year: 2026 }).length, summary.timeline.length);
	assert.deepEqual(filterReadingTimeline(summary.timeline, { year: 2026, month: 5 }).map((book) => book.title), ["The Same Work"]);
	assert.deepEqual(filterReadingTimeline(summary.timeline, { year: 2026, query: "riley" }).map((book) => book.title), ["Moved Out and Back"]);
});

test("calendar groups progress and completion activity by date", () => {
	const days = buildReadingCalendar({
		finishedBooks,
		progressEvents: [
			{ date: "2026-01-12", pageDelta: 40 },
			{ date: "2026-01-13", pageDelta: 20 }
		],
		year: 2026
	});
	const completionDay = days.find((day) => day.date === "2026-01-12");
	const progressDay = days.find((day) => day.date === "2026-01-13");
	assert.equal(completionDay?.pages, 40);
	assert.equal(completionDay?.completions, 1);
	assert.equal(progressDay?.pages, 20);
	assert.equal(progressDay?.level > 0, true);
});

test("genre insights calculate books, pages, and average ratings", () => {
	const genres = buildGenreInsights(finishedBooks);
	assert.equal(genres[0]?.label, "Fiction");
	assert.equal(genres[0]?.books, 2);
	assert.equal(genres[0]?.pages, 500);
	assert.equal(genres[0]?.averageRating, 4.5);
	assert.equal(genres[1]?.label, "History");
});
