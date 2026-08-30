type PageCleanup = (() => void) | null;

type PageLifecycleRegistry = {
	boundKeys: Set<string>;
	cleanups: Map<string, PageCleanup>;
};

declare global {
	interface Window {
		__dogearedPageLifecycle?: PageLifecycleRegistry;
	}
}

function lifecycleRegistry(): PageLifecycleRegistry {
	if (!window.__dogearedPageLifecycle) {
		window.__dogearedPageLifecycle = {
			boundKeys: new Set<string>(),
			cleanups: new Map<string, PageCleanup>()
		};
	}
	return window.__dogearedPageLifecycle;
}

export function onDogearedPageLoad(key: string, init: () => void | (() => void)) {
	if (typeof window === "undefined" || typeof document === "undefined") return;
	const registry = lifecycleRegistry();
	const run = () => {
		const previousCleanup = registry.cleanups.get(key);
		if (typeof previousCleanup === "function") {
			try {
				previousCleanup();
			} catch {
				// A stale listener cleanup should not prevent the new page from becoming interactive.
			}
		}
		const nextCleanup = init();
		registry.cleanups.set(key, typeof nextCleanup === "function" ? nextCleanup : null);
	};
	if (!registry.boundKeys.has(key)) {
		registry.boundKeys.add(key);
		document.addEventListener("astro:page-load", run);
	}
	run();
}
