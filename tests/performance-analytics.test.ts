import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("performance telemetry schema stores operational timing without reader payloads", () => {
	const migration = read("../db/migrations/2026-08-08-performance-telemetry.sql");
	const telemetry = read("../src/lib/performanceTelemetry.ts");

	assert.match(migration, /create table if not exists performance_event/);
	assert.match(migration, /operation_name text not null/);
	assert.match(migration, /total_ms numeric not null/);
	assert.match(migration, /spans jsonb not null/);
	assert.match(migration, /metadata jsonb not null/);
	assert.match(migration, /idx_performance_event_operation_created/);
	assert.match(migration, /idx_performance_event_provider_created/);
	assert.match(telemetry, /startMs\?: number/);
	assert.match(telemetry, /parentName\?: string/);
	assert.match(telemetry, /normalizeOptionalDuration/);
	assert.match(telemetry, /RAW_RETENTION_DAYS = 45/);
	assert.match(telemetry, /PERFORMANCE_TELEMETRY_SAMPLE_RATE/);
	assert.match(telemetry, /if \(!input\.success\) return true/);
	assert.match(telemetry, /if \(input\.totalMs >= slowThresholdForOperation/);
	assert.match(telemetry, /normalizeMetadata/);

	for (const forbidden of ["user_id", "email", "username", "search_query", "journal", "authorization", "password"]) {
		assert.doesNotMatch(migration.toLowerCase(), new RegExp(forbidden));
	}
});

test("admin performance page is admin-only and exposes percentile-first operations dashboard", () => {
	const page = read("../src/pages/admin/performance.astro");
	const detailPage = read("../src/pages/admin/performance/operations/[id].astro");
	const telemetry = read("../src/lib/performanceTelemetry.ts");
	const leftHand = read("../src/components/LeftHand.astro");

	assert.match(page, /resolveAdminSession\(Astro\.request\)/);
	assert.match(page, /if \(!admin\.isAdmin\) return Astro\.redirect\("\/"\)/);
	assert.match(page, /robots="noindex,nofollow"/);
	assert.match(leftHand, /href: "\/admin\/performance", label: "Performance"/);
	assert.match(page, /PERFORMANCE_PERIODS/);
	assert.match(telemetry, /Last hour/);
	assert.match(telemetry, /Last 24 hours/);
	assert.match(page, /p50/);
	assert.match(page, /p75/);
	assert.match(page, /p95/);
	assert.match(page, /p99/);
	assert.match(page, /External Services/);
	assert.match(page, /Recent Slow Operations/);
	assert.match(page, /\/admin\/performance\/operations\/\$\{row\.id\}/);
	assert.match(page, /Aggregate p95 span contribution/);
	assert.match(page, /timeoutDetail/);
	assert.match(page, /Retries:/);
	assert.match(page, /Release Comparison/);
	assert.match(page, /Performance Targets/);
	assert.match(page, /Performance data will populate/);
	assert.match(detailPage, /resolveAdminSession\(Astro\.request\)/);
	assert.match(detailPage, /if \(!admin\.isAdmin\) return Astro\.redirect\("\/"\)/);
	assert.match(detailPage, /robots="noindex,nofollow"/);
	assert.match(detailPage, /loadPerformanceOperationDetail/);
	assert.match(detailPage, /Request Waterfall/);
	assert.match(detailPage, /Span Breakdown/);
	assert.match(detailPage, /Diagnostic Counts/);
	assert.match(detailPage, /Span Table/);
	assert.match(detailPage, /historical duration-only spans/);
});

test("admin performance loader computes workflow, route, provider, slow-operation, and release summaries", () => {
	const telemetry = read("../src/lib/performanceTelemetry.ts");

	assert.match(telemetry, /percentile_cont\(0\.5\)/);
	assert.match(telemetry, /percentile_cont\(0\.75\)/);
	assert.match(telemetry, /percentile_cont\(0\.95\)/);
	assert.match(telemetry, /percentile_cont\(0\.99\)/);
	assert.match(telemetry, /search\.books/);
	assert.match(telemetry, /progress\.save/);
	assert.match(telemetry, /shelf\.mutate/);
	assert.match(telemetry, /page\.profile/);
	assert.match(telemetry, /page\.book-detail/);
	assert.match(telemetry, /navigation\.feedback/);
	assert.match(telemetry, /external\.google-books/);
	assert.match(telemetry, /external\.open-library/);
	assert.match(telemetry, /cross join lateral jsonb_array_elements\(pe\.spans\)/);
	assert.match(telemetry, /p50_ms/);
	assert.match(telemetry, /external_provider/);
	assert.match(telemetry, /total_ms >= \$\{slowThreshold\}/);
	assert.match(telemetry, /Provider timeout:/);
	assert.match(telemetry, /Canonical timeout:/);
	assert.match(telemetry, /retryCount/);
	assert.match(telemetry, /loadPerformanceOperationDetail/);
	assert.match(telemetry, /safePerformanceMetadataItems/);
	assert.match(telemetry, /hasWaterfallOffsets/);
	assert.match(telemetry, /release_version/);
	assert.match(telemetry, /withRuntimeCache\(/);
});

test("core workflows record sanitized performance events at meaningful boundaries", () => {
	const searchApi = read("../src/pages/api/books/search.ts");
	const progressApi = read("../src/pages/api/reading/progress.ts");
	const shelfApi = read("../src/pages/api/shelf/entries.ts");
	const searchPage = read("../src/pages/search.astro");
	const profilePage = read("../src/pages/profile/[username].astro");
	const bookPage = read("../src/pages/book.astro");
	const authorPage = read("../src/pages/author/[slug].astro");
	const discoverPage = read("../src/pages/discover.astro");
	const readingLifePage = read("../src/pages/reading-life.astro");
	const navigationTelemetry = read("../src/pages/api/performance/navigation.ts");
	const layout = read("../src/layouts/Layout.astro");

	assert.match(searchApi, /recordPerformanceEventSafe/);
	assert.match(searchApi, /operationName: "search\.books"/);
	assert.match(searchApi, /operationName: "external\.google-books"/);
	assert.match(searchApi, /operationName: "external\.open-library"/);
	assert.match(searchApi, /startMs: Math\.round/);
	assert.match(searchApi, /parentName/);
	assert.match(searchApi, /canonical Work matching"/);
	assert.match(searchApi, /metadata: \{\s*page,\s*pageSize,\s*phase,/s);
	assert.doesNotMatch(searchApi, /metadata: \{\s*query[,:\s]/);

	assert.match(progressApi, /operationName: "progress\.save"/);
	assert.match(progressApi, /hasBookId: bookId > 0/);
	assert.doesNotMatch(progressApi, /metadata: \{\s*title[,:\s]/);

	assert.match(shelfApi, /operationName: "shelf\.mutate"/);
	assert.match(shelfApi, /action: "upsert"/);
	assert.match(shelfApi, /action: "remove"/);
	assert.match(shelfApi, /hasExistingCatalogBook/);

	for (const [operation, source] of [
		["page.search", searchPage],
		["page.profile", profilePage],
		["page.book-detail", bookPage],
		["page.author-detail", authorPage],
		["page.discover", discoverPage],
		["page.reading-life", readingLifePage]
	] as const) {
		assert.match(source, new RegExp(`operationName: "${operation.replace(".", "\\.")}"`));
		assert.match(source, /route: "\//);
		assert.match(source, /spans: pagePerf(?:Stages|Spans)/);
	}
	assert.match(profilePage, /timePagePerf\("authentication\/session"/);
	assert.match(profilePage, /onTiming: recordPagePerfSpan/);
	assert.match(profilePage, /startMs/);
	assert.match(profilePage, /recordPagePerfSpan\("finished-this-year books"/);
	assert.match(profilePage, /recordPagePerfSpan\("reviews"/);
	assert.match(profilePage, /recordPagePerfSpan\("DNF"/);
	assert.match(profilePage, /performanceTelemetry=\{profilePerformanceTelemetry\}/);
	assert.match(layout, /name: "notification count"/);
	assert.match(navigationTelemetry, /operationName: "navigation\.feedback"/);
	assert.match(navigationTelemetry, /normalizeRoute/);
	assert.doesNotMatch(navigationTelemetry, /searchParams/);
});
