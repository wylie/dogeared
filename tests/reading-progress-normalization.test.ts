import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProgressUpdateInput } from "../src/lib/readingProgress.ts";

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
