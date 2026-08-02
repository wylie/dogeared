import test from "node:test";
import assert from "node:assert/strict";
import { withRuntimeCache } from "../src/lib/runtimeCache.ts";

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
