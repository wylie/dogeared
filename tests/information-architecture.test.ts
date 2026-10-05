import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("signed-in header keeps personal, discovery, and account destinations organized", () => {
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");

	assert.match(nav, /const routeMatches/);
	assert.match(nav, /const adminNavItems/);
	assert.doesNotMatch(nav, /const is[A-Z][A-Za-z]+Page/);
	const discoverItems = nav.slice(nav.indexOf("const discoverLinkItem"), nav.indexOf("const primaryPersonalNavItems"));
	assert.match(discoverItems, /const discoverLinkItem/);
	assert.match(discoverItems, /const discoverMenuItems/);
	assert.match(discoverItems, /const discoverNavItems/);
	assert.match(discoverItems, /\/discover/);
	assert.match(discoverItems, /\/books/);
	assert.match(discoverItems, /\/authors/);
	assert.match(discoverItems, /aliases: \["\/book"\]/);
	assert.match(discoverItems, /aliases: \["\/author"\]/);
	assert.ok(discoverItems.indexOf('href: "/discover"') < discoverItems.indexOf("const discoverMenuItems"));

	const personalItems = nav.slice(nav.indexOf("const primaryPersonalNavItems"), nav.indexOf("const aboutNavItems"));
	assert.ok(personalItems.indexOf("left-hand-reading-life-item") < personalItems.indexOf("left-hand-journal-item"));
	assert.ok(personalItems.indexOf("left-hand-journal-item") < personalItems.indexOf("left-hand-following-item"));
	assert.match(personalItems, /\/reading-life/);
	assert.match(personalItems, /\/journal/);
	assert.match(personalItems, /\/following/);
	assert.doesNotMatch(personalItems, /\/notifications/);
	assert.doesNotMatch(personalItems, /\/profile/);
	assert.doesNotMatch(personalItems, /Reading Timeline/);

	const primaryList = nav.slice(nav.indexOf("nav-destination-cluster"), nav.indexOf("utility-nav-list"));
	const accountMenu = nav.slice(nav.indexOf("nav-group-account"), nav.indexOf("secondary-links-mobile"));
	const accountItems = nav.slice(nav.indexOf("const accountNavItems"), nav.indexOf("const footerNavItems"));
	const utilityItems = nav.slice(nav.indexOf("utility-nav-list"), nav.indexOf("secondary-links-mobile"));
	assert.match(primaryList, /left-hand-login-item/);
	assert.match(primaryList, /nav-group-discover/);
	assert.match(primaryList, /data-split-menu/);
	assert.match(primaryList, /class=\{`split-nav-link/);
	assert.match(primaryList, /aria-label="Open Discover menu"/);
	assert.match(primaryList, /discoverMenuItems\.map/);
	assert.doesNotMatch(primaryList, /discoverNavItems\.map/);
	assert.match(primaryList, /primaryPersonalNavItems/);
	assert.match(primaryList, /nav-group-about/);
	assert.doesNotMatch(nav, /nav-group-explore/);
	assert.doesNotMatch(nav, />Explore</);
	assert.doesNotMatch(nav, /nav-group-more/);
	assert.doesNotMatch(nav, />More</);
	assert.doesNotMatch(nav, /const moreNavItems/);
	assert.match(utilityItems, /id=\{notificationUtilityItem\.id\}/);
	assert.match(utilityItems, /aria-label="Notifications"/);
	assert.match(utilityItems, /left-hand-notification-badge/);
	assert.match(utilityItems, /id=\{profileUtilityItem\.id\}/);
	assert.match(utilityItems, /aria-label="View your Profile"/);
	assert.match(utilityItems, /left-hand-settings-item/);
	assert.match(utilityItems, /aria-label="Account settings"/);
	assert.match(utilityItems, /material-icons[\s\S]*notifications/);
	assert.match(utilityItems, /material-icons[\s\S]*account_circle/);
	assert.match(utilityItems, /material-icons[\s\S]*settings/);
	assert.match(accountItems, /href: "\/settings"/);
	assert.match(accountMenu, /left-hand-logout-item/);
	assert.match(accountMenu, /\{item\.label\}/);
	assert.doesNotMatch(accountMenu, /left-hand-profile-item/);
	assert.doesNotMatch(accountMenu, /left-hand-journal-item/);
	assert.doesNotMatch(accountMenu, /left-hand-notifications-item/);
	assert.doesNotMatch(primaryList, /left-hand-profile-item/);
	assert.doesNotMatch(primaryList, /left-hand-notifications-item/);
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
	assert.match(overview, /one responsive top navigation/);
	assert.match(overview, /site-container/);
	assert.match(overview, /Discover is a split control/);
	assert.match(overview, /child menu for Books and Authors/);
	assert.match(overview, /Notifications, Profile, and Settings move into a compact utility cluster/);
	assert.match(features, /Reading Journal is private notebook space/);
	assert.match(routes, /\/reading-timeline[\s\S]+redirect/i);
});
