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
	assert.equal(source.includes("Create Account"), true);
	assert.equal(source.includes("Log In"), true);
	assert.equal(source.includes("Search Books"), true);
	assert.equal(source.includes('new CustomEvent("dogeared:open-auth"'), true);
	assert.equal(source.includes('document.getElementById("left-hand-search")'), true);
});

test("visitor and reader guidance use distinct account and search actions", () => {
	const guidance = readFileSync("src/components/ReaderGuidance.astro", "utf8");
	const navigation = readFileSync("src/components/LeftHand.astro", "utf8");
	assert.equal(guidance.includes('detail: { mode: "create" }'), true);
	assert.equal(guidance.includes('detail: { mode: "login" }'), true);
	assert.equal(guidance.includes("Every shelf addition and rating helps Dogeared"), true);
	assert.equal(navigation.includes('window.addEventListener("dogeared:open-auth"'), true);
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
		{ key: "/works/OL1W", title: "Known Book: Deluxe Edition", author_name: ["A. Writer"], isbn: ["9781234567890"] },
		{ key: "/works/OL2W", title: "New Book", author_name: ["A. Writer"], first_publish_year: 2024 },
		{ key: "/works/OL3W", title: "New Book", author_name: ["A. Writer"] }
	];
	const result = filterExternalAuthorBooks(rows, [{ title: "Known Book", author: "A. Writer", isbn13: "978-1-23456-789-0" }]);
	assert.equal(result.length, 1);
	assert.equal(result[0]?.title, "New Book");
	assert.equal(result[0]?.sourceUrl, "https://openlibrary.org/works/OL2W");
});

test("external author cards use Dogeared shelf conversion without outbound title links", () => {
	const source = readFileSync("src/components/ExternalAuthorBooks.astro", "utf8");
	assert.equal(source.includes("<BookCard"), true);
	assert.equal(source.includes("<ShelfDropdown"), true);
	assert.equal(source.includes('"data-source": "open_library"'), true);
	assert.equal(source.includes("Search Dogeared"), false);
	assert.equal(source.includes('target="_blank"'), false);
	assert.equal(source.includes("Additional titles from Open Library"), false);
});

test("author pages separate local and external books", () => {
	const source = readFileSync("src/pages/author/[slug].astro", "utf8");
	assert.equal(source.includes("Books In Dogeared"), true);
	assert.equal(source.includes("<ExternalAuthorBooks books={externalBooks}"), true);
	assert.equal(source.includes("books.map((book) => book.title)"), false);
	assert.equal(source.includes("dropdown.dataset.bookId = String(bookId)"), true);
	assert.equal(source.includes("/api/shelf/custom-shelf-books"), true);
});

test("BookCard renders accessible genre navigation", () => {
	const source = readFileSync("src/components/BookCard.astro", "utf8");
	assert.equal(source.includes('aria-label="Genres"'), true);
	assert.equal(source.includes("/related?kind=genre&value="), true);
	assert.equal(source.includes('kind="genre"'), true);
	assert.equal(source.includes('kind="topic"'), true);
});

test("author cards do not repeat genre chips as plain metadata", () => {
	for (const path of ["src/pages/author.astro", "src/pages/author/[slug].astro"]) {
		const source = readFileSync(path, "utf8");
		assert.equal(source.includes('book.genres[0] || "Uncategorized"'), false);
	}
});

test("profile finish workflow updates shelves and activity optimistically", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes('data-shelf-count="reading"'), true);
	assert.equal(source.includes('data-shelf-count="finished"'), true);
	assert.equal(source.includes('activityClone.dataset.optimisticActivity = "finished"'), true);
	assert.equal(source.includes("readGrid.prepend(card)"), true);
	assert.equal(source.includes("rememberReadingActivityToday()"), true);
	assert.equal(source.includes("refreshProfileReadingUiAfterMutation()"), true);
	assert.equal(source.includes("clearMomentumTracking(card)"), true);
	assert.equal(source.includes('document.querySelectorAll(\'#currently-reading [data-momentum-reading-item="true"]\')'), true);
});

test("profile defaults to currently reading, recent activity, then other shelves", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const currentIdx = source.indexOf('{ id: "currently-reading", label: "Currently Reading", key: "default:reading" }');
	const recentIdx = source.indexOf('{ id: "recent-activity", label: "Recent Activity", key: RECENT_ACTIVITY_SECTION_KEY }');
	const wantIdx = source.indexOf('{ id: "want-to-read", label: "Want to Read", key: "default:want_to_read" }');
	const readIdx = source.indexOf('{ id: "read", label: "Read", key: "default:finished" }');
	assert.ok(currentIdx > -1);
	assert.ok(recentIdx > -1);
	assert.ok(wantIdx > -1);
	assert.ok(readIdx > -1);
	assert.ok(currentIdx < recentIdx);
	assert.ok(recentIdx < wantIdx);
	assert.ok(wantIdx < readIdx);
	assert.equal(source.includes('const RECENT_ACTIVITY_SECTION_KEY = "recent:activity"'), true);
	assert.equal(source.includes('data-shelf-section-key={RECENT_ACTIVITY_SECTION_KEY}'), true);
	assert.equal(source.includes('style="order:900"'), false);
	assert.equal(source.includes("profilePageRoot.insertBefore(node, recentSection)"), false);
});

test("profile section reorder controls disable invalid moves", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes("shelfSectionMoveAttrs"), true);
	assert.equal(source.includes('shelfSectionMoveAttrs(RECENT_ACTIVITY_SECTION_KEY, "up")'), true);
	assert.equal(source.includes('shelfSectionMoveAttrs(RECENT_ACTIVITY_SECTION_KEY, "down")'), true);
	assert.equal(source.includes('"aria-disabled": "true"'), true);
	assert.equal(source.includes("updateShelfSectionMoveControls"), true);
	assert.equal(source.includes("upButton.disabled = !canMoveUp"), true);
	assert.equal(source.includes("downButton.disabled = !canMoveDown"), true);
	assert.equal(source.includes("moveUpButton.disabled || moveUpButton.getAttribute(\"aria-disabled\") === \"true\""), true);
	assert.equal(source.includes(".custom-shelf-menu-item:disabled"), true);
});

test("profile merges recent activity into older saved shelf-only section orders", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes("function mergeProfileSectionOrder"), true);
	assert.equal(source.includes("if (key === RECENT_ACTIVITY_SECTION_KEY)"), true);
	assert.equal(source.includes('merged.splice(readingIndex + 1, 0, key)'), true);
	assert.equal(source.includes("function mergeStoredProfileSectionOrder"), true);
	assert.equal(source.includes("deduped.splice(readingIndex + 1, 0, RECENT_ACTIVITY_SECTION_KEY)"), true);
});

test("Argon Collective attribution stays on company-facing surfaces, not the global footer", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const mission = readFileSync("src/pages/mission.astro", "utf8");
	const roadmap = readFileSync("src/pages/roadmap.astro", "utf8");
	const settings = readFileSync("src/pages/settings.astro", "utf8");
	assert.equal(layout.includes("Argon Collective LLC"), false);
	for (const source of [mission, roadmap, settings]) {
		assert.equal(source.includes("Argon Collective LLC"), true);
	}
});
