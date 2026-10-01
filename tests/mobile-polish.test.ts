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

test("mobile header footer compresses into a horizontal no-wrap row", () => {
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
	assert.match(source, /#left-hand-nav \.header-footer\s*{[^}]*overflow-x: auto;/s);
	assert.match(source, /#left-hand-nav \.header-footer\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /#left-hand-nav \.header-footer-nav ul\s*{[^}]*flex-wrap: nowrap;/s);
	assert.match(source, /#left-hand-nav \.header-footer-nav ul\s*{[^}]*justify-content: space-between;/s);
	assert.match(source, /#left-hand-nav \.header-footer-nav ul\s*{[^}]*gap: clamp\(0\.45rem, 3vw, 0\.9rem\);/s);
	assert.match(layout, /<main id="main-content" class="site-container content-column"/);
	assert.match(layout, /@media \(max-width: 900px\)\s*{[\s\S]*?\.content-column\s*{[^}]*padding-block: 1\.15rem 1\.5rem;/s);
});

test("mobile primary header navigation uses natural item sizing with a consistent gap", () => {
	const source = read("../src/components/LeftHand.astro");

	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*--mobile-primary-nav-gap: 0\.9rem;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: flex-start;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*gap: var\(--mobile-primary-nav-gap\);/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*column-gap: 1rem;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: space-(between|around|evenly);/s);
	assert.match(source, /#left-hand-nav \.primary-direct-list,\s*#left-hand-nav \.nav-menu-cluster\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.primary-direct-list,\s*#left-hand-nav \.nav-menu-cluster\s*{[^}]*flex: 0 0 auto;/s);
	assert.match(source, /#left-hand-nav \.primary-direct-list,\s*#left-hand-nav \.nav-menu-cluster\s*{[^}]*flex-wrap: nowrap;/s);
	assert.match(source, /#left-hand-nav \.primary-direct-list,\s*#left-hand-nav \.nav-menu-cluster\s*{[^}]*gap: var\(--mobile-primary-nav-gap\);/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button,\s*#left-hand-nav \.nav-menu-trigger\s*{[^}]*width: auto;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button,\s*#left-hand-nav \.nav-menu-trigger\s*{[^}]*padding: 0\.38rem 0\.44rem;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button,\s*#left-hand-nav \.nav-menu-trigger\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.notification-nav-link\s*{[^}]*justify-content: flex-start;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*overflow-x: auto;/s);
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

test("Product Bible documents reusable mobile density patterns", () => {
	const source = read("../docs/product/overview.md");

	assert.match(source, /Mobile layout polish treats the small-screen interface as its own reading surface\./);
	assert.match(source, /Recommendation feedback buttons remain shared BookCard controls/);
});
