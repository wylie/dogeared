import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authorHref } from "../src/lib/author.ts";
import {
	buildDailyReadingActivity,
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
		finishedBooks: [
			...finishedBooks,
			{
				id: 4,
				title: "Second Finish",
				author: "Mira Chen",
				pageCount: 90,
				finishedDate: "2026-01-12"
			}
		],
		progressEvents: [
			{ bookId: 1, date: "2026-01-12", pageDelta: 25 },
			{ bookId: 2, date: "2026-01-12", pageDelta: 15 },
			{ bookId: 2, date: "2026-01-13", pageDelta: 20 }
		],
		year: 2026
	});
	const completionDay = days.find((day) => day.date === "2026-01-12");
	const progressDay = days.find((day) => day.date === "2026-01-13");
	const emptyDay = days.find((day) => day.date === "2026-01-14");
	assert.equal(completionDay?.pages, 130);
	assert.equal(completionDay?.pageEquivalents, 130);
	assert.equal(completionDay?.sessions, 2);
	assert.equal(completionDay?.progressUpdates, 2);
	assert.equal(completionDay?.booksRead, 3);
	assert.equal(completionDay?.completions, 2);
	assert.equal(completionDay?.finishes, 2);
	assert.deepEqual(completionDay?.finishedTitles, ["Second Finish", "Winter Pages"]);
	assert.equal(progressDay?.pages, 20);
	assert.equal(progressDay?.pageEquivalents, 20);
	assert.equal(progressDay?.sessions, 1);
	assert.equal(progressDay?.booksRead, 1);
	assert.equal(progressDay?.completions, 0);
	assert.equal(progressDay?.normalizationState, "exact");
	assert.equal(progressDay?.level > 0, true);
	assert.equal(emptyDay?.pages, 0);
	assert.equal(emptyDay?.active, false);
	assert.equal(emptyDay?.sessions, 0);
	assert.equal(emptyDay?.booksRead, 0);
	assert.equal(emptyDay?.completions, 0);
	assert.deepEqual(emptyDay?.finishedTitles, []);
});

test("daily reading activity shares one canonical volume model for calendar and volume views", () => {
	const days = buildDailyReadingActivity({
		finishedBooks: [
			{
				id: 10,
				bookId: 10,
				workId: 100,
				title: "Shared Work",
				author: "Avery Stone",
				pageCount: 300,
				finishedDate: "2026-08-08"
			},
			{
				id: 11,
				bookId: 11,
				workId: 101,
				title: "No Page Count",
				author: "Mira Chen",
				finishedDate: "2026-08-08"
			}
		],
		progressEvents: [
			{ bookId: 10, workId: 100, title: "Shared Work", author: "Avery Stone", date: "2026-08-08", pageDelta: 22 },
			{ bookId: 10, workId: 100, title: "Shared Work", author: "Avery Stone", date: "2026-08-08", pageDelta: 31 },
			{ bookId: 12, workId: 102, title: "Converted Percent", author: "Jordan Bell", date: "2026-08-08", pageDelta: 11 },
			{ bookId: 13, workId: 103, title: "Missing Metadata", author: "Jordan Bell", date: "2026-08-08", pageDelta: 0 }
		],
		startDate: "2026-08-08",
		endDate: "2026-08-08"
	});

	const day = days[0];
	assert.equal(day.date, "2026-08-08");
	assert.equal(day.active, true);
	assert.equal(day.pageEquivalents, 64);
	assert.equal(day.progressUpdates, 4);
	assert.equal(day.booksRead, 4);
	assert.equal(day.finishes, 2);
	assert.equal(day.incompleteUpdates, 2);
	assert.equal(day.normalizationState, "mixed");
	const sharedWork = day.workBreakdown.find((work) => work.workId === 100);
	assert.equal(sharedWork?.pageEquivalents, 53);
	assert.equal(sharedWork?.progressUpdates, 2);
	assert.equal(sharedWork?.finishes, 1);
	assert.equal(day.workBreakdown.find((work) => work.title === "No Page Count")?.normalizationState, "incomplete");
});

test("genre insights calculate books, pages, and average ratings", () => {
	const genres = buildGenreInsights(finishedBooks);
	assert.equal(genres[0]?.label, "Fiction");
	assert.equal(genres[0]?.books, 2);
	assert.equal(genres[0]?.pages, 500);
	assert.equal(genres[0]?.averageRating, 4.5);
	assert.equal(genres[1]?.label, "History");
});

test("My Reading Life refreshes visible annual summary and timeline after reading data changes", () => {
	const source = readFileSync("src/pages/reading-life.astro", "utf8");
	const refreshScript = source.slice(source.indexOf("const READING_LIFE_REFRESH_EVENT"));

	assert.match(refreshScript, /dogeared:reading-data-changed/);
	assert.match(refreshScript, /fetch\(window\.location\.href/);
	assert.match(refreshScript, /"X-Dogeared-Partial": "reading-life-summary"/);
	assert.match(refreshScript, /\["overview", "timeline", "reading-activity"\]/);
	assert.match(refreshScript, /current\.replaceWith\(next\)/);
	assert.match(refreshScript, /dogeared:reading-data-changed-at/);
	assert.match(refreshScript, /BroadcastChannel\("dogeared:reading-data"\)/);
	assert.doesNotMatch(refreshScript, /window\.location\.reload/);
});

test("Reading Calendar days expose accessible summaries and anchored tooltip behavior", () => {
	const source = readFileSync("src/pages/reading-life.astro", "utf8");

	assert.match(source, /type ReadingLifeCalendarDay/);
	assert.match(source, /function calendarDayAriaLabel/);
	assert.match(source, /No reading recorded\./);
	assert.match(source, /id="reading-activity"/);
	assert.match(source, /data-reading-activity-view="calendar"/);
	assert.match(source, /data-reading-activity-view="volume"/);
	assert.match(source, /data-volume-range-button=\{range\.id\}/);
	assert.match(source, /class="volume-scroll-shell"/);
	assert.match(source, /data-volume-scroll-pane/);
	assert.match(source, /data-scroll-newest=\{range\.days\.length > 30 \? "true" : "false"\}/);
	assert.match(source, /style=\{`--volume-chart-width: \$\{volumeChartWidth\(range\.days\.length\)\}px`\}/);
	assert.match(source, /grid-auto-columns: minmax\(14px, 1fr\)/);
	assert.match(source, /function syncVolumeScrollPanes/);
	assert.match(source, /pane\.scrollLeft = volumeScrollMax\(pane\)/);
	assert.match(source, /document\.addEventListener\("wheel"/);
	assert.match(source, /class="calendar-grid" role="group"/);
	assert.match(source, /data-calendar-day/);
	assert.match(source, /data-activity-day/);
	assert.match(source, /data-date-label=\{formatFullDate\(day\.date\)\}/);
	assert.match(source, /data-primary-line=\{calendarDayPrimaryLine\(day\)\}/);
	assert.match(source, /data-sessions=\{String\(day\.sessions\)\}/);
	assert.match(source, /data-progress-updates=\{String\(day\.progressUpdates\)\}/);
	assert.match(source, /data-books-read=\{String\(day\.booksRead\)\}/);
	assert.match(source, /data-work-breakdown=\{activityDayWorkBreakdownJson\(day\)\}/);
	assert.match(source, /data-finished-titles=\{JSON\.stringify\(day\.finishedTitles\)\}/);
	assert.match(source, /aria-label=\{calendarDayAriaLabel\(day\)\}/);
	assert.match(source, /id="calendar-day-tooltip"/);
	assert.match(source, /role="tooltip"/);
	assert.match(source, /function positionCalendarTooltip\(button\)/);
	assert.match(source, /bottomReserve = 92/);
	assert.match(source, /space: Math\.max/);
	assert.match(source, /sort\(\(a, b\) => b\.space - a\.space\)/);
	assert.match(source, /document\.addEventListener\("pointerover"/);
	assert.match(source, /document\.addEventListener\("focusin"/);
	assert.match(source, /document\.addEventListener\("click"/);
	assert.match(source, /event\.key === "Escape"/);
	assert.match(source, /window\.addEventListener\("scroll", syncCalendarTooltipPosition/);
	assert.match(source, /activeCalendarDay\.removeAttribute\("aria-describedby"\)/);
});

test("Reading Timeline author links use canonical author slugs, not numeric author ids", () => {
	const source = readFileSync("src/pages/reading-life.astro", "utf8");

	assert.equal(authorHref("Mary Pope Osborne", 529), "/author/mary-pope-osborne");
	assert.equal(authorHref("Kim Spencer", 42), "/author/kim-spencer");
	assert.equal(authorHref("Evelyn Clarke", 43), "/author/evelyn-clarke");
	assert.equal(authorHref("Dave Barry", 44), "/author/dave-barry");
	assert.equal(authorHref("Mona Awad", 45), "/author/mona-awad");
	assert.equal(authorHref("Andrew Peterson", 46), "/author/andrew-peterson");
	assert.match(source, /import \{ authorHref \} from "\.\.\/lib\/author"/);
	assert.match(source, /function timelineAuthorHref/);
	assert.match(source, /return authorHref\(book\.author, book\.authorId\)/);
	assert.match(source, /<a href=\{timelineAuthorHref\(book\)\}>\{book\.author\}<\/a>/);
	assert.doesNotMatch(source, /\/author\/\$\{encodeURIComponent\(String\(id\)\)\}/);
	assert.doesNotMatch(source, /\/author\?name=\$\{encodeURIComponent\(name\)\}/);
});
