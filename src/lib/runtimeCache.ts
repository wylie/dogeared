type CacheEntry<T> = {
	value: T;
	expiresAt: number;
};

const GLOBAL_KEY = "__dogeared_runtime_cache__";

function getStore() {
	const globalObject = globalThis as typeof globalThis & {
		[GLOBAL_KEY]?: Map<string, CacheEntry<unknown>>;
	};
	if (!globalObject[GLOBAL_KEY]) {
		globalObject[GLOBAL_KEY] = new Map<string, CacheEntry<unknown>>();
	}
	return globalObject[GLOBAL_KEY] as Map<string, CacheEntry<unknown>>;
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
	const value = await loader();
	store.set(key, { value, expiresAt: now + Math.max(1, ttlMs) });
	return value;
}

export function createPublicCacheControl(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0) {
	const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
	const swr = Math.max(0, Math.floor(staleWhileRevalidateSeconds));
	if (swr > 0) return `public, max-age=${maxAge}, stale-while-revalidate=${swr}`;
	return `public, max-age=${maxAge}`;
}

