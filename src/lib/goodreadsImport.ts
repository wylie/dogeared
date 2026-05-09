export type ShelfStatus = "want_to_read" | "reading" | "finished";

export type GoodreadsImportEntry = {
	id: string;
	title: string;
	author: string;
	totalPages: number;
	currentPage: number;
	status: ShelfStatus;
	finishedDate: string;
	coverUrl: string;
	format: string;
	language: string;
	publisher: string;
	publishedDate: string;
	isbn10: string;
	isbn13: string;
	categories: string[];
	updatedAt: number;
};

export type GoodreadsImportParseResult = {
	totalRows: number;
	skippedRows: number;
	candidates: GoodreadsImportEntry[];
};

export type GoodreadsImportPlan = {
	imported: number;
	updated: number;
	skipped: number;
	duplicateRows: number;
	changedEntries: GoodreadsImportEntry[];
	nextEntries: GoodreadsImportEntry[];
	statusChanges: Array<{ entry: GoodreadsImportEntry; status: ShelfStatus }>;
	totalRows: number;
	importableRows: number;
};

export type GoodreadsImportSummary = {
	imported: number;
	updated: number;
	skipped: number;
	duplicateRows: number;
	wantToRead: number;
	reading: number;
	finished: number;
	totalRows: number;
	importableRows: number;
};

export function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function normalizeNumber(value: unknown) {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

export function normalizeIsbn(value: unknown) {
	return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function coverFromIsbn(isbn13: unknown, isbn10: unknown, size = "M") {
	const clean13 = normalizeIsbn(isbn13);
	const clean10 = normalizeIsbn(isbn10);
	if (clean13.length === 13) return `https://covers.openlibrary.org/b/isbn/${clean13}-${size}.jpg`;
	if (clean10.length === 10) return `https://covers.openlibrary.org/b/isbn/${clean10}-${size}.jpg`;
	return "";
}

export function canonicalizeTitle(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)/g, " ")
		.replace(/\b(abridged|unabridged|audio ?book|audiobook|kindle edition|paperback|hardcover|ebook|e-book|digital edition|color edition)\b/g, " ")
		.split(":")[0]
		.replace(/^(the|a|an)\s+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function canonicalizeAuthor(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/^(by\s+)/, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function canonicalWorkKey(entry: Partial<GoodreadsImportEntry>) {
	const isbn13 = normalizeIsbn(entry.isbn13);
	const isbn10 = normalizeIsbn(entry.isbn10);
	if (isbn13) return `isbn13:${isbn13}`;
	if (isbn10) return `isbn10:${isbn10}`;
	return `title_author:${canonicalizeTitle(entry.title)}|${canonicalizeAuthor(entry.author)}`;
}

export function parseCsv(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		const next = text[i + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				cell += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (!inQuotes && char === ",") {
			row.push(cell);
			cell = "";
			continue;
		}

		if (!inQuotes && (char === "\n" || char === "\r")) {
			if (char === "\r" && next === "\n") i += 1;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
			continue;
		}

		cell += char;
	}

	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}

	return rows;
}

export function mapGoodreadsShelfToStatus(value: unknown): ShelfStatus {
	const shelf = normalizeText(value).toLowerCase();
	if (shelf === "currently-reading") return "reading";
	if (shelf === "read") return "finished";
	return "want_to_read";
}

const NON_GENRE_SHELVES = new Set([
	"",
	"all",
	"book-club",
	"books-i-own",
	"default",
	"did-not-finish",
	"dnf",
	"faves",
	"favorites",
	"fiction",
	"general",
	"kindle",
	"library",
	"maybe",
	"owned",
	"physical",
	"read",
	"re-read",
	"reread",
	"tbr",
	"to-buy",
	"to-read",
	"currently-reading",
	"want-to-buy",
	"want-to-own"
]);

function slugifyShelf(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function isGenreShelf(slug: string) {
	if (!slug || NON_GENRE_SHELVES.has(slug)) return false;
	if (/^\d{4}(-reads)?$/.test(slug)) return false;
	if (/^\d+$/.test(slug)) return false;
	return true;
}

function parseGenres(value: unknown) {
	if (!value) return [];
	return String(value)
		.split(",")
		.map((item) => normalizeText(item))
		.filter((item) => isGenreShelf(slugifyShelf(item)));
}

function parseDate(value: unknown) {
	const text = normalizeText(value);
	if (!text) return "";
	const parsed = new Date(text);
	if (!Number.isFinite(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
}

function toHeaderMap(headers: string[]) {
	const map = new Map<string, number>();
	headers.forEach((header, index) => {
		map.set(normalizeText(header).toLowerCase(), index);
	});
	return map;
}

function getValue(row: string[], headerMap: Map<string, number>, headerName: string) {
	const index = headerMap.get(headerName.toLowerCase());
	if (index === undefined) return "";
	return normalizeText(row[index]);
}

export function applyStatus(entry: GoodreadsImportEntry, status: ShelfStatus, options = { setFinishedDateWhenMissing: true }) {
	entry.status = status;
	if (status === "finished") {
		if (normalizeNumber(entry.totalPages) > 0) {
			entry.currentPage = normalizeNumber(entry.totalPages);
		}
		if (options.setFinishedDateWhenMissing) {
			entry.finishedDate = entry.finishedDate || new Date().toISOString().slice(0, 10);
		}
		return;
	}
	if (status === "reading") {
		entry.currentPage = Math.max(0, normalizeNumber(entry.currentPage));
		entry.finishedDate = "";
		return;
	}
	entry.currentPage = 0;
	entry.finishedDate = "";
}

function normalizeImportedEntry(raw: Record<string, string>): GoodreadsImportEntry {
	const status = mapGoodreadsShelfToStatus(raw.exclusiveShelf);
	const totalPages = normalizeNumber(raw.pages);
	const finishedDate = status === "finished" ? parseDate(raw.dateRead) : "";
	const categories = parseGenres(raw.bookshelves);
	const isbn10 = normalizeIsbn(raw.isbn);
	const isbn13 = normalizeIsbn(raw.isbn13);
	const entry: GoodreadsImportEntry = {
		id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
		title: normalizeText(raw.title),
		author: normalizeText(raw.author),
		totalPages,
		currentPage: 0,
		status,
		finishedDate,
		coverUrl: coverFromIsbn(isbn13, isbn10),
		format: normalizeText(raw.binding),
		language: "",
		publisher: normalizeText(raw.publisher),
		publishedDate: normalizeText(raw.yearPublished),
		isbn10,
		isbn13,
		categories,
		updatedAt: Date.now()
	};
	applyStatus(entry, status, { setFinishedDateWhenMissing: false });
	entry.finishedDate = finishedDate || "";
	return entry;
}

export function parseGoodreadsImportCsv(csvText: string): GoodreadsImportParseResult {
	const rows = parseCsv(csvText);
	if (rows.length < 2) return { totalRows: Math.max(0, rows.length - 1), skippedRows: 0, candidates: [] };
	const headers = rows[0];
	const headerMap = toHeaderMap(headers);
	const candidates: GoodreadsImportEntry[] = [];
	let skippedRows = 0;

	for (let i = 1; i < rows.length; i += 1) {
		const row = rows[i];
		const title = getValue(row, headerMap, "Title");
		const author = getValue(row, headerMap, "Author");
		if (!title) {
			skippedRows += 1;
			continue;
		}
		candidates.push(normalizeImportedEntry({
			title,
			author,
			exclusiveShelf: getValue(row, headerMap, "Exclusive Shelf"),
			pages: getValue(row, headerMap, "Number of Pages"),
			dateRead: getValue(row, headerMap, "Date Read"),
			bookshelves: getValue(row, headerMap, "Bookshelves"),
			binding: getValue(row, headerMap, "Binding"),
			publisher: getValue(row, headerMap, "Publisher"),
			yearPublished: getValue(row, headerMap, "Year Published"),
			isbn: getValue(row, headerMap, "ISBN"),
			isbn13: getValue(row, headerMap, "ISBN13")
		}));
	}

	return { totalRows: rows.length - 1, skippedRows, candidates };
}

function statusRank(status: ShelfStatus) {
	if (status === "finished") return 3;
	if (status === "reading") return 2;
	return 1;
}

function mergeDuplicateCandidate(existing: GoodreadsImportEntry, candidate: GoodreadsImportEntry) {
	const status = statusRank(candidate.status) >= statusRank(existing.status) ? candidate.status : existing.status;
	const merged: GoodreadsImportEntry = {
		...existing,
		title: existing.title || candidate.title,
		author: existing.author || candidate.author,
		totalPages: Math.max(normalizeNumber(existing.totalPages), normalizeNumber(candidate.totalPages)),
		format: existing.format || candidate.format,
		publisher: existing.publisher || candidate.publisher,
		publishedDate: existing.publishedDate || candidate.publishedDate,
		isbn10: existing.isbn10 || candidate.isbn10,
		isbn13: existing.isbn13 || candidate.isbn13,
		coverUrl: existing.coverUrl || candidate.coverUrl || coverFromIsbn(existing.isbn13 || candidate.isbn13, existing.isbn10 || candidate.isbn10),
		categories: Array.from(new Set([...(existing.categories || []), ...(candidate.categories || [])])),
		status,
		updatedAt: Math.max(existing.updatedAt, candidate.updatedAt)
	};
	applyStatus(merged, status, { setFinishedDateWhenMissing: false });
	if (status === "finished") merged.finishedDate = candidate.finishedDate || existing.finishedDate || "";
	return merged;
}

export function dedupeGoodreadsCandidates(candidates: GoodreadsImportEntry[]) {
	const byKey = new Map<string, GoodreadsImportEntry>();
	let duplicateRows = 0;
	for (const candidate of candidates) {
		const key = canonicalWorkKey(candidate);
		if (!candidate.title || !key) continue;
		const existing = byKey.get(key);
		if (existing) {
			byKey.set(key, mergeDuplicateCandidate(existing, candidate));
			duplicateRows += 1;
		} else {
			byKey.set(key, candidate);
		}
	}
	return { candidates: Array.from(byKey.values()), duplicateRows };
}

export function mergeImportedEntry(existing: GoodreadsImportEntry, candidate: GoodreadsImportEntry) {
	const previousStatus = existing.status || "want_to_read";
	const merged: GoodreadsImportEntry = {
		...existing,
		title: existing.title || candidate.title,
		author: existing.author || candidate.author,
		totalPages: existing.totalPages || candidate.totalPages,
		format: existing.format || candidate.format,
		publisher: existing.publisher || candidate.publisher,
		publishedDate: existing.publishedDate || candidate.publishedDate,
		isbn10: existing.isbn10 || candidate.isbn10,
		isbn13: existing.isbn13 || candidate.isbn13,
		coverUrl: existing.coverUrl || candidate.coverUrl || coverFromIsbn(existing.isbn13 || candidate.isbn13, existing.isbn10 || candidate.isbn10),
		categories: Array.isArray(existing.categories) && existing.categories.length > 0
			? existing.categories
			: candidate.categories,
		updatedAt: Date.now()
	};
	applyStatus(merged, candidate.status, { setFinishedDateWhenMissing: false });
	if (candidate.status === "finished") {
		merged.finishedDate = candidate.finishedDate || "";
	}
	return {
		entry: merged,
		statusChanged: previousStatus !== merged.status
	};
}

export function countShelfStatuses(entries: Array<Partial<GoodreadsImportEntry>>) {
	const totals = { wantToRead: 0, reading: 0, finished: 0 };
	for (const entry of entries) {
		if (entry.status === "reading") totals.reading += 1;
		else if (entry.status === "finished") totals.finished += 1;
		else totals.wantToRead += 1;
	}
	return totals;
}

export function buildGoodreadsImportPlan(
	parseResult: GoodreadsImportParseResult,
	existingEntries: GoodreadsImportEntry[],
	mode: "merge" | "replace" = "merge"
): GoodreadsImportPlan {
	const baseEntries = mode === "replace" ? [] : existingEntries.slice();
	const byKey = new Map<string, number>();
	baseEntries.forEach((entry, index) => {
		byKey.set(canonicalWorkKey(entry), index);
	});

	const deduped = dedupeGoodreadsCandidates(parseResult.candidates);
	const changedEntries: GoodreadsImportEntry[] = [];
	const statusChanges: Array<{ entry: GoodreadsImportEntry; status: ShelfStatus }> = [];
	let imported = 0;
	let updated = 0;
	let skipped = parseResult.skippedRows;

	for (const candidate of deduped.candidates) {
		const key = canonicalWorkKey(candidate);
		if (!candidate.title || !key) {
			skipped += 1;
			continue;
		}
		const existingIndex = byKey.get(key);
		if (existingIndex !== undefined) {
			const existing = baseEntries[existingIndex];
			const merged = mergeImportedEntry(existing, candidate);
			baseEntries[existingIndex] = merged.entry;
			changedEntries.push(merged.entry);
			if (merged.statusChanged) statusChanges.push({ entry: merged.entry, status: merged.entry.status });
			updated += 1;
		} else {
			baseEntries.unshift(candidate);
			byKey.set(key, 0);
			for (const [existingKey, index] of byKey.entries()) {
				if (existingKey !== key) byKey.set(existingKey, index + 1);
			}
			changedEntries.push(candidate);
			statusChanges.push({ entry: candidate, status: candidate.status });
			imported += 1;
		}
	}

	return {
		imported,
		updated,
		skipped,
		duplicateRows: deduped.duplicateRows,
		changedEntries,
		nextEntries: baseEntries,
		statusChanges,
		totalRows: parseResult.totalRows,
		importableRows: deduped.candidates.length
	};
}

export function summarizeGoodreadsImportPlan(plan: GoodreadsImportPlan): GoodreadsImportSummary {
	const statusTotals = countShelfStatuses(plan.nextEntries);
	return {
		imported: plan.imported,
		updated: plan.updated,
		skipped: plan.skipped,
		duplicateRows: plan.duplicateRows,
		wantToRead: statusTotals.wantToRead,
		reading: statusTotals.reading,
		finished: statusTotals.finished,
		totalRows: plan.totalRows,
		importableRows: plan.importableRows
	};
}
