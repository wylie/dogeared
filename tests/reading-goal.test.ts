import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalizeFinishedBooks, filterCanonicalFinishedBooksForYear } from "../src/lib/finishedBooks.ts";
import {
	filterBooksCompletedForReadingGoal,
	parseAnnualReadingGoal,
	readingGoalYear,
	resolveReadingGoalProgress
} from "../src/lib/readingGoal.ts";

test("parseAnnualReadingGoal accepts positive numeric goals", () => {
	assert.equal(parseAnnualReadingGoal("100"), 100);
	assert.equal(parseAnnualReadingGoal("1,200 books"), 1200);
	assert.equal(parseAnnualReadingGoal("0"), 0);
	assert.equal(parseAnnualReadingGoal("not set"), 0);
});

test("resolveReadingGoalProgress calculates percent, remaining, and pace", () => {
	const progress = resolveReadingGoalProgress({
		goal: 100,
		completed: 21,
		now: new Date("2026-03-01T12:00:00Z")
	});
	assert.equal(progress.percent, 21);
	assert.equal(progress.barPercent, 21);
	assert.equal(progress.remaining, 79);
	assert.equal(progress.detailLabel, "79 books remaining");
	assert.equal(progress.paceTone, "ahead");
	assert.equal(progress.paceLabel, "5 books ahead of pace");
});

test("resolveReadingGoalProgress handles achieved and unset goals", () => {
	const achieved = resolveReadingGoalProgress({
		goal: 10,
		completed: 12,
		now: new Date("2026-12-31T12:00:00Z")
	});
	assert.equal(achieved.percent, 120);
	assert.equal(achieved.barPercent, 100);
	assert.equal(achieved.remaining, 0);
	assert.equal(achieved.beyond, 2);
	assert.equal(achieved.detailLabel, "Goal achieved! 2 books beyond your goal");

	const unset = resolveReadingGoalProgress({ goal: "", completed: 3 });
	assert.equal(unset.goal, 0);
	assert.equal(unset.percent, 0);
	assert.equal(unset.paceTone, "none");
	assert.equal(unset.detailLabel, "3 books finished this year");
});

test("reading goal completion helper uses finished dates as the shared annual source", () => {
	const now = new Date("2026-07-05T12:00:00Z");
	const completed = filterBooksCompletedForReadingGoal([
		{ title: "Finished", finishedDate: "2026-01-10" },
		{ title: "No date", finishedDate: "" },
		{ title: "Prior year", finishedDate: "2025-12-31" }
	], now);
	assert.equal(readingGoalYear(now), 2026);
	assert.equal(completed.length, 1);
	assert.equal((completed[0] as any).title, "Finished");
});

test("canonical finished book filter counts one Work per year from finished dates", () => {
	const books = canonicalizeFinishedBooks([
		{
			id: 1,
			bookId: 1,
			workId: 10,
			title: "Multiple Edition Book",
			author: "Taylor Reed",
			finishedDate: "2026-02-01",
			updatedAt: "2026-02-01T12:00:00Z"
		},
		{
			id: 2,
			bookId: 2,
			workId: 10,
			title: "Multiple Edition Book: Paperback",
			author: "Taylor Reed",
			finishedDate: "2026-02-01",
			updatedAt: "2026-02-01T10:00:00Z"
		},
		{
			id: 3,
			bookId: 3,
			workId: 11,
			title: "Activity Only",
			author: "Taylor Reed",
			finishedDate: "",
			updatedAt: "2026-03-01T10:00:00Z"
		},
		{
			id: 4,
			bookId: 4,
			workId: 12,
			title: "Moved Out and Back",
			author: "Morgan Lee",
			finishedDate: "2026-04-15",
			updatedAt: "2026-04-16T10:00:00Z"
		},
		{
			id: 5,
			bookId: 5,
			workId: 12,
			title: "Moved Out and Back",
			author: "Morgan Lee",
			finishedDate: "2026-04-15",
			updatedAt: "2026-04-15T10:00:00Z"
		},
		{
			id: 6,
			bookId: 6,
			workId: 13,
			title: "Prior Year",
			author: "Morgan Lee",
			finishedDate: "2025-12-31",
			updatedAt: "2025-12-31T10:00:00Z"
		}
	]);

	const completed2026 = filterCanonicalFinishedBooksForYear(books, 2026);
	assert.deepEqual(completed2026.map((book) => book.title), ["Moved Out and Back", "Multiple Edition Book"]);
	assert.equal(filterCanonicalFinishedBooksForYear(books, 2025).length, 1);
});

test("profile page renders reading goal between profile card and shelf summary", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const aboutIndex = source.indexOf('<section id="about" class="profile-card">');
	const goalIndex = source.indexOf('<section id="reading-goal" class="reading-goal-card">');
	const summaryIndex = source.indexOf('<section id="shelf-summary" class="shelf-card">');
	assert.ok(aboutIndex >= 0);
	assert.ok(goalIndex > aboutIndex);
	assert.ok(summaryIndex > goalIndex);
	assert.equal(source.includes("<strong>Reading goal:</strong>"), false);
	assert.equal(source.includes("booksCompletedThisYear"), true);
	assert.equal(source.includes("loadFinishedBooksForReader"), true);
	assert.equal(source.includes("filterCanonicalFinishedBooksForYear"), true);
	assert.equal(source.includes("resolveReadingGoalProgress"), true);
	assert.equal(source.includes('aria-label="Reading goal progress"'), true);
});

test("profile refreshes annual reading goal and shelf summary after shelf mutations", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const refreshHelper = source.slice(
		source.indexOf("async function refreshProfileSummarySectionsFromServer"),
		source.indexOf("async function hydrateShelfEntriesFromServer")
	);

	assert.match(refreshHelper, /fetch\(window\.location\.href/);
	assert.match(refreshHelper, /"X-Dogeared-Partial": "profile-reading-summary"/);
	assert.match(refreshHelper, /new DOMParser\(\)\.parseFromString\(html, "text\/html"\)/);
	assert.match(refreshHelper, /\["reading-goal", "shelf-summary"\]/);
	assert.match(refreshHelper, /current\.replaceWith\(next\)/);
	assert.match(refreshHelper, /await refreshProfileSummarySectionsFromServer\(\)/);
	assert.doesNotMatch(refreshHelper, /window\.location\.reload/);
});
