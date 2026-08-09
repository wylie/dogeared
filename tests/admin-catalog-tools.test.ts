import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDuration, isAudiobookFormat, parseDurationToSeconds } from "../src/lib/adminCatalog.ts";

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

	assert.match(page, /Catalog Metadata/);
	assert.match(page, /loadCatalogMetadataHealth/);
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
	assert.match(page, /\/admin\/books\/\$\{issue\.workId\}/);

	for (const issueType of [
		"missing_page_count",
		"missing_audiobook_duration",
		"missing_reading_format_metadata",
		"missing_series_position",
		"progress_not_normalizable",
		"potential_duplicate_work",
		"potential_duplicate_edition"
	]) {
		assert.match(lib, new RegExp(issueType));
	}
	assert.match(lib, /isAudiobookFormat\(row\.format\)/);
	assert.match(lib, /durationSeconds/);
	assert.match(migration, /admin_catalog_audit_event/);
	assert.match(migration, /idx_book_edition_metadata_gin/);
});

test("admin catalog editor separates Work and Edition metadata and records audit history", () => {
	const editor = readFileSync("src/pages/admin/books/[workId].astro", "utf8");
	const lib = readFileSync("src/lib/adminCatalog.ts", "utf8");

	assert.match(editor, /resolveAdminSession/);
	assert.match(editor, /if \(!admin\.isAdmin\) return Astro\.redirect\("\/"\)/);
	assert.match(editor, /Work Metadata/);
	assert.match(editor, /Edition Metadata/);
	assert.match(editor, /Impact Preview/);
	assert.match(editor, /Audit History/);
	assert.match(editor, /name="duration"/);
	assert.match(editor, /name="locationCount"/);
	assert.match(editor, /name="chapterCount"/);
	assert.match(editor, /saveCatalogEditorData/);
	assert.match(editor, /type="hidden" name="editionId"/);

	assert.match(lib, /manualOverrides/);
	assert.match(lib, /source: "Manual"/);
	assert.match(lib, /admin_catalog_audit_event/);
	assert.match(lib, /Audiobook duration must be a positive duration/);
	assert.match(lib, /ISBN-10 must contain 10 ISBN characters/);
	assert.match(lib, /Publication date must be a valid date/);
	assert.match(lib, /sql\.transaction/);
	assert.match(lib, /durationSeconds: nextEdition\.durationSeconds/);
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
	assert.match(editor, /warning-icon/);
	assert.match(editor, /scrollIntoView/);
	assert.match(editor, /refreshHealthState/);
	assert.match(editor, /All visible Data Health issues look corrected/);
	for (const group of [
		"Work Identity",
		"Series",
		"Classification",
		"Description",
		"Cover",
		"Edition Identity",
		"Publication",
		"Progress Metadata",
		"External Identifiers"
	]) {
		assert.match(editor, new RegExp(group));
	}
	assert.match(editor, /Percentage tracking, Reading Activity, Daily Reading Volume/);
	assert.match(editor, /Series pages, reading order, Previous\/Next navigation/);
	assert.match(editor, /cover-preview/);
	assert.match(editor, /Replace cover URL/);
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
	assert.match(features, /Work edits cover/);
	assert.match(features, /Edition edits cover/);
	assert.match(overview, /preserve reader-owned shelves/);
	assert.match(database, /durationSeconds/);
	assert.match(admin, /\/admin\/books\/\[workId\]/);
});
