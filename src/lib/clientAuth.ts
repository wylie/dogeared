export type AuthViewMode = "live" | "logged-in" | "logged-out";

export type ClientAuthState = {
	authenticated: boolean;
	mode: AuthViewMode;
};

const AUTH_PREVIEW_KEY = "dogeared:auth-preview";
const AUTH_EVENT = "dogeared:auth-state-changed";

function isLocalhostHost() {
	const host = String(window.location.hostname || "").toLowerCase();
	return host === "localhost" || host === "127.0.0.1";
}

function normalizeMode(value: unknown): AuthViewMode {
	const text = String(value || "").trim().toLowerCase();
	if (text === "logged-in") return "logged-in";
	if (text === "logged-out") return "logged-out";
	return "live";
}

function readPreviewMode(): AuthViewMode {
	if (!isLocalhostHost()) return "live";
	try {
		return normalizeMode(window.localStorage.getItem(AUTH_PREVIEW_KEY));
	} catch {
		return "live";
	}
}

function writePreviewMode(mode: AuthViewMode) {
	if (!isLocalhostHost()) return;
	try {
		if (mode === "live") {
			window.localStorage.removeItem(AUTH_PREVIEW_KEY);
			return;
		}
		window.localStorage.setItem(AUTH_PREVIEW_KEY, mode);
	} catch {
		// ignore storage failures
	}
}

function readModeFromUrl() {
	if (!isLocalhostHost()) return null;
	const params = new URLSearchParams(window.location.search);
	const raw = params.get("authView");
	if (!raw) return null;
	const mode = normalizeMode(raw);
	return mode;
}

export function setAuthPreviewMode(mode: AuthViewMode) {
	writePreviewMode(mode);
	window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function subscribeAuthStateChange(callback: () => void) {
	window.addEventListener(AUTH_EVENT, callback);
	return () => window.removeEventListener(AUTH_EVENT, callback);
}

export async function resolveClientAuthState(options?: { ssrAuthenticated?: boolean }): Promise<ClientAuthState> {
	const ssrAuthenticated = !!options?.ssrAuthenticated;
	const urlMode = readModeFromUrl();
	if (urlMode) writePreviewMode(urlMode);
	const mode = urlMode || readPreviewMode();
	if (mode === "logged-in") return { authenticated: true, mode };
	if (mode === "logged-out") return { authenticated: false, mode };

	try {
		const response = await fetch("/api/auth/me", { credentials: "same-origin" });
		const data = await response.json().catch(() => ({}));
		return { authenticated: !!data?.authenticated, mode: "live" };
	} catch {
		return { authenticated: ssrAuthenticated, mode: "live" };
	}
}
