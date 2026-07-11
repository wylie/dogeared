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
	assert.equal(guidance.includes("Every shelf addition and rating helps DogEared"), true);
	assert.equal(navigation.includes('window.addEventListener("dogeared:open-auth"'), true);
});

test("account creation transitions visitor guidance to new-reader guidance", () => {
	const source = readFileSync("src/pages/api/auth/verify.ts", "utf8");
	assert.equal(source.includes("dogeared_new_visitor=;"), true);
	assert.equal(source.includes("dogeared_new_reader=true;"), true);
});

test("onboarding completion uses canonical guidance actions", () => {
	const source = readFileSync("src/pages/api/onboarding/status.ts", "utf8");
	assert.equal(source.includes("loadGuidedTourStatus"), true);
	assert.equal(source.includes('"first-book-added"'), true);
	assert.equal(source.includes('"first-progress-update"'), true);
	assert.equal(source.includes('"first-journal-entry"'), true);
	assert.equal(source.includes('"first-review"'), true);
	assert.equal(source.includes('"first-follow"'), true);
	assert.equal(source.includes('"explore-discover"'), true);
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

test("external author cards use DogEared shelf conversion without outbound title links", () => {
	const source = readFileSync("src/components/ExternalAuthorBooks.astro", "utf8");
	assert.equal(source.includes("<BookCard"), true);
	assert.equal(source.includes("<ShelfDropdown"), true);
	assert.equal(source.includes('"data-source": "open_library"'), true);
	assert.equal(source.includes("Search DogEared"), false);
	assert.equal(source.includes('target="_blank"'), false);
	assert.equal(source.includes("Additional titles from Open Library"), false);
});

test("author pages separate local and external books", () => {
	const source = readFileSync("src/pages/author/[slug].astro", "utf8");
	assert.equal(source.includes("Books In DogEared"), true);
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

test("BookCard owns the compact reusable presentation variant", () => {
	const source = readFileSync("src/components/BookCard.astro", "utf8");
	const bookPage = readFileSync("src/pages/book.astro", "utf8");

	assert.match(source, /variant\?: "standard" \| "compact-series"/);
	assert.equal(source.includes('variant = "standard"'), true);
	assert.equal(source.includes("book-card--compact-series"), true);
	assert.match(source, /\.book-card--compact-series \{[\s\S]+grid-template-columns: 76px minmax\(0, 1fr\)/);
	assert.match(source, /\.book-card--compact-series \{[\s\S]+height: max-content/);
	assert.match(source, /\.book-card--compact-series \{[\s\S]+grid-auto-rows: max-content/);
	assert.match(source, /\.book-card--compact-series \{[\s\S]+align-items: start/);
	assert.match(source, /\.book-card--compact-series \.cover \{[\s\S]+height: 114px/);
	assert.match(source, /\.book-card--compact-series \.card-body \{[\s\S]+align-self: start/);
	assert.match(source, /\.book-card--compact-series \.card-body \{[\s\S]+min-height: 0/);
	assert.match(source, /\.book-card--compact-series \.series-meta \{[\s\S]+color: var\(--color-text-muted\)/);
	assert.match(source, /\.book-card--compact-series \.cover-actions :global\(\.shelf-dropdown\) \{[\s\S]+--shelf-trigger-height: 30px/);
	assert.equal(bookPage.includes('variant="compact-series"'), true);
	assert.equal(bookPage.includes(":global(.series-list .book-card .cover)"), false);
	assert.equal(bookPage.includes("series-card-kickers"), false);
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

test("profile progress saves refresh all derived reading UI without reload", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const apiSource = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const worksSource = readFileSync("src/lib/catalogWorks.ts", "utf8");
	assert.equal(source.includes("normalizePersistedDateValue"), true);
	assert.equal(source.includes("const hasForwardProgress = nextCurrentPage > previousCurrentPage"), true);
	assert.equal(source.includes("if (hasForwardProgress) rememberReadingActivityToday()"), true);
	assert.equal(source.includes("updateMomentumStreakDisplay"), true);
	assert.equal(source.includes("data-momentum-streak-unit"), true);
	assert.equal(source.includes("setNodeText(momentumScoreNode"), true);
	assert.equal(source.includes("setNodeText(momentumNextActionNode"), true);
	assert.equal(source.includes("function ensureProgressDisplay(card, currentPage, totalPages)"), true);
	assert.equal(source.includes('progressNode.className = "meta progress-current-value"'), true);
	assert.equal(source.includes('progressTrack.className = "progress-track"'), true);
	assert.equal(source.includes('card.dataset.momentumProgressUpdates = String(persistedProgressUpdates > 0'), true);
	const progressSaveStart = source.indexOf('if (progressSave instanceof HTMLButtonElement)');
	const progressMaterialize = source.indexOf("ensureProgressDisplay(card, nextCurrentPage, nextTotalPages)", progressSaveStart);
	const currentPageUpdate = source.indexOf("card.dataset.momentumCurrentPage = String(nextCurrentPage)", progressSaveStart);
	const rememberProgress = source.indexOf("if (hasForwardProgress) rememberReadingActivityToday()", progressSaveStart);
	const progressRefresh = source.indexOf("await refreshProfileReadingUiAfterMutation()", currentPageUpdate);
	assert.ok(progressSaveStart > -1);
	assert.ok(progressMaterialize > progressSaveStart && progressMaterialize < currentPageUpdate);
	assert.ok(currentPageUpdate > progressSaveStart && currentPageUpdate < progressRefresh);
	assert.ok(rememberProgress > progressSaveStart && rememberProgress < progressRefresh);
	assert.equal(apiSource.includes("progress_updates"), true);
	assert.equal(apiSource.includes("progressUpdates"), true);
	assert.equal(apiSource.includes("user_reading_progress_event"), true);
	assert.equal(apiSource.includes("previousStatus === status && status === \"reading\""), false);
	assert.equal(apiSource.includes("coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages"), true);
	assert.equal(apiSource.includes("const effectiveTotalPages = Math.max("), true);
	assert.equal(apiSource.includes("${effectiveTotalPages}"), true);
	assert.equal(apiSource.includes('detail: import.meta.env.DEV && debugStage'), true);
	assert.equal(apiSource.includes('console.error("[shelf.upsert.debug]"'), true);
	assert.equal(source.includes("coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages"), true);
	assert.equal(source.includes('function surfaceProgressSaveError(input, message)'), true);
	assert.equal(source.includes('console.error("[progress.save.request.failed]"'), true);
	assert.equal(source.includes("title: finishEntry.title"), true);
	assert.equal(source.includes("bookId: finishEntry.bookId || directBookId || 0"), true);
	assert.equal(worksSource.includes("const existingByBookRows = await sql"), true);
	assert.equal(worksSource.includes("const existingByKeyRows = await sql"), true);
	assert.equal(worksSource.includes("update user_book"), true);
	assert.equal(worksSource.includes("delete from book_edition"), true);
	assert.equal(worksSource.includes("update book_edition be"), true);
	assert.equal(worksSource.includes("left join book_edition existing on existing.book_id = b.id"), true);
});

test("mobile progress updater keeps controls readable and touch sized", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const mobileStart = source.indexOf("@media (max-width: 520px)");
	assert.ok(mobileStart > -1);
	assert.ok(source.indexOf("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)", mobileStart) > mobileStart);
	assert.ok(source.indexOf('"type input"', mobileStart) > mobileStart);
	assert.ok(source.indexOf('"save finish"', mobileStart) > mobileStart);
	assert.ok(source.indexOf("@media (max-width: 319px)") > mobileStart);
	assert.ok(source.indexOf("height: 44px", mobileStart) > mobileStart);
	assert.ok(source.indexOf("progress-inline-save", mobileStart) > mobileStart);
	assert.ok(source.indexOf("progress-inline-finish", mobileStart) > mobileStart);
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

test("sidebar footer carries ownership and support metadata", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");
	const mission = readFileSync("src/pages/mission.astro", "utf8");
	const support = readFileSync("src/pages/support.astro", "utf8");
	assert.equal(layout.includes("Argon Collective LLC"), false);
	assert.equal(nav.includes("Argon Collective LLC"), true);
	assert.equal(nav.includes('href="/privacy"'), true);
	assert.equal(nav.includes('href="/support"'), true);
	assert.equal(nav.includes("DogEared Beta"), true);
	assert.equal(nav.includes('href="/release-notes"'), true);
	assert.equal(mission.includes("Argon Collective LLC"), false);
	assert.equal(support.includes("Argon Collective LLC"), true);
});
