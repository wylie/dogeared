import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("home page includes onboarding checklist guidance", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	assert.equal(source.includes("Getting Started"), true);
	assert.equal(source.includes("data-onboarding-checklist"), true);
	assert.equal(source.includes("dismiss-onboarding-checklist"), true);
});

test("home page includes recommendation fallback section", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	assert.equal(source.includes("Popular With Readers"), true);
	assert.equal(source.includes("Start here while Dogeared learns your taste"), true);
});

test("home empty state is actionable", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	assert.equal(source.includes("Start by searching for a favorite book"), true);
});

test("search page empty states are actionable", () => {
	const source = readFileSync("src/pages/search.astro", "utf8");
	assert.equal(source.includes("Search for a favorite title"), true);
	assert.equal(source.includes("Try a broader title, an author name, or fewer keywords."), true);
});

test("following page empty states explain next steps", () => {
	const source = readFileSync("src/pages/following.astro", "utf8");
	assert.equal(source.includes("Add a few books and ratings to get better people-to-follow matches."), true);
	assert.equal(source.includes("Follow a few more readers or check back after your next reading update."), true);
});

test("shelf removal client surfaces specific API errors", () => {
	const source = readFileSync("src/lib/shelfClient.ts", "utf8");
	assert.equal(source.includes("resolveShelfRemoveMessage"), true);
	assert.equal(source.includes("This book is already off your shelves."), true);
});
