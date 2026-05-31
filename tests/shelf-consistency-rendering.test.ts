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
