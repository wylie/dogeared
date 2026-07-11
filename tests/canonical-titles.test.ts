import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRedundantSeriesTitle } from "../src/lib/canonicalTitles.ts";
import { loadCanonicalTitleCleanupCandidates, normalizeCanonicalSeriesTitles } from "../src/lib/canonicalTitleCleanup.ts";

test("canonical title cleanup removes matching structured series suffixes", () => {
	const cases = [
		["The Brightest Night (Wings of Fire, #5)", "Wings of Fire", 5, "The Brightest Night"],
		["The Fellowship of the Ring (The Lord of the Rings, #1)", "The Lord of the Rings", 1, "The Fellowship of the Ring"],
		["Harry Potter and the Chamber of Secrets (Harry Potter, #2)", "Harry Potter", 2, "Harry Potter and the Chamber of Secrets"],
		["Catching Fire (The Hunger Games, #2)", "The Hunger Games", 2, "Catching Fire"],
		["The Hidden Kingdom (Book 3)", "Wings of Fire", 3, "The Hidden Kingdom"]
	] as const;

	for (const [title, seriesName, bookOrder, expected] of cases) {
		const result = normalizeRedundantSeriesTitle({ title, seriesName, bookOrder });
		assert.equal(result.changed, true);
		assert.equal(result.title, expected);
	}
});

test("canonical title cleanup preserves unmatched and legitimate parentheticals", () => {
	const cases = [
		["A Brief History of Time (Updated Edition)", "Science Classics", 1],
		["The Brightest Night (Wings of Fire, #5)", "Wings of Fire", 4],
		["The Brightest Night (Other Series, #5)", "Wings of Fire", 5],
		["The Dark Secret (Graphic Novel)", "Wings of Fire", 4],
		["Normal People", "Standalone", 1]
	] as const;

	for (const [title, seriesName, bookOrder] of cases) {
		const result = normalizeRedundantSeriesTitle({ title, seriesName, bookOrder });
		assert.equal(result.changed, false);
		assert.equal(result.title, title);
	}
});

test("canonical title cleanup candidates use structured series metadata", async () => {
	const calls: string[] = [];
	const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
		const query = strings.join("");
		calls.push(query);
		if (query.includes("select distinct on (b.id)")) {
			return [
				{
					book_id: 10,
					work_id: 20,
					title: "The Brightest Night (Wings of Fire, #5)",
					primary_author: "Tui T. Sutherland",
					series_name: "Wings of Fire",
					book_order: 5,
					updated_at: "2026-07-11T00:00:00.000Z"
				},
				{
					book_id: 11,
					work_id: 21,
					title: "The Dark Secret (Graphic Novel)",
					primary_author: "Tui T. Sutherland",
					series_name: "Wings of Fire",
					book_order: 4,
					updated_at: "2026-07-11T00:00:00.000Z"
				}
			];
		}
		assert.ok(values.length >= 0);
		return [];
	}) as never;

	const candidates = await loadCanonicalTitleCleanupCandidates(sql, 50);
	assert.equal(candidates.length, 1);
	assert.equal(candidates[0]?.title, "The Brightest Night (Wings of Fire, #5)");
	assert.equal(candidates[0]?.normalizedTitle, "The Brightest Night");
	assert.equal(calls.some((query) => query.includes("join series_book sb")), true);
});

test("canonical title cleanup updates book and matching canonical Work titles", async () => {
	const calls: string[] = [];
	const sql = (async (strings: TemplateStringsArray) => {
		const query = strings.join("");
		calls.push(query);
		if (query.includes("select distinct on (b.id)")) {
			return [
				{
					book_id: 10,
					work_id: 20,
					title: "Catching Fire (The Hunger Games, #2)",
					primary_author: "Suzanne Collins",
					series_name: "The Hunger Games",
					book_order: 2,
					updated_at: "2026-07-11T00:00:00.000Z"
				}
			];
		}
		if (query.includes("update book")) return [{ id: 10 }];
		return [];
	}) as never;

	const result = await normalizeCanonicalSeriesTitles(sql, 50);
	assert.equal(result.checked, 1);
	assert.equal(result.updated, 1);
	assert.equal(calls.some((query) => query.includes("update book_work")), true);
});
