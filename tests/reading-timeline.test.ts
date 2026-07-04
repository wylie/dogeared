import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	buildReadingTimelineBooks,
	buildReadingTimelineMilestones,
	filterReadingTimelineBooks,
	groupReadingTimelineByYearMonth,
	readingTimelineFilterOptions
} from "../src/lib/readingTimeline.ts";

const sourceBooks = [
	{
		id: 1,
		title: "January Light",
		author: "Avery Stone",
		pageCount: 300,
		finishedDate: "2026-01-12",
		rating: 5,
		genres: [{ slug: "fiction", name: "Fiction" }],
		shelfLabel: "Read",
		customShelves: ["Book Club"]
	},
	{
		id: 2,
		title: "February Notes",
		author: "Mira Chen",
		pageCount: 120,
		finishedDate: "2026-02-03",
		rating: 4,
		genres: [{ slug: "memoir", name: "Memoir" }],
		shelfLabel: "Read"
	},
	{
		id: 3,
		title: "February Door",
		author: "Mira Chen",
		pageCount: 520,
		finishedDate: "2026-02-01",
		rating: 5,
		genres: [{ slug: "fiction", name: "Fiction" }],
		shelfLabel: "Read"
	},
	{
		id: 4,
		title: "Earlier Season",
		author: "Nia Vale",
		pageCount: 220,
		finishedDate: "2025-11-20",
		rating: 3,
		genres: [{ slug: "history", name: "History" }],
		shelfLabel: "Read"
	}
];

test("reading timeline groups by year and month with books ordered by finish date", () => {
	const books = buildReadingTimelineBooks(sourceBooks);
	const groups = groupReadingTimelineByYearMonth(books);

	assert.deepEqual(groups.map((group) => group.year), [2026, 2025]);
	assert.deepEqual(groups[0]?.months.map((month) => month.monthName), ["February", "January"]);
	assert.deepEqual(groups[0]?.months[0]?.books.map((book) => book.title), ["February Door", "February Notes"]);
	assert.equal(groups[0]?.months[0]?.summary.booksFinished, 2);
	assert.equal(groups[0]?.months[0]?.summary.pagesRead, 640);
	assert.equal(groups[0]?.months[0]?.summary.favoriteGenre, "Fiction");
	assert.equal(groups[0]?.months[0]?.summary.averageRating, 4.5);
});

test("reading timeline supports year, genre, shelf, rating, author, and search filters", () => {
	const books = buildReadingTimelineBooks(sourceBooks);

	assert.deepEqual(filterReadingTimelineBooks(books, { year: 2025 }).map((book) => book.title), ["Earlier Season"]);
	assert.deepEqual(filterReadingTimelineBooks(books, { genre: "Fiction" }).map((book) => book.title), ["February Door", "January Light"]);
	assert.deepEqual(filterReadingTimelineBooks(books, { shelf: "Book Club" }).map((book) => book.title), ["January Light"]);
	assert.deepEqual(filterReadingTimelineBooks(books, { rating: 4 }).map((book) => book.title), ["February Notes"]);
	assert.deepEqual(filterReadingTimelineBooks(books, { author: "Mira Chen" }).map((book) => book.title), ["February Notes", "February Door"]);
	assert.deepEqual(filterReadingTimelineBooks(books, { query: "door" }).map((book) => book.title), ["February Door"]);
});

test("reading timeline filter options derive available values", () => {
	const options = readingTimelineFilterOptions(buildReadingTimelineBooks(sourceBooks));

	assert.deepEqual(options.years, [2026, 2025]);
	assert.deepEqual(options.genres, ["Fiction", "History", "Memoir"]);
	assert.deepEqual(options.shelves, ["Book Club", "Read"]);
	assert.deepEqual(options.ratings, [5, 4, 3]);
	assert.deepEqual(options.authors, ["Avery Stone", "Mira Chen", "Nia Vale"]);
});

test("reading timeline milestones include reflective moments without requiring badges", () => {
	const books = buildReadingTimelineBooks(sourceBooks);
	const milestones = buildReadingTimelineMilestones({
		books,
		progressEvents: [
			{ date: "2026-02-01", pageDelta: 30 },
			{ date: "2026-02-02", pageDelta: 40 },
			{ date: "2026-02-03", pageDelta: 50 }
		],
		annualGoal: 2
	});

	assert.ok(milestones.some((item) => item.type === "first_finished" && item.bookTitle === "Earlier Season"));
	assert.ok(milestones.some((item) => item.type === "longest_book" && item.bookTitle === "February Door"));
	assert.ok(milestones.some((item) => item.type === "shortest_book" && item.bookTitle === "February Notes"));
	assert.ok(milestones.some((item) => item.type === "biggest_month" && item.description.includes("February 2026")));
	assert.ok(milestones.some((item) => item.type === "longest_streak" && item.description.includes("3 days")));
	assert.ok(milestones.some((item) => item.type === "goal_completion" && item.bookTitle === "February Door"));
});

test("reading timeline route, navigation, profile access, and empty states are wired", () => {
	const page = readFileSync("src/pages/reading-timeline.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const docs = readFileSync("docs/product/overview.md", "utf8");

	assert.match(page, /Reading Timeline/);
	assert.match(page, /groupReadingTimelineByYearMonth/);
	assert.match(page, /No finished books match these filters yet/);
	assert.match(page, /No finished books with dates yet/);
	assert.match(page, /Open My Reading Life/);
	assert.match(nav, /isReadingTimelinePage/);
	assert.match(nav, /Reading Timeline/);
	assert.match(profile, /href="\/reading-timeline"/);
	assert.match(docs, /Reading Timeline/);
});
