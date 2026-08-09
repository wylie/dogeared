import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("home page includes onboarding checklist guidance", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	assert.equal(source.includes("Getting Started"), true);
	assert.equal(source.includes("data-onboarding-checklist"), true);
	assert.equal(source.includes("dismiss-onboarding-checklist"), true);
	assert.equal(source.includes("Welcome to DogEared."), true);
	assert.equal(source.includes("DogEared is designed to help you build a reading life you'll actually remember."), true);
	assert.equal(source.includes("Update reading progress"), true);
	assert.equal(source.includes("Explore Discover"), true);
	assert.equal(source.includes("data-reading-goal-prompt"), true);
	assert.equal(source.includes("data-recommendation-education"), true);
});

test("home page includes recommendation fallback section", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	const homeSectionsSource = readFileSync("src/lib/homeSections.ts", "utf8");
	assert.equal(source.includes("resolvePublicHomeSections"), true);
	assert.equal(homeSectionsSource.includes("Popular With Readers"), true);
	assert.equal(homeSectionsSource.includes("Start here while DogEared learns your taste"), true);
});

test("home empty state is actionable", () => {
	const source = readFileSync("src/pages/index.astro", "utf8");
	assert.equal(source.includes("Start by searching for a favorite book"), true);
});

test("search page empty states are actionable", () => {
	const source = readFileSync("src/pages/search.astro", "utf8");
	const leftHandSource = readFileSync("src/components/LeftHand.astro", "utf8");
	assert.equal(source.includes("Search for a favorite title"), true);
	assert.equal(source.includes("Try a broader title, an author name, or fewer keywords."), true);
	assert.equal(source.includes("Search again"), true);
	assert.equal(source.includes("Unable to search right now. Please try again in a moment."), true);
	assert.equal(source.includes("search-pending-state"), false);
	assert.equal(source.includes('data-search-state={initialSearchState}'), true);
	assert.match(source, /\.search-state\[hidden\]\s*{\s*display: none;\s*}/s);
	assert.match(source, /setCompletedEmptyState\(totalCards === 0, queryText\)/);
	assert.match(source, /setSearchLifecycleState\("loading"\)/);
	assert.equal(source.includes("completedResultCount"), true);
	assert.equal(leftHandSource.includes("data-search-form"), true);
	assert.equal(leftHandSource.includes("search-input-wrap"), true);
	assert.equal(leftHandSource.includes("search-submit-spinner"), true);
	assert.equal(leftHandSource.includes('aria-label="Clear search"'), true);
	assert.equal(leftHandSource.includes("Searching books."), true);
	assert.equal(leftHandSource.includes("Searching..."), false);
	assert.equal(leftHandSource.includes("aria-busy"), true);
	assert.equal(leftHandSource.includes("readOnly = true"), false);
});

test("welcome setup copy uses reader-first launch wording", () => {
	const source = readFileSync("src/pages/welcome.astro", "utf8");
	assert.equal(source.includes("Choose your reader name."), true);
	assert.equal(source.includes("This creates your DogEared profile URL"), true);
	assert.equal(source.includes("Unable to save your reader name. Please try again."), true);
});

test("profile empty states include clear first actions", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes("profile-empty-state"), true);
	assert.equal(source.includes("Once you begin reading, your activity will appear here."), true);
	assert.equal(source.includes("Find a book to start"), true);
	assert.equal(source.includes("Search for books"), true);
	assert.equal(source.includes("Add a finished book"), true);
	assert.equal(source.includes("grid.replaceWith(empty)"), true);
});

test("settings import flow points beta readers to their profile", () => {
	const source = readFileSync("src/pages/settings.astro", "utf8");
	assert.equal(source.includes("If you are starting fresh, you can skip import and add books from Search."), true);
	assert.equal(source.includes("Open Profile to review your shelves."), true);
	assert.equal(source.includes("Import canceled. Your shelves were not changed."), true);
});

test("settings import dashboard previews, reports, and resumes imports", () => {
	const source = readFileSync("src/pages/settings.astro", "utf8");
	const importLib = readFileSync("src/lib/goodreadsImport.ts", "utf8");
	const dataHealth = readFileSync("src/pages/admin/data-health.astro", "utf8");
	assert.equal(source.includes("Import Dashboard"), true);
	assert.equal(source.includes("Duplicate Resolution"), true);
	assert.equal(source.includes("Metadata Review Queue"), true);
	assert.equal(source.includes("Resume Failed Sync"), true);
	assert.equal(source.includes("dogeared:import-recovery"), true);
	assert.equal(source.includes("Export Report"), true);
	assert.equal(source.includes("buildGoodreadsImportPreview"), true);
	assert.equal(importLib.includes("duplicateExplanations"), true);
	assert.equal(importLib.includes("estimatedLabel"), true);
	assert.equal(dataHealth.includes("catalog-metadata"), true);
	assert.equal(dataHealth.includes("missing_cover"), true);
	assert.equal(dataHealth.includes("Import Dashboard"), true);
});

test("following page empty states explain next steps", () => {
	const source = readFileSync("src/pages/following.astro", "utf8");
	const publicReaderPolicySource = readFileSync("src/lib/publicReaderPolicy.ts", "utf8");
	assert.equal(source.includes("READER_SUGGESTIONS_EMPTY_MESSAGE"), true);
	assert.equal(publicReaderPolicySource.includes("As more readers join DogEared, you'll discover people with similar reading interests."), true);
	assert.equal(source.includes("Follow a few more readers or check back after your next reading update."), true);
});

test("shelf removal client surfaces specific API errors", () => {
	const source = readFileSync("src/lib/shelfClient.ts", "utf8");
	assert.equal(source.includes("resolveShelfRemoveMessage"), true);
	assert.equal(source.includes("This book is already off your shelves."), true);
	assert.equal(source.includes("Log in or create an account to save books"), true);
	assert.equal(source.includes("okButton.textContent = \"Continue\""), true);
});

test("profile momentum messaging is onboarding-friendly and supportive", () => {
	const profileSource = readFileSync("src/pages/profile/[username].astro", "utf8");
	const predictionSource = readFileSync("src/lib/momentumPrediction.ts", "utf8");
	assert.equal(predictionSource.includes("Recently started"), true);
	assert.equal(predictionSource.includes("Building reading history"), true);
	assert.equal(profileSource.includes("Add a few progress updates and DogEared will start estimating reading momentum."), true);
	assert.equal(predictionSource.includes("At risk"), false);
	assert.equal(profileSource.includes("get back on track"), false);
});

test("profile only renders one onboarding prediction hint at a time", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes("showOnboardingStatus"), true);
	assert.equal(source.includes('hidden={!momentum.showOnboardingStatus}'), true);
	assert.equal(source.includes('<p class="momentum-health momentum-health-neutral" hidden>'), true);
});
