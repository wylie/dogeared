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
	const pageSource = readFileSync("src/pages/roadmap.astro", "utf8");
	const dataSource = readFileSync("src/lib/roadmap.ts", "utf8");
	const idxNow = pageSource.indexOf('{ id: "now", label: "Now" }');
	const idxNext = pageSource.indexOf('{ id: "next", label: "Next" }');
	const idxLater = pageSource.indexOf('{ id: "later", label: "Later" }');
	const idxShipped = pageSource.indexOf('{ id: "recently-shipped", label: "Shipped" }');
	const idxCompleted = pageSource.indexOf('{ id: "recently-completed", label: "Completed" }');
	assert.ok(pageSource.includes("ROADMAP_ITEMS"));
	assert.ok(pageSource.includes("ROADMAP_SECTIONS"));
	assert.ok(pageSource.includes("RECENTLY_COMPLETED_ITEMS"));
	assert.ok(idxNow > -1);
	assert.ok(idxNext > -1);
	assert.ok(idxLater > -1);
	assert.ok(idxShipped > -1);
	assert.ok(idxCompleted > -1);
	assert.ok(idxNow < idxNext);
	assert.ok(idxNext < idxLater);
	assert.ok(idxLater < idxShipped);
	assert.ok(idxShipped < idxCompleted);
	assert.ok(pageSource.includes("loadPublishedReleases"));
	assert.ok(pageSource.includes("Recently Shipped"));
	assert.ok(dataSource.includes('category: "now"'));
	assert.ok(dataSource.includes('category: "next"'));
	assert.ok(dataSource.includes('category: "later"'));
	assert.ok(dataSource.includes('category: "completed"'));
});
