import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("book activity cards no longer seed review text into comments", () => {
	const source = readFileSync("src/pages/book.astro", "utf8");
	assert.equal(source.includes("data-seeded-comments"), false);
	assert.equal(source.includes("buildReviewComment"), false);
});

test("profile activity cards no longer seed review text into comments", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes("data-seeded-comments"), false);
	assert.equal(source.includes("buildReviewComment"), false);
});
