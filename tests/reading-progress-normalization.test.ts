import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProgressInputMode, normalizeProgressUpdateInput } from "../src/lib/readingProgress.ts";

test("page progress updates keep canonical current page", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "154",
		totalPages: 597,
		progressType: "page"
	});
	assert.equal(result.valid, true);
	assert.equal(result.currentPage, 154);
	assert.equal(result.mode, "page");
	assert.equal(Math.round(result.percent), Math.round((154 / 597) * 100));
});

test("percentage progress updates normalize into canonical current page", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "31",
		totalPages: 597,
		progressType: "percent"
	});
	assert.equal(result.valid, true);
	assert.equal(result.currentPage, 185);
	assert.equal(result.mode, "percent");
	assert.equal(result.normalizedText, "31%");
});

test("percentage updates require total pages to avoid saving zero progress", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "31",
		totalPages: 0,
		progressType: "percent"
	});
	assert.equal(result.valid, false);
	assert.equal(result.currentPage, 0);
});

test("chapter, location, and audio inputs still normalize through the same canonical page field", () => {
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "Chapter 4",
		totalPages: 400,
		progressType: "chapter"
	}).currentPage, 4);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "Location 1234",
		totalPages: 400,
		progressType: "location"
	}).currentPage, 400);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "1h 20m",
		totalPages: 400,
		progressType: "audio"
	}).currentPage, 120);
});

test("profile progress updater uses shared canonical progress normalization", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes('import { normalizeProgressUpdateInput } from "../../lib/readingProgress.ts";'), true);
	assert.equal(source.includes("const parsed = normalizeProgressUpdateInput({"), true);
	assert.equal(source.includes("function parseProgressInput("), false);
});

test("progress input mode normalization uses the supported persisted enum", () => {
	for (const mode of ["page", "percent", "chapter", "location", "audio"] as const) {
		assert.equal(normalizeProgressInputMode(mode), mode);
	}
	assert.equal(normalizeProgressInputMode("pages"), "page");
	assert.equal(normalizeProgressInputMode(""), "page");
});

test("progress type is persisted through the shared shelf entry lifecycle", () => {
	const api = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const summary = readFileSync("src/lib/readingSummary.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const shelfClient = readFileSync("src/lib/shelfClient.ts", "utf8");
	const workNormalization = readFileSync("src/lib/workNormalization.ts", "utf8");

	assert.match(api, /alter table user_book add column if not exists preferred_progress_type text not null default 'page'/);
	assert.match(api, /preferredProgressType\?: unknown/);
	assert.match(api, /preferred_progress_type,\s+finished_date/);
	assert.match(api, /when \$\{preferredProgressType\}::text <> '' then \$\{preferredProgressType\}::text\s+else user_book\.preferred_progress_type/);
	assert.match(api, /preferredProgressType: normalizeProgressInputMode\((persisted\.preferred_progress_type|preferredProgressType \|\| "page")\)/);
	assert.match(api, /preferredProgressType: normalizeProgressInputMode\(row\.preferred_progress_type\)/);

	assert.match(summary, /ub\.preferred_progress_type/);
	assert.match(summary, /preferredProgressType: normalizeProgressInputMode\(row\.preferred_progress_type\)/);
	assert.match(profile, /data-preferred-progress-type/);
	assert.match(profile, /preferredProgressType: progressType/);
	assert.match(profile, /selected=\{\(item\.preferredProgressType \|\| "page"\) === "page"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "percent"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "chapter"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "location"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "audio"\}/);

	assert.match(shelfClient, /preferredProgressType\?: string/);
	assert.match(shelfClient, /preferredProgressType: String\(options\.preferredProgressType/);
	assert.match(workNormalization, /preferred_progress_type/);
});
