import { normalizeBookPayload } from "./bookPayload.ts";

export const STATUS_LABELS: Record<string, string> = {
	want_to_read: "Want to Read",
	reading: "Currently Reading",
	finished: "Read"
};

export function statusLabel(status: unknown) {
	return STATUS_LABELS[String(status || "").trim()] || STATUS_LABELS.want_to_read;
}

export function parseCategories(rawValue: unknown) {
	try {
		const parsed = JSON.parse(String(rawValue || "[]"));
		return Array.isArray(parsed)
			? parsed.map((item) => String(item || "").trim()).filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

export function promptForShelfLogin(redirectPath = "/settings#account-settings") {
	const existing = document.getElementById("login-confirm-overlay");
	if (existing) existing.remove();

	const overlay = document.createElement("div");
	overlay.id = "login-confirm-overlay";
	overlay.className = "login-confirm-overlay";

	const dialog = document.createElement("div");
	dialog.className = "login-confirm-dialog";
	dialog.setAttribute("role", "dialog");
	dialog.setAttribute("aria-modal", "true");

	const message = document.createElement("p");
	message.textContent = "Log in or sign up to save books to your shelf. Go there now?";

	const actions = document.createElement("div");
	actions.className = "login-confirm-actions";

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.className = "cancel";
	cancelButton.textContent = "Cancel";

	const okButton = document.createElement("button");
	okButton.type = "button";
	okButton.className = "confirm";
	okButton.textContent = "OK";

	const close = () => overlay.remove();

	cancelButton.addEventListener("click", close);
	okButton.addEventListener("click", () => {
		close();
		window.location.href = redirectPath;
	});
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) close();
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && document.body.contains(overlay)) close();
	}, { once: true });

	actions.append(cancelButton, okButton);
	dialog.append(message, actions);
	overlay.append(dialog);
	document.body.append(overlay);
	okButton.focus();
}

export function setDropdownLabel(dropdown: Element, status: string) {
	const label = dropdown.querySelector(".shelf-label");
	if (label) label.textContent = statusLabel(status);
}

export function setShelvedState(dropdown: Element, isShelved: boolean) {
	if (isShelved) dropdown.classList.add("is-shelved");
	else dropdown.classList.remove("is-shelved");
}

export function showShelfFeedback(
	dropdown: Element,
	message: string,
	feedbackTimers?: WeakMap<object, ReturnType<typeof setTimeout>>
) {
	const feedback = dropdown.querySelector(".shelf-feedback");
	if (!(feedback instanceof HTMLElement)) return;
	feedback.textContent = message;
	feedback.hidden = false;
	if (feedbackTimers) {
		const existingTimer = feedbackTimers.get(dropdown);
		if (existingTimer) clearTimeout(existingTimer);
		const timer = setTimeout(() => {
			feedback.hidden = true;
		}, 1800);
		feedbackTimers.set(dropdown, timer);
		return;
	}
	setTimeout(() => {
		feedback.hidden = true;
	}, 1800);
}

export function closeShelfMenus(shelfDropdowns: Element[]) {
	for (const dropdown of shelfDropdowns) {
		const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
		const menu = dropdown.querySelector(".shelf-menu");
		if (menu instanceof HTMLElement) menu.hidden = true;
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
	}
}

export function toggleShelfMenu(dropdown: Element, shelfDropdowns: Element[]) {
	const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
	const menu = dropdown.querySelector(".shelf-menu");
	if (!(trigger instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
	const willOpen = menu.hidden;
	closeShelfMenus(shelfDropdowns);
	menu.hidden = !willOpen;
	trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

export async function syncShelfEntryToServer(entry: unknown, redirectPath = "/settings#account-settings") {
	const response = await fetch("/api/shelf/entries", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ entry })
	});
	if (response.status === 401) {
		window.location.href = redirectPath;
		return { ok: false, unauthorized: true, response, data: null };
	}
	let data: unknown = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	return { ok: response.ok, unauthorized: false, response, data };
}

export function resolveShelfSaveMessage(result: {
	ok: boolean;
	unauthorized?: boolean;
	response?: Response;
	data?: unknown;
	error?: unknown;
}) {
	if (result.ok) return "";
	if (result.unauthorized || result.response?.status === 401) return "Please log in to save books.";
	if (result.response?.status === 400) return "Invalid book data. Please try again.";
	if (result.response?.status === 409) return "Conflict while saving. Please retry.";
	if (result.response && result.response.status >= 500) return "Server error while saving. Please retry.";
	if (result.error) return "Network error while saving. Please retry.";
	const apiError = (result.data && typeof result.data === "object")
		? String((result.data as Record<string, unknown>).error || "").trim()
		: "";
	return apiError || "Failed to save shelf entry.";
}

export async function saveShelfEntryWithRetry(
	entry: unknown,
	options?: { redirectPath?: string; retries?: number; retryDelayMs?: number }
) {
	const redirectPath = String(options?.redirectPath || "/settings#account-settings");
	const retries = Math.max(0, Number(options?.retries ?? 1) || 0);
	const retryDelayMs = Math.max(0, Number(options?.retryDelayMs ?? 250) || 0);
	let attempt = 0;
	let lastResult: {
		ok: boolean;
		unauthorized?: boolean;
		response?: Response;
		data?: unknown;
		error?: unknown;
	} = { ok: false };

	while (attempt <= retries) {
		try {
			const result = await syncShelfEntryToServer(entry, redirectPath);
			lastResult = result;
			if (result.ok) return { ...result, message: "" };
			const status = Number(result.response?.status || 0);
			const retriable = status >= 500 || status === 429;
			if (!retriable || attempt >= retries || result.unauthorized) break;
		} catch (error) {
			lastResult = { ok: false, error };
			if (attempt >= retries) break;
		}
		attempt += 1;
		if (retryDelayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		}
	}

	return {
		...lastResult,
		message: resolveShelfSaveMessage(lastResult)
	};
}

type ShelfEntryOptions = {
	status: string;
	totalPages?: number;
	currentPage?: number;
	finishedDate?: string;
	source?: string;
	sourceWorkId?: string;
	sourceEditionId?: string;
	sourceUrl?: string;
	updatedAt?: number;
	addedAt?: number;
};

export function buildShelfEntryFromRecord(record: Record<string, unknown>, options: ShelfEntryOptions) {
	const payload = normalizeBookPayload({
		title: record.title,
		author: record.author,
		description: record.description,
		pageCount: record.pageCount,
		coverUrl: record.coverUrl,
		categories: record.categories,
		format: record.format,
		language: record.language,
		publisher: record.publisher,
		publishedDate: record.publishedDate,
		isbn10: record.isbn10,
		isbn13: record.isbn13,
		googleBooksId: record.googleBooksId
	});

	const status = String(options.status || "want_to_read").trim() || "want_to_read";
	const totalPages = Math.max(0, Number(options.totalPages ?? payload.pageCount) || 0);

	return {
		id: `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		title: payload.title,
		author: payload.author,
		description: payload.description,
		status,
		rating: null,
		totalPages,
		currentPage: Math.max(0, Number(options.currentPage ?? 0) || 0),
		finishedDate: String(options.finishedDate || "").trim(),
		coverUrl: payload.coverUrl,
		format: payload.format,
		language: payload.language,
		publisher: payload.publisher,
		publishedDate: payload.publishedDate,
		isbn10: payload.isbn10,
		isbn13: payload.isbn13,
		googleBooksId: payload.googleBooksId,
		categories: payload.categories,
		source: String(options.source || "").trim(),
		sourceWorkId: String(options.sourceWorkId || "").trim(),
		sourceEditionId: String(options.sourceEditionId || "").trim(),
		sourceUrl: String(options.sourceUrl || "").trim(),
		addedAt: Number(options.addedAt || Date.now()),
		updatedAt: Number(options.updatedAt || Date.now())
	};
}
