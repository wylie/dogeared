import assert from "node:assert/strict";
import test from "node:test";
import { buildReaderReadingSummary } from "../src/lib/readingSummary.ts";

test("reader reading summary derives streak and momentum from progress history", () => {
	const summary = buildReaderReadingSummary({
		now: new Date("2026-01-15T12:00:00Z"),
		progressDateKeys: ["2026-01-15", "2026-01-14", "2026-01-13"],
		currentlyReading: [{
			bookId: 7,
			title: "The Long Chapter",
			author: "A. Reader",
			authorId: 0,
			thumbnail: "",
			language: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "",
			description: "",
			currentPage: 84,
			totalPages: 240,
			preferredProgressType: "page",
			updatedAt: "2026-01-15T10:00:00Z",
			firstAddedAt: "2026-01-08T10:00:00Z",
			progressUpdates: 3,
			genres: []
		}]
	});
	assert.equal(summary.readingStreakDays, 3);
	assert.equal(summary.momentumScore > 0, true);
	assert.equal(summary.momentumBooks[0]?.predictionEligible, true);
	assert.equal(summary.momentumBooks[0]?.progressUpdateCount, 3);
	assert.match(summary.momentumNextAction, /The Long Chapter/);
});

test("reader reading summary does not invent a streak from current shelf timestamps", () => {
	const summary = buildReaderReadingSummary({
		now: new Date("2026-01-15T12:00:00Z"),
		progressDateKeys: [],
		currentlyReading: [{
			bookId: 8,
			title: "Freshly Opened",
			author: "A. Reader",
			authorId: 0,
			thumbnail: "",
			language: "",
			isbn10: "",
			isbn13: "",
			googleBooksId: "",
			description: "",
			currentPage: 24,
			totalPages: 220,
			preferredProgressType: "page",
			updatedAt: "2026-01-15T10:00:00Z",
			firstAddedAt: "2026-01-15T10:00:00Z",
			progressUpdates: 0,
			genres: []
		}]
	});
	assert.equal(summary.readingStreakDays, 0);
	assert.deepEqual(summary.readingStreakDateKeys, []);
});
