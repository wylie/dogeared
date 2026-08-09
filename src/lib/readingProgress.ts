export type ProgressInputMode = "page" | "percent" | "chapter" | "location" | "audio";

export type ProgressValidationErrorCode =
	| "progress-value-required"
	| "progress-value-not-numeric"
	| "progress-value-out-of-range"
	| "progress-total-pages-required";

export type NormalizedProgressUpdate = {
	valid: boolean;
	currentPage: number;
	mode: ProgressInputMode;
	normalizedText: string;
	percent: number;
	errorCode?: ProgressValidationErrorCode;
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
	allowMissingTotalPagesForPercent?: boolean;
}): NormalizedProgressUpdate {
	const mode = normalizeProgressInputMode(input.progressType);
	const raw = input.rawValue === null || typeof input.rawValue === "undefined"
		? ""
		: String(input.rawValue).trim();
	if (!raw) {
		return { valid: false, currentPage: 0, mode, normalizedText: "", percent: 0, errorCode: "progress-value-required" };
	}

	const totalPages = Math.max(0, Number(input.totalPages || 0) || 0);

	if (mode === "percent" || raw.endsWith("%")) {
		const percentText = raw.replace("%", "").trim();
		const percentValue = finiteNumberFromText(percentText);
		if (percentValue === null) {
			return {
				valid: false,
				currentPage: 0,
				mode: "percent",
				normalizedText: raw,
				percent: 0,
				errorCode: "progress-value-not-numeric"
			};
		}
		if (percentValue < 0 || percentValue > 100) {
			return {
				valid: false,
				currentPage: 0,
				mode: "percent",
				normalizedText: raw,
				percent: 0,
				errorCode: "progress-value-out-of-range"
			};
		}
		const percent = clampPercent(percentValue);
		if (totalPages <= 0) {
			if (input.allowMissingTotalPagesForPercent) {
				return {
					valid: true,
					currentPage: 0,
					mode: "percent",
					normalizedText: `${percent}%`,
					percent
				};
			}
			return {
				valid: false,
				currentPage: 0,
				mode: "percent",
				normalizedText: raw,
				percent: 0,
				errorCode: "progress-total-pages-required"
			};
		}
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
			percent: 0,
			errorCode: "progress-value-out-of-range"
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
			percent: 0,
			errorCode: "progress-value-required"
		};
	}

	const numericValue = finiteNumberFromText(numericText);
	if (numericValue === null) {
		return {
			valid: false,
			currentPage: 0,
			mode,
			normalizedText: raw,
			percent: 0,
			errorCode: "progress-value-not-numeric"
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
