import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	buildPotentialDuplicateWorkGroups,
	scorePotentialDuplicateBooks,
	type WorkNormalizationBook
} from "../src/lib/workNormalization.ts";
import { buildCanonicalWorkBackfillPlan } from "../src/lib/catalogWorks.ts";

function book(overrides: Partial<WorkNormalizationBook>): WorkNormalizationBook {
	return {
		bookId: 1,
		workId: 1,
		title: "The Poison Jungle",
		normalizedTitle: "The Poison Jungle",
		author: "Tui T. Sutherland",
		canonicalWorkKey: "title_author:poison jungle|tui t sutherland",
		workKey: "title_author:poison jungle|tui t sutherland",
		seriesName: "Wings of Fire",
		seriesBookOrder: 13,
		isbn10: "",
		isbn13: "",
		googleBooksId: "",
		sourceKeys: [],
		editionKeys: [],
		shelfCount: 0,
		ratingCount: 0,
		reviewCount: 0,
		activityCount: 0,
		hasCover: true,
		hasDescription: true,
		hasRedundantSeriesSuffix: false,
		hasRedundantEditionSuffix: false,
		...overrides
	};
}

test("duplicate Work scoring combines canonical title, series, and identifier evidence", () => {
	const result = scorePotentialDuplicateBooks([
		book({ bookId: 26, workId: 26, isbn13: "9781338214512", sourceKeys: ["google_books:abc"] }),
		book({
			bookId: 104,
			workId: 104,
			title: "The Poison Jungle (Wings of Fire, #13)",
			normalizedTitle: "The Poison Jungle",
			isbn13: "9781338214512",
			sourceKeys: ["google_books:abc"],
			hasRedundantSeriesSuffix: true
		})
	]);

	assert.equal(result.score, 100);
	assert.equal(result.reasons.some((reason) => reason.includes("structured series")), true);
	assert.equal(result.reasons.some((reason) => reason.includes("Shared ISBN")), true);
	assert.equal(result.reasons.some((reason) => reason.includes("redundant series")), true);
});

test("potential duplicate Work groups choose the richer reader-facing representative", () => {
	const groups = buildPotentialDuplicateWorkGroups([
		book({ bookId: 26, workId: 26, shelfCount: 0, ratingCount: 0 }),
		book({
			bookId: 104,
			workId: 104,
			title: "The Poison Jungle (Wings of Fire, #13)",
			normalizedTitle: "The Poison Jungle",
			shelfCount: 3,
			ratingCount: 1,
			hasRedundantSeriesSuffix: true
		})
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0]?.target.bookId, 104);
	assert.equal(groups[0]?.duplicates[0]?.bookId, 26);
	assert.equal(groups[0]?.groupKey, "title_author:poison jungle|tui t sutherland");
});

test("potential duplicate Work groups honor ignored admin review pairs", () => {
	const ignored = new Set(["title_author:poison jungle|tui t sutherland:104:26"]);
	const groups = buildPotentialDuplicateWorkGroups([
		book({ bookId: 26, workId: 26 }),
		book({
			bookId: 104,
			workId: 104,
			title: "The Poison Jungle (Wings of Fire, #13)",
			normalizedTitle: "The Poison Jungle",
			shelfCount: 3,
			hasRedundantSeriesSuffix: true
		})
	], ignored);

	assert.equal(groups.length, 0);
});

test("potential duplicate Work groups collapse known edition suffixes", () => {
	const groups = buildPotentialDuplicateWorkGroups([
		book({
			bookId: 201,
			workId: 201,
			title: "Project Hail Mary",
			normalizedTitle: "Project Hail Mary",
			author: "Andy Weir",
			seriesName: "",
			seriesBookOrder: 0,
			isbn13: "9780593135204"
		}),
		book({
			bookId: 202,
			workId: 202,
			title: "Project Hail Mary (Hardcover)",
			normalizedTitle: "Project Hail Mary",
			author: "Andy Weir",
			seriesName: "",
			seriesBookOrder: 0,
			isbn13: "9780593135204",
			hasRedundantEditionSuffix: true
		})
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0]?.groupKey, "title_author:project hail mary|andy weir");
	assert.equal(groups[0]?.confidenceScore, 100);
	assert.equal(groups[0]?.reasons.some((reason) => reason.includes("edition metadata")), true);
});

test("canonical Work backfill plans use cleaned titles and preserve editions", () => {
	const plans = buildCanonicalWorkBackfillPlan([
		{
			id: 26,
			title: "The Poison Jungle",
			primary_author: "Tui T. Sutherland",
			author_id: null,
			synopsis: "",
			cover_url: "",
			published_year: 2019,
			page_count: 336,
			language: "en",
			isbn10: "",
			isbn13: "9781338214536",
			google_books_id: "",
			publisher: "",
			series_id: 1,
			series_name: "Wings of Fire",
			book_order: 13,
			shelf_count: 0,
			rating_count: 0
		},
		{
			id: 104,
			title: "The Poison Jungle (Wings of Fire, #13)",
			primary_author: "Tui T. Sutherland",
			author_id: null,
			synopsis: "",
			cover_url: "cover.jpg",
			published_year: 2019,
			page_count: 336,
			language: "en",
			isbn10: "",
			isbn13: "9781338214536",
			google_books_id: "",
			publisher: "",
			series_id: 1,
			series_name: "Wings of Fire",
			book_order: 13,
			shelf_count: 1,
			rating_count: 1
		},
		{
			id: 202,
			title: "Project Hail Mary (Hardcover)",
			primary_author: "Andy Weir",
			author_id: null,
			synopsis: "",
			cover_url: "",
			published_year: 2021,
			page_count: 496,
			language: "en",
			isbn10: "",
			isbn13: "9780593135204",
			google_books_id: "",
			publisher: "",
			series_id: null,
			series_name: "",
			book_order: null,
			shelf_count: 0,
			rating_count: 0
		}
	]);

	const poison = plans.find((plan) => plan.workKey === "title_author:poison jungle|tui t sutherland");
	const projectHailMary = plans.find((plan) => plan.workKey === "title_author:project hail mary|andy weir");
	assert.equal(poison?.canonicalTitle, "The Poison Jungle");
	assert.equal(poison?.books.length, 2);
	assert.equal(poison?.representative.id, 104);
	assert.equal(projectHailMary?.canonicalTitle, "Project Hail Mary");
});

test("Data Health exposes potential duplicate Work review and merge actions", () => {
	const page = readFileSync("src/pages/admin/data-health.astro", "utf8");
	const normalization = readFileSync("src/lib/workNormalization.ts", "utf8");
	const catalogWorks = readFileSync("src/lib/catalogWorks.ts", "utf8");

	assert.equal(page.includes("Potential Duplicate Works"), true);
	assert.equal(page.includes("merge-duplicate-work"), true);
	assert.equal(page.includes("ignore-duplicate-work"), true);
	assert.equal(page.includes("loadPotentialDuplicateWorks"), true);
	assert.equal(page.includes("mergeCatalogWorks"), true);
	for (const table of [
		"user_book",
		"user_activity",
		"user_reading_progress_event",
		"reading_journal_entry",
		"reading_journal_note",
		"user_custom_shelf_book",
		"series_book",
		"collection_book",
		"user_recommendation_feedback",
		"book_edition",
		"book_source"
	]) {
		assert.equal(normalization.includes(table), true);
	}
	assert.equal(catalogWorks.includes("buildCanonicalWorkBackfillPlan"), true);
	assert.equal(catalogWorks.includes("sql.unsafe"), false);
});
