import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("shelf dropdown includes remove action and custom shelf options container", () => {
	const source = readFileSync("src/components/ShelfDropdown.astro", "utf8");
	assert.equal(source.includes('data-action="remove-from-shelves"'), true);
	assert.equal(source.includes("data-custom-shelf-options"), true);
});

test("comment loading text is not rendered for passive card hydration", () => {
	const profileSource = readFileSync("src/pages/profile/[username].astro", "utf8");
	const bookSource = readFileSync("src/pages/book.astro", "utf8");
	assert.equal(profileSource.includes("Loading comments..."), false);
	assert.equal(bookSource.includes("Loading comments..."), false);
});

test("mobile comment form buttons enforce symmetric padding and min width", () => {
	const profileSource = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(profileSource.includes("min-width: 3.1rem;"), true);
	assert.equal(profileSource.includes("padding: 0 0.9rem;"), true);
});

test("roadmap prioritizes reader-facing ordering", () => {
	const source = readFileSync("src/pages/roadmap.astro", "utf8");
	const idxRecommendations = source.indexOf('title: "Recommendations"');
	const idxOnboarding = source.indexOf('title: "Reader Onboarding"');
	const idxFollowedFeed = source.indexOf('title: "Followed Readers Feed"');
	const idxRelated = source.indexOf('title: "Related Books"');
	assert.ok(idxRecommendations > -1);
	assert.ok(idxOnboarding > -1);
	assert.ok(idxFollowedFeed > -1);
	assert.ok(idxRelated > -1);
	assert.ok(idxRecommendations < idxOnboarding);
	assert.ok(idxOnboarding < idxFollowedFeed);
	assert.ok(idxFollowedFeed < idxRelated);
});
