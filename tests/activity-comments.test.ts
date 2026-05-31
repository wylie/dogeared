import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewComment, mergeActivityComments } from "../src/lib/activityComments.ts";

test("buildReviewComment returns null for empty review body", () => {
	assert.equal(buildReviewComment({
		body: "   ",
		username: "wylie",
		createdAt: "2026-05-31T12:00:00.000Z"
	}), null);
});

test("buildReviewComment builds first-class comment object", () => {
	const comment = buildReviewComment({
		body: "Another great Murderbot book!",
		username: "@wylie",
		createdAt: "2026-05-31T12:00:00.000Z",
		isMine: true
	});
	assert.equal(comment?.id, 0);
	assert.equal(comment?.username, "wylie");
	assert.equal(comment?.body, "Another great Murderbot book!");
	assert.equal(comment?.isMine, true);
});

test("mergeActivityComments preserves seeded review comment and discussion comments", () => {
	const merged = mergeActivityComments(
		[{ id: 0, username: "wylie", body: "Another great Murderbot book!", createdAt: "2026-05-31T12:00:00.000Z" }],
		[{ id: 42, username: "reader2", body: "Agreed.", createdAt: "2026-05-31T13:00:00.000Z" }]
	);
	assert.equal(merged.length, 2);
	assert.equal(merged[0]?.body, "Another great Murderbot book!");
	assert.equal(merged[1]?.id, 42);
});

test("mergeActivityComments dedupes same username/body comments", () => {
	const merged = mergeActivityComments(
		[{ id: 0, username: "wylie", body: "Great read", createdAt: "2026-05-31T12:00:00.000Z" }],
		[{ id: 99, username: "wylie", body: "Great read", createdAt: "2026-05-31T12:05:00.000Z" }]
	);
	assert.equal(merged.length, 1);
});
