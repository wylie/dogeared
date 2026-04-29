import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBookPayload, fromShelfEntryInput } from "../src/lib/bookPayload.ts";

test("normalizeBookPayload normalizes core fields", () => {
	const payload = normalizeBookPayload({
		title: "  Project Hail Mary ",
		author: " Andy Weir ",
		description: "  sci-fi  ",
		pageCount: "497",
		coverUrl: " https://example.com/cover.jpg ",
		categories: [" Sci-Fi ", "", "Space"],
		format: " Hardcover ",
		language: " en ",
		publisher: " Ballantine ",
		publishedDate: " 2021-05-04 ",
		isbn10: " 0-593-13520-2 ",
		isbn13: " 978-0-593-13520-4 ",
		googleBooksId: " abc123 "
	});

	assert.equal(payload.title, "Project Hail Mary");
	assert.equal(payload.author, "Andy Weir");
	assert.equal(payload.pageCount, 497);
	assert.deepEqual(payload.categories, ["Sci-Fi", "Space"]);
	assert.equal(payload.isbn10, "0593135202");
	assert.equal(payload.isbn13, "9780593135204");
});

test("fromShelfEntryInput maps totalPages to pageCount and normalizes", () => {
	const payload = fromShelfEntryInput({
		title: "A",
		author: "B",
		totalPages: "120",
		description: "desc",
		categories: ["Fantasy"]
	});

	assert.equal(payload.pageCount, 120);
	assert.equal(payload.title, "A");
	assert.equal(payload.author, "B");
	assert.deepEqual(payload.categories, ["Fantasy"]);
});
