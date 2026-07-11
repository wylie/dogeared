import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	buildBookReviewList,
	normalizeReviewBody,
	normalizeReviewRating,
	normalizeReviewTitle
} from "../src/lib/bookReviews.ts";

test("buildBookReviewList returns review objects with rating and identity fields", () => {
	const rows = [{
		user_id: "user-1",
		username: "wylie",
		rating: 4,
		review_title: "Fast and sharp",
		finished_reflection: "Another great Murderbot book!",
		review_spoiler: true,
		review_updated_at: "2026-05-29T10:00:00.000Z",
		updated_at: "2026-05-28T10:00:00.000Z"
	}];
	const reviews = buildBookReviewList(rows);
	assert.equal(reviews.length, 1);
	assert.equal(reviews[0]?.username, "wylie");
	assert.equal(reviews[0]?.rating, 4);
	assert.equal(reviews[0]?.title, "Fast and sharp");
	assert.equal(reviews[0]?.body, "Another great Murderbot book!");
	assert.equal(reviews[0]?.hasSpoiler, true);
	assert.equal(reviews[0]?.reviewDate, "2026-05-29T10:00:00.000Z");
});

test("buildBookReviewList excludes entries without title or body", () => {
	const reviews = buildBookReviewList([{
		user_id: "user-1",
		username: "wylie",
		rating: 5,
		finished_reflection: "   ",
		updated_at: "2026-05-28T10:00:00.000Z"
	}]);
	assert.equal(reviews.length, 0);
});

test("buildBookReviewList keeps title-only reviews", () => {
	const reviews = buildBookReviewList([{
		user_id: "user-1",
		username: "wylie",
		rating: 5,
		review_title: "Recommended",
		finished_reflection: "   ",
		updated_at: "2026-05-28T10:00:00.000Z"
	}]);
	assert.equal(reviews.length, 1);
	assert.equal(reviews[0]?.title, "Recommended");
});

test("buildBookReviewList orders reviews newest first", () => {
	const reviews = buildBookReviewList([
		{
			user_id: "user-1",
			username: "reader1",
			rating: 3,
			finished_reflection: "Older review",
			updated_at: "2026-05-20T10:00:00.000Z"
		},
		{
			user_id: "user-2",
			username: "reader2",
			rating: 5,
			finished_reflection: "Newer review",
			updated_at: "2026-05-29T10:00:00.000Z"
		}
	]);
	assert.equal(reviews.length, 2);
	assert.equal(reviews[0]?.body, "Newer review");
	assert.equal(reviews[1]?.body, "Older review");
});

test("review normalizers support v2 editor fields", () => {
	assert.equal(normalizeReviewTitle(` ${"a".repeat(180)} `).length, 160);
	assert.equal(normalizeReviewBody(` ${"b".repeat(4100)} `).length, 4000);
	assert.equal(normalizeReviewRating("5"), 5);
	assert.equal(normalizeReviewRating("6"), null);
	assert.equal(normalizeReviewRating("bad"), null);
});

test("reading reviews v2 is wired through schema, API, book page, and profile", () => {
	const schema = readFileSync("db/neon-schema.sql", "utf8");
	const migration = readFileSync("db/migrations/2026-07-04-reading-reviews-v2.sql", "utf8");
	const api = readFileSync("src/pages/api/reviews/entry.ts", "utf8");
	const shelfApi = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const bookPage = readFileSync("src/pages/book.astro", "utf8");
	const profilePage = readFileSync("src/pages/profile/[username].astro", "utf8");

	for (const source of [schema, migration, shelfApi]) {
		assert.match(source, /review_title/);
		assert.match(source, /review_spoiler/);
		assert.match(source, /review_updated_at/);
	}
	assert.match(api, /resolveUserBySession/);
	assert.match(api, /Mark this book Read before writing a public review/);
	assert.match(api, /export const DELETE/);
	assert.match(bookPage, /data-review-editor/);
	assert.match(bookPage, /Public recommendation/);
	assert.match(bookPage, /This review contains spoilers/);
	assert.match(bookPage, /Show full review/);
	assert.match(profilePage, /profile-review-controls/);
	assert.match(profilePage, /review_sort/);
	assert.match(profilePage, /review_filter/);
	assert.match(profilePage, /Private thoughts while reading stay in the Reading Journal/);
});

test("book detail avoids duplicate review CTAs and reserved comment feedback space", () => {
	const bookPage = readFileSync("src/pages/book.astro", "utf8");

	assert.match(bookPage, /const canViewerWriteReview = isAuthenticated && Number\(book\?\.id \|\| 0\) > 0 && viewerShelfStatus === "finished"/);
	assert.match(bookPage, /\{canViewerWriteReview && \(\s*<form\s+class="review-editor"/);
	assert.match(bookPage, /\{canViewerWriteReview \? "No community reviews yet\." : "No written reviews yet\. Reviews help other readers decide what to read next\."\}/);
	assert.doesNotMatch(bookPage, /Your review form is ready above\./);
	assert.doesNotMatch(bookPage, /\{canViewerWriteReview \? \(\s*<a href="#reviews">Write your first review<\/a>/);
	assert.match(bookPage, /\.activity-comment-feedback\[hidden\] \{\s*display: none;\s*\}/);
	assert.doesNotMatch(bookPage, /\.activity-comment-feedback\[hidden\] \{[\s\S]*visibility: hidden/);
	assert.doesNotMatch(bookPage, /\.activity-comment-feedback \{[\s\S]*min-height: 1rem/);
});
