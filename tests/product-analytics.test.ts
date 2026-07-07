import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("product analytics schema and helper keep events aggregate and first-party", () => {
	const source = readFileSync("src/lib/productAnalytics.ts", "utf8");
	assert.equal(source.includes("create table if not exists product_analytics_event"), true);
	assert.equal(source.includes("event_name text not null"), true);
	assert.equal(source.includes("result_count int not null default 0"), true);
	assert.equal(source.includes("recordProductAnalyticsEventSafe"), true);
	assert.equal(source.includes("loadAdminProductAnalytics"), true);
	assert.equal(source.includes("withRuntimeCache(\"admin:product-analytics:v1\""), true);
	assert.equal(source.includes("private journal"), false);
	assert.equal(source.includes("password"), false);
});

test("analytics endpoint accepts only small product event allowlist", () => {
	const source = readFileSync("src/pages/api/analytics/event.ts", "utf8");
	for (const eventName of [
		"page_view",
		"feature_view",
		"recommendation_impression",
		"recommendation_click",
		"recommendation_add_to_shelf"
	]) {
		assert.equal(source.includes(`"${eventName}"`), true);
	}
	assert.equal(source.includes("resolveUserBySession"), true);
	assert.equal(source.includes("normalizeMetadata"), true);
	assert.equal(source.includes("Unsupported analytics event"), true);
});

test("search and recommendation flows record aggregate analytics events", () => {
	const search = readFileSync("src/pages/api/books/search.ts", "utf8");
	const feedback = readFileSync("src/pages/api/recommendations/feedback.ts", "utf8");
	assert.equal(search.includes("recordProductAnalyticsEventSafe"), true);
	assert.equal(search.includes("search_performed"), true);
	assert.equal(search.includes("classifySearchAnalyticsSubject"), true);
	assert.equal(search.includes("resultCount: results.length + collectionResults.length"), true);
	assert.equal(feedback.includes("recommendation_feedback"), true);
	assert.equal(feedback.includes("eventGroup: \"discovery\""), true);
});

test("layout tracks first-party page, feature, and recommendation product events", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const card = readFileSync("src/components/BookCard.astro", "utf8");
	assert.equal(layout.includes("/api/analytics/event"), true);
	assert.equal(layout.includes("dogearedTrackProductEvent"), true);
	assert.equal(layout.includes("recommendation_impression"), true);
	assert.equal(layout.includes("recommendation_click"), true);
	assert.equal(layout.includes("recommendation_add_to_shelf"), true);
	assert.equal(layout.includes("googletagmanager.com"), false);
	assert.equal(layout.includes("gtag("), false);
	assert.equal(card.includes("data-analytics-recommendation-book-id"), true);
	assert.equal(card.includes("data-analytics-recommendation-source"), true);
});

test("admin analytics dashboard is aggregate, noindex, and documented", () => {
	const page = readFileSync("src/pages/admin/analytics.astro", "utf8");
	const routes = readFileSync("docs/engineering/routes.md", "utf8");
	const database = readFileSync("docs/engineering/database.md", "utf8");
	const features = readFileSync("docs/product/features.md", "utf8");
	assert.equal(page.includes("resolveAdminSession"), true);
	assert.equal(page.includes("robots=\"noindex,nofollow\""), true);
	for (const label of ["Growth", "Reading", "Community", "Search", "Discovery", "First-Run Funnel", "Feature Adoption"]) {
		assert.equal(page.includes(label), true);
	}
	assert.equal(page.includes("No private journal content"), true);
	assert.equal(page.includes("reader-level reports"), true);
	assert.equal(routes.includes("/admin/analytics"), true);
	assert.equal(routes.includes("/api/analytics/event"), true);
	assert.equal(database.includes("product_analytics_event"), true);
	assert.equal(features.includes("Admin Product Analytics"), true);
});
