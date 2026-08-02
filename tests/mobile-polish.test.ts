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

test("mobile left navigation footer compresses into a horizontal no-wrap row", () => {
	const source = read("../src/components/LeftHand.astro");
	const layout = read("../src/layouts/Layout.astro");
	const privacyIndex = source.indexOf(">Privacy</a>");
	const supportIndex = source.indexOf(">Support DogEared</a>");
	const betaIndex = source.indexOf(">DogEared Beta {releaseVersion || appVersion}</a>");
	const builtIndex = source.indexOf(">Built by Argon Collective LLC</span>");

	assert.equal(source.includes("founding-reader-badge"), false);
	assert.match(source, /<nav class="sidebar-footer-nav" aria-label="Footer navigation">/);
	assert.equal(source.includes("<p>Built by"), false);
	assert.equal(privacyIndex > -1, true);
	assert.equal(supportIndex > privacyIndex, true);
	assert.equal(betaIndex > supportIndex, true);
	assert.equal(builtIndex > betaIndex, true);
	assert.match(source, /#left-hand-nav \.sidebar-footer\s*{[^}]*overflow-x: auto;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer-nav ul\s*{[^}]*flex-wrap: nowrap;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer-nav ul\s*{[^}]*justify-content: space-between;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer-nav ul\s*{[^}]*gap: clamp\(0\.45rem, 3vw, 0\.9rem\);/s);
	assert.match(layout, /@media \(max-width: 900px\)\s*{[\s\S]*?\.content-column\s*{[^}]*padding-top: 1\.15rem;/s);
	assert.match(layout, /\.content-column\s*{[^}]*padding-inline: 0\.65rem;/s);
});

test("mobile primary navigation uses natural item sizing with a consistent gap", () => {
	const source = read("../src/components/LeftHand.astro");

	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*--mobile-primary-nav-gap: 0\.9rem;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: flex-start;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*gap: var\(--mobile-primary-nav-gap\);/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*column-gap: 1rem;/s);
	assert.doesNotMatch(source, /#left-hand-nav \.primary-links\s*{[^}]*justify-content: space-(between|around|evenly);/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group\s*{[^}]*flex: 0 0 auto;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul\s*{[^}]*flex-wrap: nowrap;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul\s*{[^}]*gap: var\(--mobile-primary-nav-gap\);/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul > li\s*{[^}]*flex: 0 0 auto;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul > li\s*{[^}]*width: auto;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.nav-group > ul > li\s*{[^}]*margin: 0;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button\s*{[^}]*width: auto;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button\s*{[^}]*padding: 0\.38rem 0\.44rem;/s);
	assert.match(source, /#left-hand-nav \.primary-links a,\s*#left-hand-nav \.primary-links \.nav-text-button\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /#left-hand-nav \.primary-links \.notification-nav-link\s*{[^}]*justify-content: flex-start;/s);
	assert.match(source, /#left-hand-nav \.primary-links\s*{[^}]*overflow-x: auto;/s);
	assert.match(source, /scrollActivePrimaryNavIntoView/);
});

test("search loading indicator stays inside the search input without layout shift", () => {
	const source = read("../src/components/LeftHand.astro");
	const searchPage = read("../src/pages/search.astro");

	assert.match(source, /<div class="search-input-wrap">/);
	assert.match(source, /\.search-input-wrap\s*{[^}]*--search-clear-control-space: 2\.35rem;/s);
	assert.match(source, /\.search-input-wrap\s*{[^}]*position: relative;/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*position: absolute;/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*right: var\(--search-clear-control-space\);/s);
	assert.match(source, /\.search-submit-status\s*{[^}]*max-width: min\(8rem, calc\(100% - var\(--search-clear-control-space\) - 1rem\)\);/s);
	assert.doesNotMatch(source, /form\[aria-busy="true"\] input\[type="search"\]\s*{[^}]*padding-right:/s);
	assert.match(source, /#left-hand-nav input\[type="search"\]\s*{[^}]*padding: 0\.4rem 0\.8rem;/s);
	assert.match(source, /@media \(max-width: 360px\)\s*{[\s\S]*?#left-hand-nav \.search-submit-label\s*{[^}]*display: none;/s);
	assert.match(source, /leftHandSearchStatus\.hidden = false;/);
	assert.equal(searchPage.includes("search-pending-state"), false);
	assert.equal(searchPage.includes("search-results-skeleton"), false);
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

test("Product Bible documents reusable mobile density patterns", () => {
	const source = read("../docs/product/overview.md");

	assert.match(source, /Mobile layout polish treats the small-screen interface as its own reading surface\./);
	assert.match(source, /Recommendation feedback buttons remain shared BookCard controls/);
});
