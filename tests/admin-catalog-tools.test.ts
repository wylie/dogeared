import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDuration, isAudiobookFormat, loadCatalogMetadataHealth, parseDurationToSeconds } from "../src/lib/adminCatalog.ts";

function makeHealthRow(overrides: Record<string, unknown> = {}) {
	return {
		work_id: 412,
		book_id: 412,
		edition_id: 412,
		title: "Infinity Alchemist (Book 1)",
		author: "Kacen Callender",
		cover_url: "https://example.com/cover.jpg",
		format: "hardcover",
		book_page_count: 320,
		edition_page_count: 320,
		publisher: "Example Press",
		published_year: 2024,
		description: "A catalog fixture.",
		isbn10: "",
		isbn13: "9780000000001",
		google_books_id: "",
		open_library_work_id: "",
		open_library_edition_id: "",
		series_id: null,
		series_position: "",
		metadata: {},
		updated_at: "2026-08-09T12:00:00.000Z",
		progress_entries: 0,
		percent_progress_entries: 0,
		audio_progress_entries: 0,
		...overrides
	};
}

function createCatalogHealthSql(rows: Array<Record<string, unknown>>) {
	let call = 0;
	const sql = async () => {
		call += 1;
		if (call === 1) return rows;
		return [];
	};
	return sql as any;
}

test("admin catalog duration helpers store audiobook length as seconds", () => {
	assert.equal(parseDurationToSeconds("11 hr 24 min"), 41040);
	assert.equal(parseDurationToSeconds("1:20:30"), 4830);
	assert.equal(parseDurationToSeconds("95"), 5700);
	assert.equal(formatDuration(41040), "11 hr 24 min");
	assert.equal(isAudiobookFormat("Audiobook"), true);
	assert.equal(isAudiobookFormat("hardcover"), false);
});

test("Data Health exposes format-aware catalog metadata checks and filters", () => {
	const page = readFileSync("src/pages/admin/data-health.astro", "utf8");
	const lib = readFileSync("src/lib/adminCatalog.ts", "utf8");
	const migration = readFileSync("db/migrations/2026-08-09-admin-catalog-tools.sql", "utf8");

	assert.match(page, /Catalog Review Queue/);
	assert.match(page, /loadCatalogMetadataHealth/);
	assert.match(page, /catalogMetadataHealth\.records/);
	assert.match(page, /Needs attention/);
	assert.match(page, /stat-link/);
	assert.match(page, /Pagination/);
	assert.match(page, /catalog_page/);
	assert.match(page, /catalogPageHref/);
	assert.match(page, /Showing \$\{formatNumber\(catalogShowingStart\)\}/);
	assert.match(page, /catalog_issue/);
	assert.match(page, /catalog_severity/);
	assert.match(page, /catalog_format/);
	assert.match(page, /catalog_provider/);
	assert.match(page, /Missing audiobook duration/);
	assert.match(page, /Progress-blocking metadata issues/);
	assert.match(page, /Edit catalog data/);
	assert.match(page, /\/admin\/books\/\$\{record\.workId\}/);
	assert.doesNotMatch(page, /id="metadata-gaps"/);
	assert.doesNotMatch(page, /id="metadata-review"/);
	assert.doesNotMatch(page, /id="page-count-gaps"/);
	assert.doesNotMatch(page, /id="publisher-gaps"/);

	for (const issueType of [
		"missing_page_count",
		"missing_audiobook_duration",
		"missing_description",
		"missing_reading_format_metadata",
		"missing_series_position",
		"progress_not_normalizable",
		"potential_duplicate_work",
		"potential_duplicate_edition"
	]) {
		assert.match(lib, new RegExp(issueType));
	}
	assert.match(lib, /isAudiobookFormat\(row\.format\)/);
	assert.match(lib, /aggregateCatalogHealthRecords/);
	assert.match(lib, /totalRecords/);
	assert.match(lib, /durationSeconds/);
	assert.match(migration, /admin_catalog_audit_event/);
	assert.match(migration, /idx_book_edition_metadata_gin/);
});

test("Catalog Review Queue aggregates mixed Work and Edition issues into one review target", async () => {
	const result = await loadCatalogMetadataHealth(createCatalogHealthSql([
		makeHealthRow({
			work_id: 412,
			book_id: 412,
			edition_id: 412,
			title: "Infinity Alchemist (Book 1)",
			format: "",
			publisher: ""
		}),
		makeHealthRow({
			work_id: 419,
			book_id: 419,
			edition_id: 418,
			title: "The Assassin's Blade (Book 0)",
			format: ""
		})
	]), { limit: 25 });

	assert.equal(result.pagination.total, 2);
	assert.equal(result.records.length, 2);
	const infinity = result.records.find((record) => record.workId === 412 && record.editionId === 412);
	assert.ok(infinity);
	assert.equal(infinity.issues.length, 3);
	assert.deepEqual(infinity.issues.map((issue) => issue.issueType).sort(), [
		"missing_publisher",
		"missing_reading_format_metadata",
		"missing_series_relationship"
	]);
	assert.equal(infinity.issues.find((issue) => issue.issueType === "missing_series_relationship")?.scope, "work");

	const assassinsBlade = result.records.find((record) => record.workId === 419 && record.editionId === 418);
	assert.ok(assassinsBlade);
	assert.equal(assassinsBlade.issues.length, 2);
	assert.deepEqual(assassinsBlade.issues.map((issue) => issue.issueType).sort(), [
		"missing_reading_format_metadata",
		"missing_series_relationship"
	]);
});

test("Catalog Review Queue keeps Work-only and Edition-only review targets distinct without duplicating rows", async () => {
	const result = await loadCatalogMetadataHealth(createCatalogHealthSql([
		makeHealthRow({
			work_id: 501,
			book_id: 501,
			edition_id: 601,
			title: "Shared Work",
			description: ""
		}),
		makeHealthRow({
			work_id: 501,
			book_id: 501,
			edition_id: 602,
			title: "Shared Work",
			description: ""
		}),
		makeHealthRow({
			work_id: 502,
			book_id: 502,
			edition_id: 603,
			title: "Edition Metadata Only",
			format: ""
		}),
		makeHealthRow({
			work_id: 503,
			book_id: 503,
			edition_id: null,
			title: "Work Only Book 2",
			format: "paperback"
		})
	]), { limit: 25 });

	assert.equal(result.pagination.total, 3);
	const sharedWork = result.records.find((record) => record.workId === 501);
	assert.ok(sharedWork);
	assert.equal(sharedWork.issues.length, 1);
	assert.equal(sharedWork.issues[0].issueType, "missing_description");
	assert.equal(sharedWork.issues[0].scope, "work");

	const editionOnly = result.records.find((record) => record.workId === 502);
	assert.ok(editionOnly);
	assert.equal(editionOnly.editionId, 603);
	assert.deepEqual(editionOnly.issues.map((issue) => issue.issueType), ["missing_reading_format_metadata"]);

	const workOnly = result.records.find((record) => record.workId === 503);
	assert.ok(workOnly);
	assert.equal(workOnly.editionId, 0);
	assert.deepEqual(workOnly.issues.map((issue) => issue.issueType), ["missing_series_relationship"]);
});

test("Catalog Review Queue filters and paginates unique review targets after aggregation", async () => {
	const rows = [
		makeHealthRow({
			work_id: 412,
			book_id: 412,
			edition_id: 412,
			title: "Infinity Alchemist (Book 1)",
			format: "",
			publisher: ""
		})
	];
	for (let index = 0; index < 12; index += 1) {
		rows.push(makeHealthRow({
			work_id: 700 + index,
			book_id: 700 + index,
			edition_id: 800 + index,
			title: `Edition Gap ${index + 1}`,
			format: ""
		}));
	}

	const filtered = await loadCatalogMetadataHealth(createCatalogHealthSql(rows), {
		issueType: "missing_series_relationship",
		limit: 25
	});
	assert.equal(filtered.pagination.total, 1);
	assert.equal(filtered.records.length, 1);
	assert.equal(filtered.records[0].workId, 412);
	assert.equal(filtered.records[0].issues.length, 3);

	const paged = await loadCatalogMetadataHealth(createCatalogHealthSql(rows), {
		limit: 10,
		offset: 10
	});
	assert.equal(paged.pagination.total, 13);
	assert.equal(paged.records.length, 3);
	assert.equal(new Set(paged.records.map((record) => record.recordKey)).size, paged.records.length);
});

test("admin catalog editor unifies book repair while preserving Work and Edition saves", () => {
	const editor = readFileSync("src/pages/admin/books/[workId].astro", "utf8");
	const lib = readFileSync("src/lib/adminCatalog.ts", "utf8");

	assert.match(editor, /resolveAdminSession/);
	assert.match(editor, /if \(!admin\.isAdmin\) return Astro\.redirect\("\/"\)/);
	assert.match(editor, /Book Catalog Editor/);
	assert.match(editor, /Publication-specific information/);
	assert.match(editor, /Editions/);
	assert.match(editor, /\+ Add Edition/);
	assert.match(editor, /Preferred Edition/);
	assert.match(editor, /name="preferredEditionId"/);
	assert.match(editor, /name="editionMode"/);
	assert.match(editor, /data-series-search/);
	assert.match(editor, /data-series-results/);
	assert.match(editor, /data-series-option/);
	assert.match(editor, /class="series-clear-button"/);
	assert.match(editor, /aria-label="Remove Series"/);
	assert.match(editor, /\.series-results\[hidden\]/);
	assert.match(editor, /series-position-field/);
	assert.match(editor, /Enter the book's number in the Series, e\.g\. 2/);
	assert.match(editor, /DogEared derives totals like Book 2 of 3/);
	assert.match(editor, /type="number" min="1" step="1" inputmode="numeric" value=\{editor\.work\.seriesPosition\}/);
	assert.doesNotMatch(editor, /series-selected/);
	assert.doesNotMatch(editor, /series-remove-button/);
	assert.doesNotMatch(editor, />Remove Series<\/button>/);
	assert.doesNotMatch(editor, /list="series-options"/);
	assert.match(editor, /data-cover-file/);
	assert.match(editor, /data-cover-upload-trigger/);
	assert.match(editor, /data-cover-layer-note/);
	assert.match(editor, /Remove Edition cover/);
	assert.match(editor, /Edition cover URL/);
	assert.match(editor, /Work fallback cover URL/);
	assert.match(editor, /Edition cover · Admin upload/);
	assert.match(editor, /Work fallback cover ·/);
	assert.match(editor, /Use image URL instead/);
	assert.match(editor, /Creates or replaces the selected Edition's cover/);
	assert.match(editor, /catalog-save-bar/);
	assert.match(editor, /data-discard-changes/);
	assert.match(editor, /Impact Preview/);
	assert.match(editor, /Audit History/);
	assert.match(editor, /name="duration"/);
	assert.match(editor, /name="locationCount"/);
	assert.match(editor, /name="chapterCount"/);
	assert.match(editor, /saveCatalogEditorData/);
	assert.match(editor, /type="hidden" name="editionId"/);

	assert.match(lib, /manualOverrides/);
	assert.match(lib, /source = "Manual"/);
	assert.match(lib, /manuallyCurated/);
	assert.match(lib, /Admin upload/);
	assert.match(lib, /resolveCatalogEditorSeriesId/);
	assert.match(lib, /normalizeText\(formData\.get\("seriesCreateName"\), 160\)/);
	assert.match(lib, /Series position must be a positive whole number/);
	assert.match(lib, /normalizePositiveWholeText\(formData\.get\("seriesPosition"\)\)/);
	assert.match(lib, /admin_catalog_audit_event/);
	assert.match(lib, /Audiobook duration must be a positive duration/);
	assert.match(lib, /ISBN-10 must contain 10 ISBN characters/);
	assert.match(lib, /Publication date must be a valid date/);
	assert.match(lib, /sql\.transaction/);
	assert.match(lib, /durationSeconds: nextEdition\.durationSeconds/);
	assert.match(lib, /update book_work/);
	assert.match(lib, /update book_edition/);
	assert.match(lib, /insert into book_edition/);
	assert.match(lib, /delete from book_edition/);
	assert.match(lib, /referenceCount/);
	assert.match(lib, /preferredEditionId/);
});

test("admin catalog editor surfaces Data Health issues next to relevant fields", () => {
	const editor = readFileSync("src/pages/admin/books/[workId].astro", "utf8");

	assert.match(editor, /Data Health Summary/);
	assert.match(editor, /data-health-summary/);
	assert.match(editor, /data-health-summary-link/);
	assert.match(editor, /data-target-field/);
	assert.match(editor, /fieldHealthByField/);
	assert.match(editor, /has-health-issue/);
	assert.match(editor, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(editor, /min-width: 0/);
	assert.match(editor, /box-sizing: border-box/);
	assert.doesNotMatch(editor, /border: 1px solid transparent/);
	assert.match(editor, /field-warning/);
	assert.match(editor, /why-note/);
	assert.match(editor, /Shared book title, without Series numbering when possible/);
	assert.match(editor, /Year the book was first published, regardless of this Edition/);
	assert.match(editor, /Publisher of this specific Edition/);
	assert.match(editor, /Publication date of this specific Edition/);
	assert.match(editor, /Choose language/);
	assert.match(editor, /Total number of pages in this Edition/);
	assert.match(editor, /Total running time of this audiobook Edition/);
	assert.match(editor, /Total ebook locations/);
	assert.match(editor, /10-digit identifier for this Edition/);
	assert.match(editor, /Open Library identifier for the shared book/);
	assert.match(editor, /warning-icon/);
	assert.match(editor, /scrollIntoView/);
	assert.match(editor, /refreshHealthState/);
	assert.match(editor, /isFieldValidNow/);
	assert.match(editor, /All visible Data Health issues look corrected/);
	for (const group of [
		"Book",
		"Series",
		"Edition & Format",
		"Cover",
		"Progress Metadata",
		"Advanced metadata"
	]) {
		assert.match(editor, new RegExp(group));
	}
	assert.match(editor, /Required for audiobook and percentage progress/);
	assert.match(editor, /The title suggests this book belongs to a Series/);
	assert.match(editor, /cover-preview/);
	assert.match(editor, /Upload new cover/);
	assert.match(editor, /Choose a JPEG, PNG, or WebP image/);
	assert.match(editor, /Cover ready\. Save catalog data to persist/);
	assert.match(editor, /Could not upload this image\. Try again/);
});

test("Book Detail exposes catalog repair shortcut only through admin session", () => {
	const book = readFileSync("src/pages/book.astro", "utf8");

	assert.match(book, /resolveAdminSession/);
	assert.match(book, /countCatalogHealthIssuesForWork/);
	assert.match(book, /bookDetailAdminSession\.isAdmin/);
	assert.match(book, /admin-catalog-shortcut/);
	assert.match(book, /Edit catalog data/);
	assert.match(book, /View Data Health/);
	assert.match(book, /metadata issue/);
});

test("Product Bible documents catalog ownership, provenance, and audit rules", () => {
	const features = readFileSync("docs/product/features.md", "utf8");
	const overview = readFileSync("docs/product/overview.md", "utf8");
	const database = readFileSync("docs/engineering/database.md", "utf8");
	const admin = readFileSync("docs/engineering/admin.md", "utf8");

	for (const source of [features, overview, database, admin]) {
		assert.match(source, /audiobook duration/i);
		assert.match(source, /audit/i);
	}
	assert.match(features, /Work edits still cover/);
	assert.match(features, /Edition edits still cover/);
	assert.match(overview, /preserve reader-owned shelves/);
	assert.match(database, /durationSeconds/);
	assert.match(admin, /\/admin\/books\/\[workId\]/);
});
