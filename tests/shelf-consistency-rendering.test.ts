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

test("profile progress updater uses equal Save and Finish action columns", () => {
	const profileSource = readFileSync("src/pages/profile/[username].astro", "utf8");
	const overviewSource = readFileSync("docs/product/overview.md", "utf8");

	assert.equal(profileSource.includes("<span>Finish</span>"), true);
	assert.equal(profileSource.includes('<span class="material-icons" aria-hidden="true">check</span>'), true);
	assert.equal(profileSource.includes("grid-template-areas:"), true);
	assert.equal(profileSource.includes('"type input"'), true);
	assert.equal(profileSource.includes('"save finish"'), true);
	assert.equal(profileSource.includes("grid-area: save;"), true);
	assert.equal(profileSource.includes("grid-area: finish;"), true);
	assert.equal(profileSource.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);"), true);
	assert.equal(profileSource.includes("@media (max-width: 319px)"), true);
	assert.equal(profileSource.includes("width: 44px;"), false);
	assert.equal(profileSource.includes(">Complete\n"), false);
	assert.equal(overviewSource.includes("Save, and Finish actions"), true);
});

test("roadmap reads like a public product direction page", () => {
	const pageSource = readFileSync("src/pages/roadmap.astro", "utf8");
	const dataSource = readFileSync("src/lib/roadmap.ts", "utf8");
	const idxNow = pageSource.indexOf('{ id: "building-now", label: "Now" }');
	const idxShipped = pageSource.indexOf('{ id: "recently-shipped", label: "Shipped" }');
	const idxNext = pageSource.indexOf('{ id: "coming-next", label: "Next" }');
	const idxAhead = pageSource.indexOf('{ id: "looking-ahead", label: "Ahead" }');
	const idxFeedback = pageSource.indexOf('{ id: "help-shape", label: "Feedback" }');
	assert.ok(pageSource.includes("ROADMAP_ITEMS"));
	assert.ok(pageSource.includes("ROADMAP_SECTIONS"));
	assert.ok(idxNow > -1);
	assert.ok(idxShipped > -1);
	assert.ok(idxNext > -1);
	assert.ok(idxAhead > -1);
	assert.ok(idxFeedback > -1);
	assert.ok(idxNow < idxShipped);
	assert.ok(idxShipped < idxNext);
	assert.ok(idxNext < idxAhead);
	assert.ok(idxAhead < idxFeedback);
	assert.ok(pageSource.includes("loadPublishedReleases"));
	assert.ok(pageSource.includes("Current Version"));
	assert.ok(pageSource.includes("DogEared Beta"));
	assert.ok(pageSource.includes("View Release Notes"));
	assert.ok(pageSource.includes("Building Now"));
	assert.ok(pageSource.includes("Recently Shipped"));
	assert.ok(dataSource.includes("Coming Next"));
	assert.ok(dataSource.includes("Looking Ahead"));
	assert.ok(pageSource.includes("Help Shape DogEared"));
	assert.ok(pageSource.includes("Founding Readers"));
	assert.ok(pageSource.includes("Send Feedback"));
	assert.equal(pageSource.includes("priority-label"), false);
	for (const term of ["Priority", "Backlog", "Task", "progress bars", "Completed percentages"]) {
		assert.equal(pageSource.includes(term), false);
	}
	assert.equal(dataSource.includes("priority"), false);
	assert.equal(dataSource.includes("Primary"), false);
	assert.equal(dataSource.includes("High"), false);
	assert.equal(dataSource.includes("Medium"), false);
	assert.equal(dataSource.includes("Low"), false);
	assert.ok(dataSource.includes('category: "now"'));
	assert.ok(dataSource.includes('category: "next"'));
	assert.ok(dataSource.includes('category: "later"'));
});
