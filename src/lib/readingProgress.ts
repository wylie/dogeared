export type ProgressInputMode = "page" | "percent" | "chapter" | "location" | "audio";

export type NormalizedProgressUpdate = {
	valid: boolean;
	currentPage: number;
	mode: ProgressInputMode;
	normalizedText: string;
	percent: number;
};

export function normalizeProgressInputMode(value: unknown): ProgressInputMode {
	const raw = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, " ");
	if (raw === "percent" || raw === "percentage" || raw === "pct" || raw === "%") return "percent";
	if (raw === "chapter" || raw === "chapters") return "chapter";
	if (raw === "location" || raw === "kindle location" || raw === "kindle locations") return "location";
	if (raw === "audio" || raw === "audiobook" || raw === "audiobook time" || raw === "time") return "audio";
	if (raw === "page" || raw === "pages" || raw === "page number" || raw === "page numbers") return "page";
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

function finiteNumberFromText(value: string) {
	if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function numericTokenFromText(value: string) {
	return value.match(/\d+(?:\.\d+)?/)?.[0] || "";
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
		const percentText = raw.replace("%", "").trim();
		const percentValue = finiteNumberFromText(percentText);
		if (percentValue === null || percentValue < 0 || percentValue > 100 || totalPages <= 0) {
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

	if (/-\s*\d/.test(raw)) {
		return {
			valid: false,
			currentPage: 0,
			mode,
			normalizedText: raw,
			percent: 0
		};
	}

	const numericText = mode === "page"
		? raw.trim()
		: (mode === "audio" ? raw.replace(/[^0-9.]/g, "") : numericTokenFromText(raw));
	if (!numericText) {
		return {
			valid: false,
			currentPage: 0,
			mode,
			normalizedText: raw,
			percent: 0
		};
	}

	const numericValue = finiteNumberFromText(numericText);
	if (numericValue === null) {
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
