import test from "node:test";
import assert from "node:assert/strict";
import {
	invalidateCatalogRuntimeCaches,
	invalidateRuntimeCacheByPrefix,
	withRuntimeCache
} from "../src/lib/runtimeCache.ts";

test("withRuntimeCache coalesces duplicate in-flight loads and reuses cached value", async () => {
	const key = `runtime-cache-test:${Date.now()}:${Math.random()}`;
	let releaseLoad: (() => void) | undefined;
	const loadGate = new Promise<void>((resolve) => {
		releaseLoad = resolve;
	});
	let loads = 0;

	const load = async () => {
		loads += 1;
		await loadGate;
		return { value: "loaded" };
	};

	const first = withRuntimeCache(key, 10_000, load);
	const second = withRuntimeCache(key, 10_000, load);
	assert.equal(loads, 1);
	releaseLoad?.();

	const [firstValue, secondValue] = await Promise.all([first, second]);
	assert.equal(firstValue, secondValue);
	assert.equal(loads, 1);

	const cachedValue = await withRuntimeCache(key, 10_000, load);
	assert.equal(cachedValue, firstValue);
	assert.equal(loads, 1);
});

test("runtime cache invalidates catalog prefixes after admin cover changes", async () => {
	const searchKey = `search:dbd:runtime-cache-test:${Date.now()}`;
	const homeKey = `home:runtime-cache-test:${Date.now()}`;
	const externalKey = `search:google:runtime-cache-test:${Date.now()}`;
	let searchLoads = 0;
	let homeLoads = 0;
	let externalLoads = 0;

	await withRuntimeCache(searchKey, 10_000, async () => {
		searchLoads += 1;
		return "old-search";
	});
	await withRuntimeCache(homeKey, 10_000, async () => {
		homeLoads += 1;
		return "old-home";
	});
	await withRuntimeCache(externalKey, 10_000, async () => {
		externalLoads += 1;
		return "external";
	});

	invalidateCatalogRuntimeCaches();

	const nextSearch = await withRuntimeCache(searchKey, 10_000, async () => {
		searchLoads += 1;
		return "new-search";
	});
	const nextHome = await withRuntimeCache(homeKey, 10_000, async () => {
		homeLoads += 1;
		return "new-home";
	});
	const nextExternal = await withRuntimeCache(externalKey, 10_000, async () => {
		externalLoads += 1;
		return "new-external";
	});

	assert.equal(nextSearch, "new-search");
	assert.equal(nextHome, "new-home");
	assert.equal(nextExternal, "external");
	assert.equal(searchLoads, 2);
	assert.equal(homeLoads, 2);
	assert.equal(externalLoads, 1);
	invalidateRuntimeCacheByPrefix("search:google:runtime-cache-test:");
});
