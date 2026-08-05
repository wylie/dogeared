import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	buildShelfEntryFromRecord,
	normalizeRatingValue,
	parseCategories,
	resolveShelfSaveMessage,
	removeBookFromAllShelvesOnServer,
	removeShelfEntryWithRetry,
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

test("shelf menus use anchored viewport positioning and accessible menu semantics", () => {
	const clientSource = readFileSync(new URL("../src/lib/shelfClient.ts", import.meta.url), "utf8");
	const dropdownSource = readFileSync(new URL("../src/components/ShelfDropdown.astro", import.meta.url), "utf8");
	const cardSource = readFileSync(new URL("../src/components/BookCard.astro", import.meta.url), "utf8");

	assert.match(clientSource, /function positionShelfMenu/);
	assert.match(clientSource, /from "@floating-ui\/dom"/);
	assert.match(clientSource, /computePosition\(anchor, menu/);
	assert.match(clientSource, /placement: "bottom-start"/);
	assert.match(clientSource, /strategy: "fixed"/);
	assert.match(clientSource, /offset\(gap\)/);
	assert.match(clientSource, /flip\(/);
	assert.match(clientSource, /shift\(/);
	assert.match(clientSource, /autoUpdate\(activeShelfAnchor, activeShelfMenu/);
	assert.match(clientSource, /getBoundingClientRect\(\)/);
	assert.match(clientSource, /let activeShelfAnchor: HTMLElement \| null = null/);
	assert.match(clientSource, /let activeShelfMenu: HTMLElement \| null = null/);
	assert.match(clientSource, /document\.body\.append\(menu\)/);
	assert.match(clientSource, /resolveShelfDropdownFromTarget/);
	assert.match(clientSource, /isTriggerInViewport\(triggerRect, viewport\)/);
	assert.match(clientSource, /--shelf-safe-area-left/);
	assert.match(clientSource, /menu\.style\.minWidth = `\$\{Math\.min\(180, availableWidth\)\}px`/);
	assert.match(clientSource, /activeShelfAnchor = trigger/);
	assert.match(clientSource, /activeShelfMenu = menu/);
	assert.match(clientSource, /startShelfMenuTracking\(\)/);
	assert.match(clientSource, /stopShelfMenuTracking\(\)/);
	assert.match(clientSource, /positionShelfMenu\(trigger, menu\)/);
	assert.match(clientSource, /function repositionOpenShelfMenu/);
	assert.match(clientSource, /data-placement/);
	assert.match(clientSource, /restoreFocus/);
	assert.match(dropdownSource, /aria-haspopup="menu"/);
	assert.match(dropdownSource, /role="menu"/);
	assert.match(dropdownSource, /role="menuitem"/);
	assert.match(dropdownSource, /class="shelf-menu-caret"/);
	assert.match(dropdownSource, /--shelf-menu-viewport-padding: 8px/);
	assert.match(dropdownSource, /--shelf-safe-area-left: env\(safe-area-inset-left, 0px\)/);
	assert.match(dropdownSource, /position: fixed/);
	assert.doesNotMatch(cardSource, /\.shelf-dropdown \.shelf-menu\)[\s\S]*top: calc\(100% \+ 4px\)/);
});

test("shelf menus use the clicked ShelfButton as the Floating UI reference element", () => {
	const clientSource = readFileSync(new URL("../src/lib/shelfClient.ts", import.meta.url), "utf8");

	assert.match(clientSource, /const trigger = dropdown\.querySelector\('\[data-action="toggle-shelf"\]'\)/);
	assert.match(clientSource, /activeShelfAnchor = trigger/);
	assert.match(clientSource, /activeShelfDropdown = dropdown/);
	assert.match(clientSource, /activeShelfMenu = menu/);
	assert.match(clientSource, /portalShelfMenu\(dropdown, menu\)/);
	assert.match(clientSource, /await positionShelfMenu\(trigger, menu\)/);
	assert.match(clientSource, /computePosition\(anchor, menu/);
	assert.doesNotMatch(clientSource, /triggerCenterY/);
	assert.doesNotMatch(clientSource, /calculateShelfMenuPosition/);
	assert.doesNotMatch(clientSource, /--shelf-menu-x|--shelf-menu-y/);
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

test("syncShelfEntryToServer notifies reading views only after a successful save", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalCustomEvent = (globalThis as Record<string, unknown>).CustomEvent;
	const originalBroadcastChannel = (globalThis as Record<string, unknown>).BroadcastChannel;
	const dispatchedEvents: Array<{ type: string; detail?: unknown }> = [];
	const storageWrites: Array<[string, string]> = [];
	const channelMessages: unknown[] = [];

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
		new Response(JSON.stringify({ ok: true, entry: { id: "entry_1" } }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		})) as typeof fetch;
	(globalThis as Record<string, unknown>).CustomEvent = class {
		type: string;
		detail: unknown;
		constructor(type: string, init?: { detail?: unknown }) {
			this.type = type;
			this.detail = init?.detail;
		}
	};
	(globalThis as Record<string, unknown>).BroadcastChannel = class {
		name: string;
		constructor(name: string) {
			this.name = name;
		}
		postMessage(message: unknown) {
			channelMessages.push(message);
		}
		close() {}
	};
	(globalThis as Record<string, unknown>).window = {
		location: { href: "" },
		dispatchEvent: (event: { type: string; detail?: unknown }) => {
			dispatchedEvents.push(event);
			return true;
		},
		localStorage: {
			setItem: (key: string, value: string) => storageWrites.push([key, value])
		}
	};

	try {
		const result = await syncShelfEntryToServer({ title: "Finished Book", status: "finished" });

		assert.equal(result.ok, true);
		assert.equal(dispatchedEvents.length, 1);
		assert.equal(dispatchedEvents[0]?.type, "dogeared:reading-data-changed");
		assert.equal(storageWrites[0]?.[0], "dogeared:reading-data-changed-at");
		assert.match(storageWrites[0]?.[1] || "", /^\d+$/);
		assert.deepEqual((channelMessages[0] as { type?: string })?.type, "changed");
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).CustomEvent = originalCustomEvent;
		(globalThis as Record<string, unknown>).BroadcastChannel = originalBroadcastChannel;
	}
});

test("syncShelfEntryToServer keeps reading views unchanged after a failed save", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	const originalCustomEvent = (globalThis as Record<string, unknown>).CustomEvent;
	const dispatchedEvents: unknown[] = [];
	const storageWrites: unknown[] = [];

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () =>
		new Response(JSON.stringify({ error: "broken" }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		})) as typeof fetch;
	(globalThis as Record<string, unknown>).CustomEvent = class {
		type: string;
		constructor(type: string) {
			this.type = type;
		}
	};
	(globalThis as Record<string, unknown>).window = {
		location: { href: "" },
		dispatchEvent: (event: unknown) => {
			dispatchedEvents.push(event);
			return true;
		},
		localStorage: {
			setItem: (key: string, value: string) => storageWrites.push([key, value])
		}
	};

	try {
		const result = await syncShelfEntryToServer({ title: "Failed Finish", status: "finished" });

		assert.equal(result.ok, false);
		assert.equal(dispatchedEvents.length, 0);
		assert.equal(storageWrites.length, 0);
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
		(globalThis as Record<string, unknown>).CustomEvent = originalCustomEvent;
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

test("saveShelfEntryWithRetry coalesces duplicate in-flight mutations", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	let releaseFetch: (() => void) | undefined;
	const fetchGate = new Promise<void>((resolve) => {
		releaseFetch = resolve;
	});
	let attempts = 0;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async () => {
		attempts += 1;
		await fetchGate;
		return new Response(JSON.stringify({ ok: true, entry: { id: "entry_dedupe" } }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "" } };

	try {
		const entry = { title: "Dedupe Book", author: "Test Author", status: "reading" };
		const first = saveShelfEntryWithRetry(entry);
		const second = saveShelfEntryWithRetry(entry);
		assert.equal(attempts, 1);
		releaseFetch?.();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		assert.equal(firstResult.ok, true);
		assert.equal(secondResult.ok, true);
		assert.equal(attempts, 1);
	} finally {
		(globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
});

test("removeShelfEntryWithRetry coalesces duplicate in-flight mutations", async () => {
	const originalFetch = globalThis.fetch;
	const originalWindow = (globalThis as Record<string, unknown>).window;
	let releaseFetch: (() => void) | undefined;
	const fetchGate = new Promise<void>((resolve) => {
		releaseFetch = resolve;
	});
	let attempts = 0;

	(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url, init) => {
		attempts += 1;
		assert.equal((init as RequestInit).method, "DELETE");
		await fetchGate;
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" }
		});
	}) as typeof fetch;
	(globalThis as Record<string, unknown>).window = { location: { href: "" } };

	try {
		const entry = { title: "Remove Dedupe Book", author: "Test Author", status: "finished" };
		const first = removeShelfEntryWithRetry(entry);
		const second = removeShelfEntryWithRetry(entry);
		assert.equal(attempts, 1);
		releaseFetch?.();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		assert.equal(firstResult.ok, true);
		assert.equal(secondResult.ok, true);
		assert.equal(attempts, 1);
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
