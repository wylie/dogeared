import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterExternalAuthorBooks } from "../src/lib/externalAuthorBooks.ts";

test("visitor and new-reader guidance use persistent dismissible cookie flows", () => {
	const source = readFileSync("src/components/ReaderGuidance.astro", "utf8");
	assert.equal(source.includes('writeCookie("dogeared_new_visitor", "true")'), true);
	assert.equal(source.includes("dogeared_visitor_guidance_dismissed"), true);
	assert.equal(source.includes("dogeared_new_reader"), true);
	assert.equal(source.includes("dogeared_reader_guidance_dismissed"), true);
	assert.equal(source.includes('data-guidance-dismiss'), true);
	assert.equal(source.includes('document.getElementById("left-hand-search")'), true);
});

test("account creation transitions visitor guidance to new-reader guidance", () => {
	const source = readFileSync("src/pages/api/auth/verify.ts", "utf8");
	assert.equal(source.includes("dogeared_new_visitor=;"), true);
	assert.equal(source.includes("dogeared_new_reader=true;"), true);
});

test("onboarding completion requires shelf, rating, and review milestones", () => {
	const source = readFileSync("src/pages/api/onboarding/status.ts", "utf8");
	assert.equal(source.includes("status.shelfEntries > 0 && status.ratings > 0 && status.reviews > 0"), true);
});

test("external author books exclude local titles and duplicates", () => {
	const rows = [
		{ key: "/works/OL1W", title: "Known Book", author_name: ["A. Writer"] },
		{ key: "/works/OL2W", title: "New Book", author_name: ["A. Writer"], first_publish_year: 2024 },
		{ key: "/works/OL3W", title: "New Book", author_name: ["A. Writer"] }
	];
	const result = filterExternalAuthorBooks(rows, ["Known Book"]);
	assert.equal(result.length, 1);
	assert.equal(result[0]?.title, "New Book");
	assert.equal(result[0]?.sourceUrl, "https://openlibrary.org/works/OL2W");
});

test("author pages separate local and external books", () => {
	const source = readFileSync("src/pages/author.astro", "utf8");
	assert.equal(source.includes("Books In Dogeared"), true);
	assert.equal(source.includes("<ExternalAuthorBooks books={externalBooks}"), true);
});

test("BookCard renders accessible genre navigation", () => {
	const source = readFileSync("src/components/BookCard.astro", "utf8");
	assert.equal(source.includes('aria-label="Genres"'), true);
	assert.equal(source.includes("/related?kind=genre&value="), true);
});

test("profile finish workflow updates shelves and activity optimistically", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes('data-shelf-count="reading"'), true);
	assert.equal(source.includes('data-shelf-count="finished"'), true);
	assert.equal(source.includes('activityClone.dataset.optimisticActivity = "finished"'), true);
	assert.equal(source.includes("readGrid.prepend(card)"), true);
});

test("Argon Collective attribution appears in shared and company-facing surfaces", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const mission = readFileSync("src/pages/mission.astro", "utf8");
	const roadmap = readFileSync("src/pages/roadmap.astro", "utf8");
	const settings = readFileSync("src/pages/settings.astro", "utf8");
	for (const source of [layout, mission, roadmap, settings]) {
		assert.equal(source.includes("Argon Collective LLC"), true);
	}
});
