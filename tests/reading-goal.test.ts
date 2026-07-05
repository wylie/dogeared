import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
	assert.equal(source.includes("filterBooksCompletedForReadingGoal"), true);
	assert.equal(source.includes("resolveReadingGoalProgress"), true);
	assert.equal(source.includes('aria-label="Reading goal progress"'), true);
});
