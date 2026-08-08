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

test("author bibliography cards use DogEared shelf conversion without outbound title links", () => {
	const source = readFileSync("src/pages/author/[slug].astro", "utf8");
	assert.equal(source.includes("<CollectionBookCard"), true);
	assert.equal(source.includes("<ShelfDropdown"), true);
	assert.equal(source.includes('"data-source": "open_library"'), true);
	assert.equal(source.includes("Search DogEared"), false);
	assert.equal(source.includes("titleHref={entry.externalBook"), false);
	assert.equal(source.includes("href={entry.externalBook.sourceUrl"), false);
	assert.equal(source.includes("Additional titles from Open Library"), false);
});

test("author pages organize local and external books by reader-facing bibliography", () => {
	const source = readFileSync("src/pages/author/[slug].astro", "utf8");
	assert.equal(source.includes("Books In DogEared"), false);
	assert.equal(source.includes("Not Yet In DogEared"), false);
	assert.equal(source.includes("<ExternalAuthorBooks"), false);
	assert.equal(source.includes("<SeriesSection"), true);
	assert.equal(source.includes("<AuthorSection"), true);
	assert.equal(source.includes('spacing="inline"'), true);
	assert.equal(source.includes("supportingText={formatBookCount(group.books.length)}"), true);
	assert.equal(source.includes("buildAuthorBibliographySections"), true);
	assert.equal(source.includes("formatSeriesSectionTitle"), true);
	assert.equal(source.includes("inferKnownSeriesMetadata"), true);
	assert.equal(source.includes('{ label: "Known books", value: knownBookCount }'), true);
	assert.equal(source.includes("books.map((book) => book.title)"), false);
	assert.equal(source.includes("dropdown.dataset.bookId = String(bookId)"), true);
	assert.equal(source.includes("/api/shelf/custom-shelf-books"), true);
});

test("author pages group by canonical Work series metadata without duplicate book labels", () => {
	const source = readFileSync("src/pages/author/[slug].astro", "utf8");

	assert.equal(source.includes("left join book_work bw on bw.id = b.work_id"), true);
	assert.equal(source.includes("sibling.work_id = b.work_id"), true);
	assert.equal(source.includes("bw.series_position as book_order"), true);
	assert.equal(source.includes("series:${seriesId}:${bookOrder}"), true);
	assert.equal(source.includes('seriesLabel={entry.bookOrder > 0 ? `Book ${entry.bookOrder}` : ""}'), true);
	assert.equal(source.includes("series-chip"), false);
	assert.equal(source.includes("`${book.seriesName}${book.bookOrder > 0"), false);
});

test("BookCard renders accessible genre navigation", () => {
	const source = readFileSync("src/components/BookCard.astro", "utf8");
	assert.equal(source.includes('aria-label="Genres"'), true);
	assert.equal(source.includes("/related?kind=genre&value="), true);
	assert.equal(source.includes('kind="genre"'), true);
	assert.equal(source.includes('kind="topic"'), true);
});

test("CollectionBookCard owns the compact reusable presentation variant", () => {
	const source = readFileSync("src/components/BookCard.astro", "utf8");
	const collectionCard = readFileSync("src/components/CollectionBookCard.astro", "utf8");
	const bookPage = readFileSync("src/pages/book.astro", "utf8");
	const authorPage = readFileSync("src/pages/author/[slug].astro", "utf8");
	const collectionPage = readFileSync("src/pages/collections/[slug].astro", "utf8");

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
	assert.match(collectionCard, /variant="compact-series"/);
	assert.equal(bookPage.includes("<CollectionBookCard"), true);
	assert.equal(authorPage.includes("<CollectionBookCard"), true);
	assert.equal(collectionPage.includes("<CollectionBookCard"), true);
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
	assert.equal(source.includes("applyAuthoritativeMomentumBook(card"), true);
});

test("profile progress saves refresh all derived reading UI without reload", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const apiSource = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const progressApiSource = readFileSync("src/pages/api/reading/progress.ts", "utf8");
	const summaryApiSource = readFileSync("src/pages/api/reading/summary.ts", "utf8");
	const summarySource = readFileSync("src/lib/readingSummary.ts", "utf8");
	const worksSource = readFileSync("src/lib/catalogWorks.ts", "utf8");
	assert.equal(source.includes("normalizePersistedDateValue"), true);
	assert.equal(source.includes("const hasForwardProgress = Boolean(persistedProgress && persistedProgress.progressEventRecorded)"), true);
	assert.equal(source.includes("if (hasForwardProgress) rememberReadingActivityToday()"), true);
	assert.equal(source.includes("updateMomentumStreakDisplay"), true);
	assert.equal(source.includes("data-momentum-streak-unit"), true);
	assert.equal(source.includes("setNodeText(momentumScoreNode"), true);
	assert.equal(source.includes("momentumNextActionNode"), true);
	assert.equal(source.includes("refreshAuthoritativeReadingSummary"), true);
	assert.equal(source.includes('fetch("/api/reading/summary"'), true);
	assert.equal(source.includes('fetch("/api/reading/progress"'), true);
	assert.equal(source.includes('cache: "no-store"'), true);
	assert.equal(source.includes("applyAuthoritativeReadingSummary(data?.summary)"), true);
	assert.equal(source.includes("applyAuthoritativeReadingSummary(result?.data?.summary)"), true);
	assert.equal(source.includes('window.addEventListener("focus", () => revalidateReadingSummaryWhenActive())'), true);
	assert.equal(source.includes('document.addEventListener("visibilitychange"'), true);
	assert.equal(source.includes('new BroadcastChannel("dogeared:reading-data")'), true);
	assert.equal(source.includes('event.key === "dogeared:reading-data-changed-at"'), true);
	assert.equal(source.includes("function ensureProgressDisplay(card, currentPage, totalPages)"), true);
	assert.equal(source.includes('progressNode.className = "meta progress-current-value"'), true);
	assert.equal(source.includes('progressTrack.className = "progress-track progress-bar-track"'), true);
	assert.equal(source.includes('card.dataset.momentumProgressUpdates = String(persistedProgressUpdates > 0'), true);
	assert.equal(source.includes("function recalcMomentumFromDom()"), false);
	const progressSaveStart = source.indexOf('if (progressSave instanceof HTMLButtonElement)');
	const directProgressSaveStart = source.indexOf("const result = await saveReadingProgressUpdate({", progressSaveStart);
	const progressMaterialize = source.indexOf("ensureProgressDisplay(card, nextCurrentPage, nextTotalPages)", progressSaveStart);
	const currentPageUpdate = source.indexOf("card.dataset.momentumCurrentPage = String(nextCurrentPage)", progressSaveStart);
	const rememberProgress = source.indexOf("if (hasForwardProgress) rememberReadingActivityToday()", progressSaveStart);
	const progressSummaryApply = source.indexOf("const appliedSummary = applyAuthoritativeReadingSummary(result?.data?.summary)", progressSaveStart);
	const progressCatch = source.indexOf("} catch (error) {", progressSummaryApply);
	const authoritativeRefresh = source.indexOf("await refreshAuthoritativeReadingSummary({ force: true })");
	assert.ok(progressSaveStart > -1);
	assert.ok(directProgressSaveStart > progressSaveStart);
	assert.ok(progressMaterialize > progressSaveStart && progressMaterialize < currentPageUpdate);
	assert.ok(currentPageUpdate > progressSaveStart && currentPageUpdate < progressSummaryApply);
	assert.ok(progressSummaryApply > currentPageUpdate && progressSummaryApply < progressCatch);
	assert.ok(rememberProgress > progressSummaryApply && rememberProgress < progressCatch);
	assert.equal(source.slice(directProgressSaveStart, progressCatch).includes("refreshProfileReadingUiAfterMutation()"), false);
	assert.ok(authoritativeRefresh > -1);
	assert.equal(apiSource.includes("progress_updates"), true);
	assert.equal(apiSource.includes("progressUpdates"), true);
	assert.equal(apiSource.includes("user_reading_progress_event"), true);
	assert.equal(progressApiSource.includes("loadReaderReadingSummary(sql, session.userId)"), true);
	assert.equal(progressApiSource.includes("progressEventRecorded"), true);
	assert.equal(summaryApiSource.includes("loadReaderReadingSummary"), true);
	assert.equal(summaryApiSource.includes('"Cache-Control": "no-store"'), true);
	assert.equal(summarySource.includes("calculateReadingStreak(readingStreakDateKeys"), true);
	assert.equal(summarySource.includes("resolveMomentumPrediction"), true);
	assert.equal(source.includes("loadReaderReadingSummary(sql, bundle.targetUserId)"), true);
	assert.equal(source.includes("buildReaderReadingSummary({"), true);
	assert.equal(apiSource.includes("previousStatus === status && status === \"reading\""), false);
	assert.equal(apiSource.includes("coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages"), true);
	assert.equal(apiSource.includes("const effectiveTotalPages = Math.max("), true);
	assert.equal(apiSource.includes("${effectiveTotalPages}"), true);
	assert.equal(apiSource.includes('detail: import.meta.env.DEV && debugStage'), true);
	assert.equal(apiSource.includes('console.error("[shelf.upsert.debug]"'), true);
	assert.equal(summarySource.includes("coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages"), true);
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
