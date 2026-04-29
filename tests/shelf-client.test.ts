import test from "node:test";
import assert from "node:assert/strict";
import {
	buildShelfEntryFromRecord,
	parseCategories,
	statusLabel,
	syncShelfEntryToServer
} from "../src/lib/shelfClient.ts";

test("statusLabel maps known values and defaults", () => {
	assert.equal(statusLabel("want_to_read"), "Want to Read");
	assert.equal(statusLabel("reading"), "Currently Reading");
	assert.equal(statusLabel("finished"), "Read");
	assert.equal(statusLabel("other"), "Want to Read");
});

test("parseCategories parses JSON category arrays safely", () => {
	assert.deepEqual(parseCategories('["Fantasy"," Sci-Fi "]'), ["Fantasy", "Sci-Fi"]);
	assert.deepEqual(parseCategories("not json"), []);
});

test("buildShelfEntryFromRecord returns normalized shelf entry", () => {
	const entry = buildShelfEntryFromRecord({
		title: " Test Book ",
		author: " Test Author ",
		pageCount: "200",
		isbn13: "978-0-00-000000-2"
	}, {
		status: "reading",
		currentPage: 15
	});

	assert.equal(entry.title, "Test Book");
	assert.equal(entry.author, "Test Author");
	assert.equal(entry.totalPages, 200);
	assert.equal(entry.currentPage, 15);
	assert.equal(entry.status, "reading");
	assert.equal(entry.isbn13, "9780000000002");
});

test("syncShelfEntryToServer reports unauthorized and sets redirect", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
		new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } })) as typeof fetch;
	(globalThis as Record<string, unknown>).window = {
		location: { href: "http://localhost/" }
	};

	try {
		const result = await syncShelfEntryToServer({ title: "X" }, "/settings#account-settings");
		assert.equal(result.ok, false);
		assert.equal(result.unauthorized, true);
		const href = ((globalThis as Record<string, unknown>).window as { location: { href: string } }).location.href;
		assert.equal(href, "/settings#account-settings");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});
