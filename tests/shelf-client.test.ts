import test from "node:test";
import assert from "node:assert/strict";
import {
	buildShelfEntryFromRecord,
	normalizeRatingValue,
	parseCategories,
	resolveShelfSaveMessage,
	removeBookFromAllShelvesOnServer,
	saveShelfEntryWithRetry,
	syncShelfRatingToServer,
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

test("normalizeRatingValue keeps valid star ratings and clears invalid values", () => {
	assert.equal(normalizeRatingValue(1), 1);
	assert.equal(normalizeRatingValue("5"), 5);
	assert.equal(normalizeRatingValue("3.8"), 3);
	assert.equal(normalizeRatingValue(0), null);
	assert.equal(normalizeRatingValue(6), null);
	assert.equal(normalizeRatingValue(""), null);
	assert.equal(normalizeRatingValue(null), null);
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

test("syncShelfRatingToServer reports unauthorized and sets redirect", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url, init) => {
		assert.equal(_url, "/api/shelf/rating");
		assert.equal((init as RequestInit).method, "PATCH");
		return new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = {
		location: { href: "http://localhost/" }
	};

	try {
		const result = await syncShelfRatingToServer({ bookId: 123, rating: 5 });
		assert.equal(result.ok, false);
		assert.equal(result.unauthorized, true);
		const href = ((globalThis as Record<string, unknown>).window as { location: { href: string } }).location.href;
		assert.equal(href, "/settings#account-settings");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});

test("removeBookFromAllShelvesOnServer sends book id + entry and handles unauthorized", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url, init) => {
		assert.equal(_url, "/api/shelf/entries");
		assert.equal((init as RequestInit).method, "DELETE");
		assert.match(String((init as RequestInit).body || ""), /"bookId":123/);
		assert.match(String((init as RequestInit).body || ""), /"title":"Book"/);
		return new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } });
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = {
		location: { href: "http://localhost/" }
	};

	try {
		const result = await removeBookFromAllShelvesOnServer(123, { title: "Book" });
		assert.equal(result.ok, false);
		assert.equal(result.unauthorized, true);
		const href = ((globalThis as Record<string, unknown>).window as { location: { href: string } }).location.href;
		assert.equal(href, "/settings#account-settings");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});

test("resolveShelfSaveMessage maps status codes and network failures", () => {
	assert.equal(resolveShelfSaveMessage({ ok: false, unauthorized: true }), "Please log in to save books.");
	assert.equal(resolveShelfSaveMessage({
		ok: false,
		response: new Response("{}", { status: 400 })
	}), "Invalid book data. Please try again.");
	assert.equal(resolveShelfSaveMessage({
		ok: false,
		response: new Response("{}", { status: 409 })
	}), "Conflict while saving. Please retry.");
	assert.equal(resolveShelfSaveMessage({
		ok: false,
		response: new Response("{}", { status: 500 })
	}), "Server error while saving. Please retry.");
	assert.equal(resolveShelfSaveMessage({
		ok: false,
		error: new Error("network")
	}), "Network error while saving. Please retry.");
	assert.equal(resolveShelfSaveMessage({
		ok: false,
		data: { error: "custom message" }
	}), "custom message");
});

test("saveShelfEntryWithRetry retries transient server failures and succeeds", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	let attempts = 0;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => {
		attempts += 1;
		if (attempts === 1) {
			return new Response(JSON.stringify({ error: "retry me" }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			});
		}
		return new Response(JSON.stringify({ ok: true, entry: { id: "entry_1" } }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "" } };

	try {
		const result = await saveShelfEntryWithRetry({ title: "Retry Book" }, { retries: 1, retryDelayMs: 0 });
		assert.equal(result.ok, true);
		assert.equal(attempts, 2);
		assert.equal(result.message, "");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});

test("saveShelfEntryWithRetry does not retry unauthorized responses", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	let attempts = 0;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => {
		attempts += 1;
		return new Response("{}", {
			status: 401,
			headers: { "Content-Type": "application/json" }
		});
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "http://localhost/" } };

	try {
		const result = await saveShelfEntryWithRetry({ title: "Auth Book" }, {
			retries: 3,
			retryDelayMs: 0,
			redirectPath: "/settings#account-settings"
		});
		assert.equal(result.ok, false);
		assert.equal(result.unauthorized, true);
		assert.equal(attempts, 1);
		assert.equal(result.message, "Please log in to save books.");
		const href = ((globalThis as Record<string, unknown>).window as { location: { href: string } }).location.href;
		assert.equal(href, "/settings#account-settings");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});

test("saveShelfEntryWithRetry does not silently retry by default", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	let attempts = 0;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => {
		attempts += 1;
		return new Response(JSON.stringify({ error: "broken" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "" } };

	try {
		const result = await saveShelfEntryWithRetry({ title: "Broken Book" });
		assert.equal(result.ok, false);
		assert.equal(attempts, 1);
		assert.equal(result.message, "broken");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});
