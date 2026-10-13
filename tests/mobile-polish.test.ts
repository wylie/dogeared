import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("BookCard recommendation feedback buttons stay centered and single-line on mobile", () => {
	const source = read("../src/components/BookCard.astro");

	assert.match(source, /\.recommendation-feedback button\s*{[^}]*display: inline-flex;/s);
	assert.match(source, /\.recommendation-feedback button\s*{[^}]*align-items: center;/s);
	assert.match(source, /\.recommendation-feedback button\s*{[^}]*justify-content: center;/s);
	assert.match(source, /\.recommendation-feedback button\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /@media \(max-width: 420px\)\s*{[\s\S]*?\.recommendation-feedback button\s*{[^}]*font-size: 0\.71rem;/s);
});

test("mobile header footer wraps into subdued metadata below search", () => {
	const source = read("../src/components/LeftHand.astro");
	const layout = read("../src/layouts/Layout.astro");
	const privacyIndex = source.indexOf('href: "/privacy"');
	const supportIndex = source.indexOf('href: "/support"');
	const betaIndex = source.indexOf("DogEared Beta");
	const builtIndex = source.indexOf(">Built by Argon Collective LLC</span>");

	assert.equal(source.includes("founding-reader-badge"), false);
	assert.match(source, /<nav class="header-footer-nav" aria-label="Footer navigation">/);
	assert.equal(source.includes("<p>Built by"), false);
	assert.equal(privacyIndex > -1, true);
	assert.equal(supportIndex > privacyIndex, true);
	assert.equal(betaIndex > supportIndex, true);
	assert.equal(builtIndex > betaIndex, true);
	assert.match(layout, /\.container\s*{[^}]*display: block;/s);
	assert.doesNotMatch(layout, /grid-template-columns: minmax\(238px, 24%\) minmax\(0, 1fr\);/);
	assert.match(source, /#left-hand-nav \.header-footer\s*{[^}]*white-space: normal;/s);
	assert.match(source, /#left-hand-nav \.header-footer\s*{[^}]*font-size: 0\.72rem;/s);
	assert.match(source, /#left-hand-nav \.header-footer-nav ul\s*{[^}]*display: flex;[^}]*flex-wrap: wrap;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.header-footer-nav ul li:nth-child\(n \+ 3\)/);
	assert.doesNotMatch(source, /#left-hand-nav \.header-footer\s*{[^}]*overflow-x: auto;/s);
	assert.match(layout, /<main id="main-content" class="site-container content-column"/);
	assert.match(layout, /@media \(max-width: 900px\)\s*{[\s\S]*?\.content-column\s*{[^}]*padding-block: 1\.15rem 1\.5rem;/s);
});

test("mobile navigation uses one primary row and an explicit narrow-phone menu", () => {
	const source = read("../src/components/LeftHand.astro");

	assert.match(source, /#left-hand-nav\s*{[^}]*overflow-y: auto;/s);
	assert.match(source, /#left-hand-nav\s*{[^}]*max-height: 100dvh;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*display: grid;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*--mobile-primary-nav-gap: 0\.25rem;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: stretch;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*gap: var\(--mobile-primary-nav-gap\);/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*overflow: visible;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*column-gap: 1rem;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: space-(between|around|evenly);/s);
	assert.match(source, /#left-hand-nav \.nav-destination-cluster\s*{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*justify-content: flex-start;[^}]*gap: 0\.25rem 0\.75rem;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.nav-destination-cluster\s*{[^}]*justify-content: space-between;/s);
	assert.match(source, /@media \(max-width: 529px\)\s*{[\s\S]*?column-gap: 0\.625rem;/s);
	assert.match(source, /@media \(max-width: 515px\)\s*{[\s\S]*?column-gap: 0\.4375rem;/s);
	assert.match(source, /#left-hand-nav \.primary-direct-list\s*{[^}]*display: contents;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button,\s*#left-hand-nav \.nav-menu-trigger,\s*#left-hand-nav \.split-menu-button\s*{[^}]*width: auto;[^}]*min-height: 44px;/s);
	assert.match(source, /#left-hand-nav \.split-nav-heading\s*{[^}]*display: inline-flex;/s);
	assert.match(source, /#left-hand-nav \.split-menu-button\s*{[^}]*width: 24px;/s);
	assert.match(source, /#left-hand-nav \.split-nav-heading\s*{[^}]*gap: 0\.125rem;/s);
	assert.match(source, /#left-hand-nav \.nav-menu-trigger\s*{[^}]*gap: 0\.125rem;/s);
	assert.match(source, /#left-hand-nav \.nav-menu-trigger\s*{[^}]*justify-content: flex-start;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-destination-cluster \.nav-menu > ul,\s*#left-hand-nav \.primary-links \.nav-destination-cluster \.split-menu-list\s*{[^}]*flex: 1 0 100%;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button,\s*#left-hand-nav \.nav-menu-trigger,\s*#left-hand-nav \.split-menu-button\s*{[^}]*font-size: 0\.875rem;[^}]*white-space: nowrap;/s);
	assert.match(source, /@media \(max-width: 499px\)/);
	assert.match(source, /class="mobile-menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="left-hand-destinations"/s);
	assert.match(source, /#left-hand-nav\[data-compact-nav-open\] \.nav-destination-cluster\s*{[^}]*display: flex;/s);
	assert.match(source, /function setCompactNavOpen\(open\)/);
	assert.match(source, /compactNavToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
	assert.match(source, /list\.style\.setProperty\("--compact-nav-order", String\(index \* 2 \+ 1\)\)/);
	assert.match(source, /#left-hand-nav \.utility-icon-button\s*{[^}]*width: 44px;[^}]*min-height: 44px;/s);
	assert.match(source, /#left-hand-nav \.utility-nav-list\s*{[^}]*border-top: var\(--border-subtle\);/s);
	assert.match(source, /#left-hand-nav \.utility-menu\[open\]::details-content\s*{[^}]*display: contents;/s);
	assert.match(source, /#left-hand-nav \.utility-menu > ul\s*{[^}]*grid-column: 1 \/ -1;/s);
	assert.match(source, /#left-hand-nav h2 a.special-font\s*{[^}]*font-size: 1\.75rem;/s);
	assert.match(source, /#left-hand-nav h2 a.special-font \.title-logo\s*{[^}]*width: 32px;[^}]*height: 32px;/s);
	assert.match(source, /#left-hand-nav \.utility-icon-button\s*{[^}]*justify-content: center;/s);
	assert.match(source, /#left-hand-nav \.nav-menu > ul,\s*#left-hand-nav \.split-menu-list\s*{[^}]*position: static;/s);
	assert.match(source, /#left-hand-nav \.nav-menu > ul,\s*#left-hand-nav \.split-menu-list\s*{[^}]*box-shadow: none;/s);
	assert.match(source, /#left-hand-nav \.nav-destination-cluster \.nav-menu:not\(\[open\]\) > ul\s*{[^}]*display: none;/s);
	assert.match(source, /aria-controls="left-hand-about-menu"/);
	assert.match(source, /function syncDetailsMenuState/);
	assert.match(source, /closeDetailsMenus\(\{ except: menu \}\);/);
	assert.match(source, /scrollActivePrimaryNavIntoView/);
});

test("search loading indicator stays inside the search input without layout shift", () => {
	const source = read("../src/components/LeftHand.astro");
	const searchPage = read("../src/pages/search.astro");

	assert.match(source, /<div class="search-input-wrap">/);
	assert.match(source, /\.search-input-wrap\s*{[^}]*--search-clear-control-space: 2\.35rem;/s);
	assert.match(source, /\.search-input-wrap\s*{[^}]*--search-spinner-control-space: 1\.35rem;/s);
	assert.match(source, /\.search-input-wrap\s*{[^}]*position: relative;/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*position: absolute;/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*right: var\(--search-clear-control-space\);/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*width: var\(--search-spinner-control-space\);/s);
	assert.match(source, /input\[type="search"\]\s*{[^}]*padding: 0\.58rem calc\(var\(--search-clear-control-space\) \+ var\(--search-spinner-control-space\) \+ 0\.75rem\) 0\.58rem 0\.95rem;/s);
	assert.match(source, /input\[type="search"\]\s*{[^}]*margin-top: 0;/s);
	assert.match(source, /\.search-input-wrap\s*{[^}]*margin-top: 0;/s);
	assert.match(source, /#left-hand-nav input\[type="search"\]\s*{[^}]*padding: 0\.4rem calc\(var\(--search-clear-control-space\) \+ var\(--search-spinner-control-space\) \+ 0\.55rem\) 0\.4rem 0\.8rem;/s);
	assert.match(source, /#left-hand-nav \.search-input-wrap\s*{[^}]*margin-top: 0;/s);
	assert.match(source, /<span class="search-submit-label visually-hidden">Searching books\.<\/span>/);
	assert.match(source, /<button type="button" class="search-clear" data-search-clear aria-label="Clear search"/);
	assert.match(source, /\.search-clear\s*{[^}]*position: absolute;/s);
	assert.match(source, /\.search-clear\s*{[^}]*right: 0\.34rem;/s);
	assert.match(source, /\.search-clear\s*{[^}]*top: 50%;/s);
	assert.match(source, /\.search-clear\s*{[^}]*transform: translateY\(-50%\);/s);
	assert.match(source, /\.search-clear:focus-visible\s*{[^}]*outline: 3px solid/s);
	assert.match(source, /input\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\);/);
	assert.equal(source.includes("Searching..."), false);
	assert.match(source, /leftHandSearchStatus\.hidden = false;/);
	assert.equal(searchPage.includes("search-pending-state"), false);
	assert.equal(searchPage.includes("search-results-skeleton"), false);
	assert.match(searchPage, /data-search-live-status/);
	assert.match(searchPage, /No results for \$\{queryText\}\./);
});

test("Home and Discover use tighter mobile section rhythm", () => {
	const home = read("../src/pages/index.astro");
	const discover = read("../src/pages/discover.astro");

	assert.match(home, /@media \(max-width: 860px\)\s*{[\s\S]*?\.home-jump-links\s*{[^}]*--home-jump-links-offset: 32px;/s);
	assert.match(home, /\.section-head\s*{[^}]*padding: 0\.52rem 0 0\.46rem;/s);
	assert.match(home, /\.section-explanation\s*{[^}]*font-size: 0\.84rem;/s);
	assert.match(discover, /@media \(max-width: 760px\)\s*{[\s\S]*?\.discover-page\s*{[^}]*gap: 0\.72rem;/s);
	assert.match(discover, /\.discover-grid\s*{[^}]*gap: 0\.72rem;/s);
});

test("Home and Discover use the shared wide app canvas", () => {
	const global = read("../src/assets/global.css");
	const layout = read("../src/layouts/Layout.astro");
	const home = read("../src/pages/index.astro");
	const discover = read("../src/pages/discover.astro");

	assert.match(global, /--site-max-width: 1540px;/);
	assert.match(global, /\.site-container\s*{[^}]*var\(--site-max-width\)/s);
	assert.match(layout, /<main id="main-content" class="site-container content-column"/);
	assert.doesNotMatch(home, /max-width: 1020px;/);
	assert.doesNotMatch(discover, /max-width: 1040px;/);
	assert.match(home, /\.book-grid\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, var\(--book-grid-min\)\), 1fr\)\)/s);
	assert.match(discover, /\.discover-grid\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, var\(--book-grid-min\)\), 1fr\)\)/s);
});

test("Profile uses the shared wide app canvas with responsive page sections", () => {
	const profile = read("../src/pages/profile/[username].astro");
	const overview = read("../docs/product/overview.md");

	assert.doesNotMatch(profile, /\.public-profile-page\s*{[^}]*max-width: 860px;/s);
	assert.match(profile, /\.public-profile-page\s*{[^}]*max-width: none;/s);
	assert.match(profile, /\.public-profile-page\s*{[^}]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/s);
	assert.match(profile, /class="profile-subnav"/);
	assert.match(profile, /data-profile-section-link=\{link\.id\}/);
	assert.match(profile, /<section class="profile-upper-layout" aria-label="Profile overview">/);
	assert.match(profile, /class="profile-column profile-column-left"/);
	assert.match(profile, /class="profile-column profile-column-right"/);
	assert.match(profile, /<section id="about" class="profile-about-card">/);
	assert.match(profile, /class="profile-card profile-identity-card"/);
	assert.match(profile, /\.profile-upper-layout\s*{[^}]*grid-template-columns: minmax\(0, 0\.4fr\) minmax\(0, 0\.6fr\);/s);
	assert.match(profile, /\.profile-upper-layout\s*{[^}]*align-items: start;/s);
	assert.match(profile, /\.profile-column\s*{[^}]*align-content: start;/s);
	assert.match(profile, /\.blurb\s*{[^}]*max-width: 48rem;/s);
	assert.match(profile, /\.meta-grid\s*{[^}]*grid-template-columns: 1fr;/s);
	assert.match(profile, /<section id="shelf-summary" class="shelf-card">[\s\S]*?<\/div>\s*<\/section>\s*<\/div>\s*<div class="profile-column profile-column-right">/s);
	assert.match(profile, /<section id="about" class="profile-about-card">[\s\S]*?<section id="reading-goal" class="reading-goal-card">/s);
	assert.match(profile, /\.currently-reading-section\s*{[^}]*grid-column: 1 \/ -1;/s);
	assert.match(profile, /\.activity-grid\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, var\(--profile-book-grid-min\)\), 1fr\)\)/s);
	assert.match(profile, /\.profile-review-list\s*{[^}]*max-width: 58rem;/s);
	assert.match(profile, /@media \(max-width: 1180px\)\s*{[\s\S]*?\.profile-upper-layout\s*{[^}]*grid-template-columns: 1fr;/s);
	assert.match(profile, /@media \(max-width: 740px\)\s*{[\s\S]*?\.public-profile-page\s*{[^}]*grid-template-columns: 1fr;/s);
	assert.match(overview, /The Profile page uses the shared wide app canvas/);
	assert.match(overview, /upper Profile composition uses two independent vertical columns/);
	assert.match(overview, /page-level section navigation is horizontal/);
});

test("application pages use shared width primitives after the top-nav migration", () => {
	const global = read("../src/assets/global.css");
	const overview = read("../docs/product/overview.md");
	const readingLife = read("../src/pages/reading-life.astro");
	const search = read("../src/pages/search.astro");
	const books = read("../src/pages/books.astro");
	const author = read("../src/pages/author/[slug].astro");
	const collections = read("../src/pages/collections/index.astro");
	const admin = read("../src/pages/admin.astro");
	const adminPerformance = read("../src/pages/admin/performance.astro");
	const notifications = read("../src/pages/notifications.astro");
	const following = read("../src/pages/following.astro");
	const journal = read("../src/pages/journal.astro");
	const settings = read("../src/pages/settings.astro");
	const privacy = read("../src/pages/privacy.astro");
	const support = read("../src/pages/support.astro");
	const mission = read("../src/pages/mission.astro");

	assert.match(global, /\.app-page\s*{[^}]*max-width: var\(--app-page-max, none\);/s);
	assert.match(global, /\.app-page--wide\s*{[^}]*--app-page-max: none;/s);
	assert.match(global, /\.app-page--standard\s*{[^}]*--app-page-max: min\(100%, 72rem\);/s);
	assert.match(global, /\.app-page--reading\s*{[^}]*--app-page-max: min\(100%, 54rem\);/s);
	assert.match(global, /\.app-page--form\s*{[^}]*--app-page-max: min\(100%, 58rem\);/s);
	assert.match(global, /\.responsive-book-grid\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, var\(--book-grid-min\)\), 1fr\)\)/s);
	assert.match(global, /\.responsive-card-grid\s*{[^}]*repeat\(auto-fit, minmax\(min\(100%, var\(--card-grid-min\)\), 1fr\)\)/s);
	assert.match(global, /@media \(max-width: 900px\)\s*{[\s\S]*?\.app-page--standard,[\s\S]*?\.app-page--form\s*{[^}]*--app-page-max: none;/s);

	for (const source of [readingLife, search, books, author, collections, admin, adminPerformance, following, journal, mission]) {
		assert.match(source, /app-page app-page--wide/);
	}

	for (const source of [notifications]) {
		assert.match(source, /app-page app-page--standard/);
		assert.match(source, /max-width: var\(--app-page-max\);/);
	}

	assert.match(settings, /app-page app-page--form/);
	assert.match(settings, /max-width: var\(--app-page-max\);/);

	for (const source of [privacy, support]) {
		assert.match(source, /app-page app-page--reading/);
		assert.match(source, /max-width: var\(--app-page-max\);/);
	}

	assert.doesNotMatch(readingLife, /\.reading-life-page\s*{[^}]*max-width: 1040px;/s);
	assert.doesNotMatch(search, /\.search-page\s*{[^}]*max-width: 900px;/s);
	assert.doesNotMatch(admin, /\.admin-page\s*{[^}]*max-width: 980px;/s);
	assert.match(readingLife, /\.current-books ul\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, 15\.5rem\), 1fr\)\)/s);
	assert.match(search, /\.search-results\s*{[^}]*repeat\(auto-fill, minmax\(min\(100%, var\(--book-grid-min\)\), 1fr\)\)/s);
	assert.match(overview, /Application pages choose one of the shared page-width primitives/);
	assert.match(overview, /`app-page--wide` is for browsing, dashboards, catalog detail, metrics, profile compositions, reader workspaces, community grids, mission-style pages, and admin work surfaces/);
	assert.match(overview, /`app-page--reading` is for prose-first public or account pages/);
});

test("Product Bible documents reusable mobile density patterns", () => {
	const source = read("../docs/product/overview.md");

	assert.match(source, /Mobile layout polish treats the small-screen interface as its own reading surface\./);
	assert.match(source, /Recommendation feedback buttons remain shared BookCard controls/);
});
