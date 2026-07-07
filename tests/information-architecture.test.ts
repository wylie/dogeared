import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("signed-in navigation separates personal, discovery, and settings destinations", () => {
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");

	const youGroup = nav.slice(nav.indexOf("nav-group-you"), nav.indexOf("nav-group-explore"));
	assert.ok(youGroup.indexOf("left-hand-profile-item") < youGroup.indexOf("left-hand-reading-life-item"));
	assert.ok(youGroup.indexOf("left-hand-reading-life-item") < youGroup.indexOf("left-hand-journal-item"));
	assert.ok(youGroup.indexOf("left-hand-journal-item") < youGroup.indexOf("left-hand-notifications-item"));
	assert.ok(youGroup.indexOf("left-hand-notifications-item") < youGroup.indexOf("left-hand-settings-item"));
	assert.ok(youGroup.indexOf("left-hand-settings-item") < youGroup.indexOf("left-hand-logout-item"));
	assert.match(youGroup, /\/notifications/);
	assert.doesNotMatch(youGroup, /Following/);
	assert.doesNotMatch(youGroup, /Reading Timeline/);

	const exploreGroup = nav.slice(nav.indexOf("nav-group-explore"), nav.indexOf("nav-group-about"));
	assert.match(exploreGroup, /Following/);
});

test("profile stays focused on reader identity and current reading state", () => {
	const profilePage = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(profilePage, /id="about"/);
	assert.match(profilePage, /id="reading-goal"/);
	assert.match(profilePage, /id="shelf-summary"/);
	assert.match(profilePage, /id="currently-reading"/);
	assert.match(profilePage, /id="recent-activity"/);
	assert.match(profilePage, /href="\/reading-life"/);
	assert.match(profilePage, /href="\/settings"/);
	assert.doesNotMatch(profilePage, /Recent Journal Entries/);
	assert.doesNotMatch(profilePage, /loadRecentJournalEntries/);
	assert.doesNotMatch(profilePage, /href="\/reading-timeline"/);
});

test("reading timeline URL remains backwards compatible through My Reading Life", () => {
	const redirectPage = readFileSync("src/pages/reading-timeline.astro", "utf8");
	const readingLifePage = readFileSync("src/pages/reading-life.astro", "utf8");

	assert.match(redirectPage, /Astro\.redirect/);
	assert.match(redirectPage, /\/reading-life/);
	assert.match(redirectPage, /destination\.hash = "timeline"/);
	assert.match(readingLifePage, /id="timeline"/);
	assert.match(readingLifePage, /id="calendar"/);
	assert.match(readingLifePage, /id="genres"/);
	assert.match(readingLifePage, /id="authors"/);
	assert.match(readingLifePage, /id="fun-statistics"/);
	assert.match(readingLifePage, /id="journey"/);
	assert.match(readingLifePage, /label: "History"/);
	assert.match(readingLifePage, /label: "Insights"/);
});

test("reading journal remains a private notebook rather than a profile or stats page", () => {
	const journalPage = readFileSync("src/pages/journal.astro", "utf8");

	assert.match(journalPage, /Search your own notes/);
	assert.match(journalPage, /Journal Timeline/);
	assert.match(journalPage, /robots="noindex,nofollow"/);
	assert.doesNotMatch(journalPage, /Reading Goal/);
	assert.doesNotMatch(journalPage, /Shelf Summary/);
	assert.doesNotMatch(journalPage, /Currently Reading/);
});

test("product documentation records the reorganized responsibilities", () => {
	const overview = readFileSync("docs/product/overview.md", "utf8");
	const features = readFileSync("docs/product/features.md", "utf8");
	const routes = readFileSync("docs/engineering/routes.md", "utf8");

	assert.match(overview, /Who am I as a reader\?/);
	assert.match(overview, /How has my reading changed over time\?/);
	assert.match(overview, /What was I thinking while reading\?/);
	assert.match(features, /Reading Journal is private notebook space/);
	assert.match(routes, /\/reading-timeline[\s\S]+redirect/i);
});
