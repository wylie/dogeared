import test from "node:test";
import assert from "node:assert/strict";
import { buildShelfEntryFromRecord, syncShelfEntryToServer } from "../src/lib/shelfClient.ts";

test("smoke: can build shelf entry from index-like record", () => {
	const entry = buildShelfEntryFromRecord({
		title: "The Fellowship of the Ring",
		author: "J.R.R. Tolkien",
		description: "Fantasy",
		pageCount: 407,
		coverUrl: "https://example.com/cover.jpg",
		isbn13: "978-0-547-92821-0",
		source: "open_library"
	}, {
		status: "want_to_read",
		totalPages: 407
	});

	assert.equal(entry.title, "The Fellowship of the Ring");
	assert.equal(entry.status, "want_to_read");
	assert.equal(entry.totalPages, 407);
	assert.equal(entry.isbn13, "9780547928210");
});

test("smoke: can build shelf entry from book-page record", () => {
	const entry = buildShelfEntryFromRecord({
		title: "Project Hail Mary",
		author: "Andy Weir",
		description: "Sci-fi",
		pageCount: 497,
		isbn13: "9780593135204",
		googleBooksId: "abc123"
	}, {
		status: "reading",
		currentPage: 1
	});

	assert.equal(entry.status, "reading");
	assert.equal(entry.currentPage, 1);
	assert.equal(entry.googleBooksId, "abc123");
});

test("smoke: logged-out redirect path on unauthorized shelf sync", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
		new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } })) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "" } };

	try {
		const result = await syncShelfEntryToServer({ title: "Book" }, "/settings#account-settings");
		assert.equal(result.unauthorized, true);
		assert.equal(((globalThis as Record<string, unknown>).window as { location: { href: string } }).location.href, "/settings#account-settings");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});
