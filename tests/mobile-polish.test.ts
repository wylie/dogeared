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

	assert.match(source, /@media \(max-width: 900px\)\s*{[\s\S]*?#left-hand-nav \.sidebar-footer\s*{[^}]*display: flex;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer\s*{[^}]*overflow-x: auto;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer\s*{[^}]*white-space: nowrap;/s);
	assert.match(source, /#left-hand-nav \.footer-program-meta\s*{[^}]*flex-wrap: nowrap;/s);
	assert.match(source, /#left-hand-nav \.sidebar-footer nav\s*{[^}]*flex-wrap: nowrap;/s);
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
