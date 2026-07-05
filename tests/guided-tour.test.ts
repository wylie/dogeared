import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	addGuidedTourTip,
	GUIDED_TIP_IDS,
	normalizeGuidedTipId,
	normalizeGuidedTourSettings
} from "../src/lib/guidedTour.ts";

test("guided tip ids are normalized and unknown ids are rejected", () => {
	assert.equal(normalizeGuidedTipId("home-welcome"), "home-welcome");
	assert.equal(normalizeGuidedTipId("unknown-tip"), "");
	assert.equal(GUIDED_TIP_IDS.includes("reading-journal-private"), true);
	assert.equal(GUIDED_TIP_IDS.includes("book-detail-shelves"), true);
	assert.equal(GUIDED_TIP_IDS.includes("settings-learning"), true);
});

test("guided tour settings dedupe completed and dismissed tips", () => {
	const settings = normalizeGuidedTourSettings({
		showHelpfulTips: false,
		dismissedTips: ["home-welcome", "home-welcome", "unknown-tip"],
		completedTips: ["search-add-book", "search-add-book"]
	});
	assert.deepEqual(settings, {
		showHelpfulTips: false,
		dismissedTips: ["home-welcome"],
		completedTips: ["search-add-book"]
	});
});

test("guided tour tip updates do not duplicate progress", () => {
	const settings = normalizeGuidedTourSettings({});
	const first = addGuidedTourTip(settings, "first-book-added", "completedTips");
	const second = addGuidedTourTip(first, "first-book-added", "completedTips");
	assert.deepEqual(second.completedTips, ["first-book-added"]);
	assert.deepEqual(second.dismissedTips, []);
});

test("guided tip component keeps one ordered catalog with contextual rules", () => {
	const source = readFileSync("src/components/GuidedTip.astro", "utf8");
	const homeIndex = source.indexOf('id: "home-welcome"');
	const searchIndex = source.indexOf('id: "search-add-book"');
	const bookDetailIndex = source.indexOf('id: "book-detail-shelves"');
	const bookAddedIndex = source.indexOf('id: "first-book-added"');
	const journalIndex = source.indexOf('id: "reading-journal-private"');
	const settingsIndex = source.indexOf('id: "settings-learning"');
	assert.equal(homeIndex >= 0, true);
	assert.equal(searchIndex > homeIndex, true);
	assert.equal(bookDetailIndex > searchIndex, true);
	assert.equal(bookAddedIndex > bookDetailIndex, true);
	assert.equal(journalIndex > bookAddedIndex, true);
	assert.equal(settingsIndex > journalIndex, true);
	assert.equal(source.includes("const availableTips = TIPS.filter"), true);
	assert.equal(source.includes("candidate.path || candidate.pathPrefix"), true);
	assert.equal(source.includes("completed.includes(tip.id) || dismissed.includes(tip.id)"), true);
	assert.equal(source.includes("dogeared:reading-data-changed"), true);
});

test("journal guidance is constrained to journal context or a progress update", () => {
	const source = readFileSync("src/components/GuidedTip.astro", "utf8");
	assert.match(source, /id: "reading-journal-private"[\s\S]+path: "\/journal"/);
	assert.match(source, /id: "first-progress-update"[\s\S]+stats\.progressEvents > 0 && stats\.journalEntries === 0/);
});

test("guided tour API stores per-user settings under profile settings", () => {
	const source = readFileSync("src/pages/api/guidance/status.ts", "utf8");
	assert.equal(source.includes("resolveUserBySession"), true);
	assert.equal(source.includes("'{settings,guidedTour}'"), true);
	assert.equal(source.includes('action === "reset"'), true);
	assert.equal(source.includes('action === "dismiss" || action === "complete"'), true);
});

test("settings exposes learning controls and preserves guided tour preferences", () => {
	const source = readFileSync("src/pages/settings.astro", "utf8");
	const preferencesSource = readFileSync("src/pages/api/account/preferences.ts", "utf8");
	assert.equal(source.includes('id="learning-settings"'), true);
	assert.equal(source.includes('id="show-helpful-tips"'), true);
	assert.equal(source.includes('id="reset-guided-tour-button"'), true);
	assert.equal(source.includes("guidedTourState"), true);
	assert.equal(preferencesSource.includes("normalizeGuidedTourSettings"), true);
	assert.equal(preferencesSource.includes("guidedTour:"), true);
});

test("guided tour anchors are present on primary surfaces", () => {
	assert.equal(readFileSync("src/pages/index.astro", "utf8").includes('data-guided-anchor="home-intro"'), true);
	assert.equal(readFileSync("src/pages/search.astro", "utf8").includes('data-guided-anchor="search-page"'), true);
	assert.equal(readFileSync("src/pages/journal.astro", "utf8").includes('data-guided-anchor="journal-entry-form"'), true);
	assert.equal(readFileSync("src/pages/book.astro", "utf8").includes('data-guided-anchor="reviews"'), false);
	assert.equal(readFileSync("src/components/GuidedTip.astro", "utf8").includes("Choose the right place"), false);
});

test("fresh-user home guidance is mounted and starts from Home", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const component = readFileSync("src/components/GuidedTip.astro", "utf8");
	assert.equal(layout.includes("<GuidedTip isAuthenticated={isAuthenticated} />"), true);
	assert.match(component, /id: "home-welcome"[\s\S]+path: "\/"/);
	assert.match(component, /id: "home-welcome"[\s\S]+stats\.totalBooks === 0/);
});

test("journal page uses consistent local button classes", () => {
	const source = readFileSync("src/pages/journal.astro", "utf8");
	assert.equal(source.includes("journal-button-primary"), true);
	assert.equal(source.includes("journal-button-secondary"), true);
	assert.equal(source.includes("journal-button-danger"), true);
	assert.equal(source.includes("new-entry-button"), false);
	assert.equal(source.includes("secondary-link-button"), false);
});
