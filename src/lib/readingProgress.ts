export type ProgressInputMode = "page" | "percent" | "chapter" | "location" | "audio";

export type NormalizedProgressUpdate = {
	valid: boolean;
	currentPage: number;
	mode: ProgressInputMode;
	normalizedText: string;
	percent: number;
};

export function normalizeProgressInputMode(value: unknown): ProgressInputMode {
	const raw = String(value || "").trim();
	if (raw === "percent" || raw === "chapter" || raw === "location" || raw === "audio") return raw;
	return "page";
}

function clampPercent(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function clampCurrentPage(value: number, totalPages: number) {
	if (!Number.isFinite(value)) return 0;
	const maxPages = totalPages > 0 ? totalPages : Number.MAX_SAFE_INTEGER;
	return Math.max(0, Math.min(maxPages, Math.round(value)));
}

export function normalizeProgressUpdateInput(input: {
	rawValue: unknown;
	totalPages?: unknown;
	progressType?: unknown;
}): NormalizedProgressUpdate {
	const raw = String(input.rawValue || "").trim();
	if (!raw) return { valid: false, currentPage: 0, mode: "page", normalizedText: "", percent: 0 };

	const totalPages = Math.max(0, Number(input.totalPages || 0) || 0);
	const mode = normalizeProgressInputMode(input.progressType);

	if (mode === "percent" || raw.endsWith("%")) {
		const percentValue = Number(raw.replace("%", "").trim());
		if (!Number.isFinite(percentValue) || totalPages <= 0) {
			return {
				valid: false,
				currentPage: 0,
				mode: "percent",
				normalizedText: raw,
				percent: 0
			};
		}
		const percent = clampPercent(percentValue);
		return {
			valid: true,
			currentPage: clampCurrentPage((percent / 100) * totalPages, totalPages),
			mode: "percent",
			normalizedText: `${percent}%`,
			percent
		};
	}

	const numericText = raw.replace(/[^0-9.]/g, "");
	if (!numericText) {
		return {
			valid: false,
			currentPage: 0,
			mode,
			normalizedText: raw,
			percent: 0
		};
	}

	const numericValue = Number(numericText);
	if (!Number.isFinite(numericValue)) {
		return {
			valid: false,
			currentPage: 0,
			mode,
			normalizedText: raw,
			percent: 0
		};
	}

	const currentPage = clampCurrentPage(numericValue, totalPages);
	return {
		valid: true,
		currentPage,
		mode,
		normalizedText: mode === "chapter"
			? `Chapter ${Math.round(numericValue)}`
			: mode === "location"
				? `Location ${Math.round(numericValue)}`
				: mode === "audio"
					? raw
					: String(currentPage),
		percent: totalPages > 0
			? clampPercent((currentPage / totalPages) * 100)
			: 0
	};
}
