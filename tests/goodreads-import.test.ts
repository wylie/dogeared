import test from "node:test";
import assert from "node:assert/strict";
import {
	buildGoodreadsImportPlan,
	canonicalWorkKey,
	dedupeGoodreadsCandidates,
	parseGoodreadsImportCsv,
	summarizeGoodreadsImportPlan,
	type GoodreadsImportEntry
} from "../src/lib/goodreadsImport.ts";

const header = [
	"Title",
	"Author",
	"Exclusive Shelf",
	"Number of Pages",
	"Date Read",
	"Bookshelves",
	"Binding",
	"Publisher",
	"Year Published",
	"ISBN",
	"ISBN13"
].join(",");

function row(values: string[]) {
	return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
}

function entry(overrides: Partial<GoodreadsImportEntry>): GoodreadsImportEntry {
	return {
		id: "book_test",
		title: "Test Book",
		author: "Test Author",
		totalPages: 100,
		currentPage: 0,
		status: "want_to_read",
		finishedDate: "",
		coverUrl: "",
		format: "",
		language: "",
		publisher: "",
		publishedDate: "",
		isbn10: "",
		isbn13: "",
		categories: [],
		updatedAt: 1,
		...overrides
	};
}

test("parseGoodreadsImportCsv maps Goodreads rows and counts skipped title rows", () => {
	const csv = [
		header,
		row(["The Book", "A. Writer", "read", "321", "2024/05/01", "fantasy, owned", "Paperback", "Press", "2020", "0-123", "9780000000001"]),
		row(["", "No Title", "to-read", "", "", "", "", "", "", "", ""])
	].join("\n");

	const result = parseGoodreadsImportCsv(csv);

	assert.equal(result.totalRows, 2);
	assert.equal(result.skippedRows, 1);
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].status, "finished");
	assert.equal(result.candidates[0].currentPage, 321);
	assert.equal(result.candidates[0].finishedDate, "2024-05-01");
	assert.deepEqual(result.candidates[0].categories, ["fantasy"]);
	assert.equal(result.candidates[0].isbn13, "9780000000001");
});

test("dedupeGoodreadsCandidates collapses same-work rows and keeps the most complete status", () => {
	const candidates = [
		entry({ title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", status: "want_to_read", isbn13: "9780441478125" }),
		entry({ title: "Left Hand of Darkness", author: "Ursula Le Guin", status: "finished", totalPages: 304, isbn13: "9780441478125", finishedDate: "2024-01-02" })
	];

	const result = dedupeGoodreadsCandidates(candidates);

	assert.equal(result.duplicateRows, 1);
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].status, "finished");
	assert.equal(result.candidates[0].currentPage, 304);
	assert.equal(result.candidates[0].finishedDate, "2024-01-02");
});

test("buildGoodreadsImportPlan is idempotent against existing shelf entries", () => {
	const existing = entry({
		id: "book_existing",
		title: "Project Hail Mary",
		author: "Andy Weir",
		status: "reading",
		isbn13: "9780593135204",
		currentPage: 12
	});
	const parseResult = {
		totalRows: 2,
		skippedRows: 0,
		candidates: [
			entry({ title: "Project Hail Mary", author: "Andy Weir", status: "finished", isbn13: "9780593135204", totalPages: 497, finishedDate: "2024-03-01" }),
			entry({ title: "New Import", author: "New Author", status: "want_to_read", isbn13: "9780000000002" })
		]
	};

	const plan = buildGoodreadsImportPlan(parseResult, [existing], "merge");
	const summary = summarizeGoodreadsImportPlan(plan);

	assert.equal(plan.imported, 1);
	assert.equal(plan.updated, 1);
	assert.equal(plan.changedEntries.length, 2);
	assert.equal(plan.statusChanges.length, 2);
	assert.equal(summary.finished, 1);
	assert.equal(summary.wantToRead, 1);
	assert.equal(plan.nextEntries.length, 2);
	assert.equal(canonicalWorkKey(plan.nextEntries.find((item) => item.title === "Project Hail Mary") || {}), "isbn13:9780593135204");
});

test("buildGoodreadsImportPlan replace mode ignores existing shelf entries", () => {
	const parseResult = {
		totalRows: 1,
		skippedRows: 0,
		candidates: [
			entry({ title: "Replacement", author: "Reader", status: "reading", isbn13: "9780000000003" })
		]
	};

	const plan = buildGoodreadsImportPlan(parseResult, [
		entry({ title: "Old Book", author: "Old Author", isbn13: "9780000000004" })
	], "replace");

	assert.equal(plan.imported, 1);
	assert.equal(plan.updated, 0);
	assert.equal(plan.nextEntries.length, 1);
	assert.equal(plan.nextEntries[0].title, "Replacement");
});
