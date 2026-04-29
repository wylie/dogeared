import test from "node:test";
import assert from "node:assert/strict";
import {
	loadShelfEntries,
	loadShelfUpdates,
	migrateShelfEntriesInPlace,
	saveShelfEntries,
	saveShelfUpdates
} from "../src/lib/shelfStorage.ts";

function createLocalStorageMock() {
	const map = new Map<string, string>();
	return {
		getItem(key: string) {
			return map.has(key) ? map.get(key)! : null;
		},
		setItem(key: string, value: string) {
			map.set(key, String(value));
		},
		removeItem(key: string) {
			map.delete(key);
		},
		clear() {
			map.clear();
		}
	};
}

test("migrateShelfEntriesInPlace normalizes legacy local entries", () => {
	const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
	(globalThis as Record<string, unknown>).localStorage = createLocalStorageMock();

	try {
		localStorage.setItem("dogeared:myreads", JSON.stringify([
			{
				id: "",
				title: "  Project Hail Mary ",
				author: " Andy Weir ",
				status: "reading",
				totalPages: "497",
				currentPage: "20",
				isbn13: "978-0-593-13520-4",
				categories: [" Sci-Fi ", ""]
			}
		]));
		const migrated = migrateShelfEntriesInPlace();
		assert.equal(migrated.length, 1);
		assert.equal(migrated[0].title, "Project Hail Mary");
		assert.equal(migrated[0].author, "Andy Weir");
		assert.equal(migrated[0].totalPages, 497);
		assert.equal(migrated[0].currentPage, 20);
		assert.equal(migrated[0].isbn13, "9780593135204");
		assert.deepEqual(migrated[0].categories, ["Sci-Fi"]);
		const reloaded = loadShelfEntries();
		assert.equal(reloaded[0].title, "Project Hail Mary");
	} finally {
		(globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
	}
});

test("save/load shelf updates trims update log", () => {
	const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
	(globalThis as Record<string, unknown>).localStorage = createLocalStorageMock();
	try {
		const updates = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
		saveShelfUpdates(updates);
		const loaded = loadShelfUpdates();
		assert.equal(loaded.length, 200);
		saveShelfEntries([{ title: "A" }]);
		const entries = loadShelfEntries();
		assert.equal(entries[0].title, "A");
	} finally {
		(globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
	}
});
