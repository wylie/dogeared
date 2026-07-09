export type AdminLoadResult<T> = {
	data: T;
	warning: string;
};

export function formatNumber(value: unknown, fallback = "0") {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, parsed).toLocaleString();
}

export function formatDate(value: unknown, fallback = "Unknown") {
	if (!value) return fallback;
	const parsed = new Date(String(value));
	if (!Number.isFinite(parsed.getTime())) return fallback;
	return parsed.toLocaleString();
}

export function safePercent(value: unknown, fallback = "0%") {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return `${Math.max(0, parsed).toFixed(1).replace(/\.0$/, "")}%`;
}

export function percentOf(numerator: unknown, denominator: unknown, fallback = "0.0") {
	const top = Number(numerator);
	const bottom = Number(denominator);
	if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return fallback;
	return `${Math.max(0, (top / bottom) * 100).toFixed(1)}`;
}

export function safeArray<T>(value: T[] | null | undefined): T[] {
	return Array.isArray(value) ? value : [];
}

export function safeText(value: unknown, fallback = "—") {
	const text = String(value || "").trim();
	return text || fallback;
}

export async function safeAdminLoad<T>(
	label: string,
	loader: () => Promise<T>,
	fallback: T
): Promise<AdminLoadResult<T>> {
	try {
		const data = await loader();
		return { data: data ?? fallback, warning: "" };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown admin data error.";
		if (import.meta.env.DEV) {
			console.warn(`[admin.load.failed] ${label}: ${message}`);
		}
		return {
			data: fallback,
			warning: `${label} could not be loaded. Showing fallback data.`
		};
	}
}
