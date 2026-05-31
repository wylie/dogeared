import test from "node:test";
import assert from "node:assert/strict";
import { buildBookReviewList } from "../src/lib/bookReviews.ts";

test("buildBookReviewList returns review objects with rating and identity fields", () => {
	const rows = [{
		user_id: "user-1",
		username: "wylie",
		rating: 4,
		finished_reflection: "Another great Murderbot book!",
		updated_at: "2026-05-28T10:00:00.000Z"
	}];
	const reviews = buildBookReviewList(rows);
	assert.equal(reviews.length, 1);
	assert.equal(reviews[0]?.username, "wylie");
	assert.equal(reviews[0]?.rating, 4);
	assert.equal(reviews[0]?.body, "Another great Murderbot book!");
});

test("buildBookReviewList excludes empty review bodies", () => {
	const reviews = buildBookReviewList([{
		user_id: "user-1",
		username: "wylie",
		rating: 5,
		finished_reflection: "   ",
		updated_at: "2026-05-28T10:00:00.000Z"
	}]);
	assert.equal(reviews.length, 0);
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
