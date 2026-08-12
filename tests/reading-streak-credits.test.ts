import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateReadingStreak, buildDailyReadingActivity, buildReadingLifeSummary } from "../src/lib/readingLife.ts";
import {
	mergeStreakDateKeys,
	planStreakCreditRange,
	buildStreakRepairTimeline,
	findStreakGaps,
	normalizeStreakCreditDate
} from "../src/lib/readingStreakCredits.ts";

test("missing day breaks streak until an explicit credit restores continuity", () => {
	const now = new Date("2026-08-11T12:00:00Z");
	const realActivity = ["2026-08-11", "2026-08-10", "2026-08-08"];
	assert.equal(calculateReadingStreak(realActivity, now), 2);

	const repaired = mergeStreakDateKeys(realActivity, ["2026-08-09"]);
	assert.equal(calculateReadingStreak(repaired, now), 4);

	const removedAgain = mergeStreakDateKeys(realActivity, []);
	assert.equal(calculateReadingStreak(removedAgain, now), 2);
});

test("credit and real activity on the same date count once", () => {
	const now = new Date("2026-08-11T12:00:00Z");
	const repaired = mergeStreakDateKeys(
		["2026-08-11", "2026-08-10", "2026-08-09"],
		["2026-08-10", "2026-08-09"]
	);
	assert.deepEqual(repaired, ["2026-08-11", "2026-08-10", "2026-08-09"]);
	assert.equal(calculateReadingStreak(repaired, now), 3);
});

test("date-range repair only credits missing dates", () => {
	const plan = planStreakCreditRange({
		startDate: "2026-07-01",
		endDate: "2026-07-05",
		readingDateKeys: ["2026-07-01", "2026-07-03", "2026-07-05"],
		creditDateKeys: ["2026-07-04"]
	});
	assert.equal(plan.selectedDates.length, 5);
	assert.deepEqual(plan.readingActivityDates, ["2026-07-01", "2026-07-03", "2026-07-05"]);
	assert.deepEqual(plan.existingCreditDates, ["2026-07-04"]);
	assert.deepEqual(plan.datesRequiringCredit, ["2026-07-02"]);
});

test("streak credits do not alter reading volume or finished-book statistics", () => {
	const finishedBooks = [
		{ id: 1, title: "Finished", author: "Reader", pageCount: 320, finishedDate: "2026-08-08" }
	];
	const progressEvents = [
		{ bookId: 2, title: "Progress", author: "Reader", date: "2026-08-10", pageDelta: 24 },
		{ bookId: 2, title: "Progress", author: "Reader", date: "2026-08-11", pageDelta: 16 }
	];
	const now = new Date("2026-08-11T12:00:00Z");
	const before = buildReadingLifeSummary({ finishedBooks, currentBooks: [], progressEvents, now });
	const after = buildReadingLifeSummary({ finishedBooks, currentBooks: [], progressEvents, streakCreditDates: ["2026-08-09"], now });
	const beforeVolume = buildDailyReadingActivity({ finishedBooks, progressEvents, startDate: "2026-08-08", endDate: "2026-08-11" });
	const afterVolume = buildDailyReadingActivity({ finishedBooks, progressEvents, startDate: "2026-08-08", endDate: "2026-08-11" });

	assert.equal(before.overview.readingStreakDays, 2);
	assert.equal(after.overview.readingStreakDays, 4);
	assert.equal(after.overview.pagesReadThisYear, before.overview.pagesReadThisYear);
	assert.equal(after.overview.booksCompletedThisYear, before.overview.booksCompletedThisYear);
	assert.equal(after.overview.averageBookLength, before.overview.averageBookLength);
	assert.deepEqual(afterVolume, beforeVolume);
	const creditDay = afterVolume.find((day) => day.date === "2026-08-09");
	assert.equal(creditDay?.pageEquivalents, 0);
	assert.equal(creditDay?.progressUpdates, 0);
	assert.equal(creditDay?.finishes, 0);
	assert.equal(creditDay?.active, false);
});

test("repair timeline distinguishes real reading days, credits, overlaps, and gaps", () => {
	const timeline = buildStreakRepairTimeline({
		now: new Date("2026-08-11T12:00:00Z"),
		days: 4,
		readingDateKeys: ["2026-08-11", "2026-08-10", "2026-08-08"],
		creditDateKeys: ["2026-08-10", "2026-08-09"]
	});
	assert.deepEqual(timeline.map((day) => [day.date, day.status]), [
		["2026-08-11", "reading"],
		["2026-08-10", "both"],
		["2026-08-09", "credit"],
		["2026-08-08", "reading"]
	]);
	assert.deepEqual(findStreakGaps({
		now: new Date("2026-08-11T12:00:00Z"),
		days: 5,
		readingDateKeys: ["2026-08-11"],
		creditDateKeys: []
	}), ["2026-08-10", "2026-08-09", "2026-08-08", "2026-08-07"]);
});

test("streak credit dates use the same normalized calendar-day behavior as reading activity", () => {
	assert.equal(normalizeStreakCreditDate("2026-08-10T23:30:00-05:00"), "2026-08-11");
	assert.equal(normalizeStreakCreditDate("2026-08-11"), "2026-08-11");
});

test("streak credits are explicit admin data and participate in achievements", () => {
	const migration = readFileSync("db/migrations/2026-08-11-reader-streak-credits.sql", "utf8");
	const schema = readFileSync("db/neon-schema.sql", "utf8");
	const helper = readFileSync("src/lib/readingStreakCredits.ts", "utf8");
	const notifications = readFileSync("src/lib/notifications.ts", "utf8");
	const readingSummary = readFileSync("src/lib/readingSummary.ts", "utf8");
	const adminPage = readFileSync("src/pages/admin/users/[username].astro", "utf8");

	assert.match(migration, /create table if not exists reader_streak_credit/);
	assert.match(schema, /create table if not exists reader_streak_credit/);
	assert.match(schema, /unique \(user_id, credit_date\)/);
	assert.match(helper, /created_by_admin uuid references app_user/);
	assert.match(readingSummary, /ensureStreakCreditSchema/);
	assert.match(readingSummary, /select distinct credit_date as day\s+from reader_streak_credit/);
	assert.match(notifications, /calculateCurrentReadingStreakFromSql/);
	assert.doesNotMatch(notifications, /from user_reading_progress_event[\s\S]+numbered[\s\S]+streak_days/);
	assert.match(adminPage, /resolveAdminSession\(Astro\.request\)/);
	assert.match(adminPage, /if \(!admin\.isAdmin\) return Astro\.redirect\("\/"\)/);
	assert.match(adminPage, /Reading Streak Repair/);
	assert.match(adminPage, /addStreakCreditsForRange/);
	assert.match(adminPage, /removeStreakCredit/);
	assert.match(adminPage, /createReadingMilestoneNotifications\(sql, user\.id, \{ checkStreak: true \}\)/);
});
