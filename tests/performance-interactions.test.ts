import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("search API supports local-first and deferred external results", () => {
	const source = read("../src/pages/api/books/search.ts");
	const catalogWorks = read("../src/lib/catalogWorks.ts");
	const dbPromise = source.indexOf("const dbdRowsPromise = withRuntimeCache");
	const localMode = source.indexOf('if (phase === "local")');
	const externalLoader = source.indexOf("const loadExternalResults = async () => withRuntimeCache");
	const googlePromise = source.indexOf('const googleFetchedSetsPromise = googleQueries.length > 0');
	const openPromise = source.indexOf('const openFetchedSetsPromise = openQueries.length > 0');

	assert.ok(dbPromise > -1);
	assert.ok(localMode > dbPromise);
	assert.ok(externalLoader > dbPromise);
	assert.ok(googlePromise > externalLoader);
	assert.ok(openPromise > googlePromise);
	assert.match(source, /normalizeSearchPhase\(url\.searchParams\.get\("mode"\)\)/);
	assert.match(source, /normalizeExternalSearchProvider\(url\.searchParams\.get\("provider"\)\)/);
	assert.match(source, /EXTERNAL_PROVIDER_TIMEOUT_MS = 1_800/);
	assert.match(source, /externalProviderFetchInit\(\)/);
	assert.match(source, /const queryTokenPatterns = tokenizeQuery\(query\)/);
	assert.match(source, /from unnest\(\$\{queryTokenPatterns\}::text\[\]\) token_pattern/);
	assert.match(source, /if \(phase === "local"\)/);
	assert.match(source, /phase === "external"/);
	assert.match(source, /markPerfStage\("local_catalog_loaded"\)/);
	assert.match(source, /markPerfStage\("external_providers_loaded"\)/);
	assert.match(source, /markPerfStage\("canonical_resolution_complete"\)/);
	assert.match(source, /recordSearchSpan\("local catalog search"/);
	assert.match(source, /measureSearchSpan\("Google Books"/);
	assert.match(source, /measureSearchSpan\("Open Library"/);
	assert.match(source, /measureSearchSpan\("canonical Work matching"/);
	assert.match(source, /measureSearchSpanSync\("result merge"/);
	assert.match(catalogWorks, /needs_backfill/);
	assert.match(catalogWorks, /if \(backfillRows\[0\]\?\.needs_backfill\)/);
});

test("search page parallelizes result decoration and preserves duplicate-submit feedback", () => {
	const searchPage = read("../src/pages/search.astro");
	const leftHand = read("../src/components/LeftHand.astro");

	assert.match(searchPage, /const customShelfOptionsPromise = session\?\.userId/);
	assert.match(searchPage, /endpoint\.searchParams\.set\("mode", "local"\)/);
	assert.match(searchPage, /new AbortController\(\)/);
	assert.match(searchPage, /externalSearchRequestId/);
	assert.match(searchPage, /mode: "external"/);
	assert.match(searchPage, /providerParams\.set\("provider", provider\.id\)/);
	assert.match(searchPage, /Promise\.all\(providers\.map/);
	assert.match(searchPage, /appendExternalResults/);
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

test("page navigation and route rendering avoid avoidable blocking work", () => {
	const layout = read("../src/layouts/Layout.astro");
	const authors = read("../src/pages/authors.astro");
	const authorDetail = read("../src/pages/author/[slug].astro");
	const journal = read("../src/lib/readingJournal.ts");
	const notifications = read("../src/lib/notifications.ts");
	const feed = read("../src/lib/feed.ts");
	const reviews = read("../src/lib/bookReviews.ts");

	assert.match(layout, /import \{ ClientRouter \} from 'astro:transitions'/);
	assert.match(layout, /<ClientRouter \/>/);
	assert.match(layout, /astro:before-preparation/);
	assert.match(layout, /class="navigation-progress"/);
	assert.match(authors, /select count\(\*\)::int as total/);
	assert.match(authors, /limit \$\{pageSize\}/);
	assert.match(authors, /offset \$\{offset\}/);
	assert.doesNotMatch(authors, /filtered = rows\.filter/);
	assert.match(authorDetail, /withRuntimeCache\(`author-open-library-bio:v1:/);
	assert.match(authorDetail, /withRuntimeCache\(\s*`author-external-books:v1:/);
	assert.match(authorDetail, /AbortSignal\.timeout\(900\)/);
	assert.match(journal, /let readingJournalSchemaReady: Promise<void> \| null = null/);
	assert.match(notifications, /let notificationSchemaReady: Promise<void> \| null = null/);
	assert.match(feed, /let followSchemaReady: Promise<void> \| null = null/);
	assert.match(feed, /let feedInteractionSchemaReady: Promise<void> \| null = null/);
	assert.match(reviews, /let reviewSchemaReady: Promise<void> \| null = null/);
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

test("shelf mutation API reuses existing catalog books before enrichment work", () => {
	const shelfApi = read("../src/pages/api/shelf/entries.ts");
	const customShelves = read("../src/lib/customShelves.ts");

	const existingResolver = shelfApi.indexOf("async function resolveExistingShelfCatalogBook");
	const existingLookup = shelfApi.indexOf("const existingCatalogBook = directBookId > 0");
	const authorEnrichment = shelfApi.indexOf("await ensureAuthorEnriched(author)");
	const metadataGate = shelfApi.indexOf("const shouldAttemptMetadataEnrichment = !hasExistingCatalogBook && directBookId <= 0");
	const canonicalGate = shelfApi.indexOf("if (resolvedBookId <= 0)");
	const catalogReuse = shelfApi.indexOf('markPerfStage("catalog_reused")');
	const workEditionUpsert = shelfApi.indexOf("workEdition = await upsertWorkAndEdition");
	const authoritativeFollowups = shelfApi.indexOf("const requiredFollowups: Promise<unknown>[] = []");
	const followupParallelism = shelfApi.indexOf("await Promise.all(requiredFollowups)");

	assert.ok(existingResolver > -1);
	assert.ok(existingLookup > existingResolver);
	assert.ok(authorEnrichment > existingLookup);
	assert.ok(metadataGate > authorEnrichment);
	assert.ok(canonicalGate > metadataGate);
	assert.ok(catalogReuse > canonicalGate);
	assert.ok(workEditionUpsert > catalogReuse);
	assert.ok(authoritativeFollowups > workEditionUpsert);
	assert.ok(followupParallelism > authoritativeFollowups);
	assert.match(shelfApi, /hasExistingCatalogBook\s+\?\s+Math\.max\(0, Number\(existingCatalogBook\?\.authorId/);
	assert.match(shelfApi, /if \(!hasExistingCatalogBook\) \{\s*debugStage = "upsert_sources"/s);
	assert.doesNotMatch(shelfApi, /debugStage = "load_persisted_entry"/);
	assert.match(customShelves, /let customShelfSchemaReady: Promise<void> \| null = null/);
	assert.match(customShelves, /await customShelfSchemaReady/);
});
