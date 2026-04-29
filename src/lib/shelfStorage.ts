import { fromShelfEntryInput } from "./bookPayload.ts";

const STORAGE_KEY = "dogeared:myreads";
const UPDATES_KEY = "dogeared:updates";

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeStatus(value: unknown) {
	const input = normalizeText(value);
	if (input === "reading" || input === "finished") return input;
	return "want_to_read";
}

export function loadShelfEntries() {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		const source = Array.isArray(parsed) ? parsed : [];
		return source
			.map((item) => {
				const payload = fromShelfEntryInput(item);
				const status = normalizeStatus((item as Record<string, unknown>)?.status);
				const totalPages = Math.max(0, Number((item as Record<string, unknown>)?.totalPages ?? payload.pageCount) || 0);
				const currentPage = Math.max(0, Number((item as Record<string, unknown>)?.currentPage || 0) || 0);
				const now = Date.now();
				return {
					id: normalizeText((item as Record<string, unknown>)?.id) || `book_${now}_${Math.random().toString(36).slice(2, 8)}`,
					title: payload.title,
					author: payload.author,
					description: payload.description,
					status,
					rating: Number((item as Record<string, unknown>)?.rating || 0) || 0,
					totalPages,
					currentPage: Math.min(currentPage, totalPages || currentPage),
					finishedDate: status === "finished" ? normalizeText((item as Record<string, unknown>)?.finishedDate) : "",
					coverUrl: payload.coverUrl,
					format: payload.format,
					language: payload.language,
					publisher: payload.publisher,
					publishedDate: payload.publishedDate,
					isbn10: payload.isbn10,
					isbn13: payload.isbn13,
					googleBooksId: payload.googleBooksId,
					categories: payload.categories,
					source: normalizeText((item as Record<string, unknown>)?.source),
					sourceWorkId: normalizeText((item as Record<string, unknown>)?.sourceWorkId),
					sourceEditionId: normalizeText((item as Record<string, unknown>)?.sourceEditionId),
					sourceUrl: normalizeText((item as Record<string, unknown>)?.sourceUrl),
					addedAt: Number((item as Record<string, unknown>)?.addedAt || now) || now,
					updatedAt: Number((item as Record<string, unknown>)?.updatedAt || now) || now
				};
			})
			.filter((entry) => entry.title);
	} catch {
		return [];
	}
}

export function saveShelfEntries(entries: unknown[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
}

export function loadShelfUpdates() {
	try {
		const parsed = JSON.parse(localStorage.getItem(UPDATES_KEY) || "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function saveShelfUpdates(updates: unknown[]) {
	const source = Array.isArray(updates) ? updates : [];
	localStorage.setItem(UPDATES_KEY, JSON.stringify(source.slice(0, 200)));
}

export function migrateShelfEntriesInPlace() {
	const migrated = loadShelfEntries();
	saveShelfEntries(migrated);
	return migrated;
}
