type CacheEntry<T> = {
	value: T;
	expiresAt: number;
};

const GLOBAL_KEY = "__dogeared_runtime_cache__";
const IN_FLIGHT_KEY = "__dogeared_runtime_cache_in_flight__";

function getStore() {
	const globalObject = globalThis as typeof globalThis & {
		[GLOBAL_KEY]?: Map<string, CacheEntry<unknown>>;
	};
	if (!globalObject[GLOBAL_KEY]) {
		globalObject[GLOBAL_KEY] = new Map<string, CacheEntry<unknown>>();
	}
	return globalObject[GLOBAL_KEY] as Map<string, CacheEntry<unknown>>;
}

function getInFlightStore() {
	const globalObject = globalThis as typeof globalThis & {
		[IN_FLIGHT_KEY]?: Map<string, Promise<unknown>>;
	};
	if (!globalObject[IN_FLIGHT_KEY]) {
		globalObject[IN_FLIGHT_KEY] = new Map<string, Promise<unknown>>();
	}
	return globalObject[IN_FLIGHT_KEY] as Map<string, Promise<unknown>>;
}

export async function withRuntimeCache<T>(
	key: string,
	ttlMs: number,
	loader: () => Promise<T>
): Promise<T> {
	const now = Date.now();
	const store = getStore();
	const existing = store.get(key);
	if (existing && existing.expiresAt > now) {
		return existing.value as T;
	}
	const inFlight = getInFlightStore();
	const existingPromise = inFlight.get(key);
	if (existingPromise) return existingPromise as Promise<T>;
	const promise = (async () => {
		const value = await loader();
		store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
		return value;
	})();
	inFlight.set(key, promise);
	try {
		return await promise;
	} finally {
		inFlight.delete(key);
	}
}

export function getRuntimeCacheValue<T>(key: string): T | null {
	const existing = getStore().get(key);
	if (!existing || existing.expiresAt <= Date.now()) return null;
	return existing.value as T;
}

export function createPublicCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
	const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
	const swr = Math.max(0, Math.floor(staleWhileRevalidateSeconds));
	if (swr > 0) return `public, max-age=${maxAge}, stale-while-revalidate=${swr}`;
	return `public, max-age=${maxAge}`;
}
