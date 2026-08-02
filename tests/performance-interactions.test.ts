import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("search API launches catalog and provider work before awaiting results", () => {
	const source = read("../src/pages/api/books/search.ts");
	const dbPromise = source.indexOf("const dbdRowsPromise = withRuntimeCache");
	const googlePromise = source.indexOf("const googleFetchedSetsPromise = Promise.all");
	const openPromise = source.indexOf("const openFetchedSetsPromise = Promise.all");
	const awaitAll = source.indexOf("const [dbdRows, googleFetchedSets, openFetchedSets] = await Promise.all");

	assert.ok(dbPromise > -1);
	assert.ok(googlePromise > dbPromise);
	assert.ok(openPromise > googlePromise);
	assert.ok(awaitAll > openPromise);
	assert.match(source, /markPerfStage\("catalog_and_providers_loaded"\)/);
	assert.match(source, /markPerfStage\("canonical_resolution_complete"\)/);
});

test("search page parallelizes result decoration and preserves duplicate-submit feedback", () => {
	const searchPage = read("../src/pages/search.astro");
	const leftHand = read("../src/components/LeftHand.astro");

	assert.match(searchPage, /const customShelfOptionsPromise = session\?\.userId/);
	assert.match(searchPage, /const \[summaryRows, statusRows\] = await Promise\.all\(\[summaryRowsPromise, statusRowsPromise\]\)/);
	assert.match(leftHand, /leftHandSearchForm\.dataset\.searching === "true"/);
	assert.match(leftHand, /event\.preventDefault\(\)/);
	assert.match(leftHand, /leftHandSearchForm\.setAttribute\("aria-busy", "true"\)/);
	assert.match(leftHand, /leftHandSearchStatus\.hidden = false/);
});

test("request-scoped auth and layout loads avoid repeated sequential work", () => {
	const auth = read("../src/lib/auth.ts");
	const layout = read("../src/layouts/Layout.astro");

	assert.match(auth, /new WeakMap<Request, Promise<ResolvedSession>>\(\)/);
	assert.match(auth, /sessionByRequest\.get\(request\)/);
	assert.match(layout, /await Promise\.all\(\[/);
	assert.match(layout, /resolveAdminSession\(Astro\.request\)/);
	assert.match(layout, /loadActiveAnnouncement\(\)/);
});

test("shelf feedback disables duplicate actions without committing success before acceptance", () => {
	const searchPage = read("../src/pages/search.astro");
	const bookPage = read("../src/pages/book.astro");
	const shelfClient = read("../src/lib/shelfClient.ts");

	const savingIndex = searchPage.indexOf('showShelfFeedback(dropdown, "Saving...", feedbackTimers)');
	const saveIndex = searchPage.indexOf("const result = await saveShelfEntryWithRetry(draft)");
	const persistedIndex = searchPage.indexOf("saveShelfEntries(latest)");
	const successIndex = searchPage.indexOf("previousStatus === selectedStatus");

	assert.ok(savingIndex > -1);
	assert.ok(saveIndex > savingIndex);
	assert.ok(persistedIndex > saveIndex);
	assert.ok(successIndex > persistedIndex);
	assert.match(searchPage, /if \(isShelfActionBusy\(dropdown\)\) return/);
	assert.match(searchPage, /setShelfActionBusy\(dropdown, true\)/);
	assert.match(searchPage, /finally \{\s*setShelfActionBusy\(dropdown, false\);/s);
	assert.match(bookPage, /showShelfFeedback\(dropdown, "Saving\.\.\.", feedbackTimers\)/);
	assert.match(bookPage, /showShelfFeedback\(dropdown, "Removing\.\.\.", feedbackTimers\)/);
	assert.match(shelfClient, /const inFlightShelfMutations = new Map/);
	assert.match(shelfClient, /notifyReadingDataChanged\(\)/);
});
