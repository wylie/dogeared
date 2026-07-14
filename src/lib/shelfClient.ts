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
	message.textContent = "Log in or create an account to save books, build shelves, and get personal recommendations.";

	const actions = document.createElement("div");
	actions.className = "login-confirm-actions";

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.className = "cancel";
	cancelButton.textContent = "Cancel";

	const okButton = document.createElement("button");
	okButton.type = "button";
	okButton.className = "confirm";
	okButton.textContent = "Continue";

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
	const normalizedStatus = String(status || "").trim();
	const nextStatus = (
		normalizedStatus === "reading" || normalizedStatus === "finished" || normalizedStatus === "want_to_read"
	)
		? normalizedStatus
		: "";
	const nextLabel = nextStatus ? statusLabel(nextStatus) : "Not on Shelf";
	const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
	if (trigger instanceof HTMLElement) {
		trigger.setAttribute("data-status", nextStatus);
		trigger.setAttribute("aria-label", `Shelf: ${nextLabel}. Open shelf options`);
		trigger.setAttribute("title", `Shelf: ${nextLabel}`);
	}
	const state = dropdown.querySelector(".shelf-state");
	if (state) state.textContent = nextLabel;
	const icon = dropdown.querySelector(".shelf-plus");
	if (icon) {
		const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
		const displayIconOverride = String(
			(trigger instanceof HTMLElement ? trigger.getAttribute("data-display-icon") : "")
			|| ""
		).trim();
		icon.textContent = displayIconOverride || (
			nextStatus === "finished"
				? "check"
				: (nextStatus === "reading" ? "menu_book" : (nextStatus === "want_to_read" ? "add" : "library_add"))
		);
	}
	for (const option of Array.from(dropdown.querySelectorAll('[data-action="set-shelf"]'))) {
		if (!(option instanceof HTMLElement)) continue;
		const optionStatus = String(option.getAttribute("data-status") || "").trim();
		const isCurrent = optionStatus === nextStatus;
		option.classList.toggle("is-current", isCurrent);
		const iconNode = option.querySelector(".shelf-option-icon");
		if (iconNode instanceof HTMLElement) {
			iconNode.style.color = isCurrent ? "var(--color-primary)" : "#9aa3af";
		}
	}
}

export function setShelvedState(dropdown: Element, isShelved: boolean) {
	if (isShelved) dropdown.classList.add("is-shelved");
	else dropdown.classList.remove("is-shelved");
}

export function normalizeRatingValue(value: unknown) {
	if (value === null || value === undefined || String(value).trim() === "") return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function notifyReadingDataChanged() {
	if (typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
	const detail = { timestamp: Date.now() };
	window.dispatchEvent(new CustomEvent("dogeared:reading-data-changed", { detail }));
	try {
		const channel = new BroadcastChannel("dogeared:reading-data");
		channel.postMessage({ type: "changed", ...detail });
		channel.close();
	} catch {
		// Same-tab events are enough when cross-tab messaging is unavailable.
	}
	try {
		window.localStorage?.setItem("dogeared:reading-data-changed-at", String(detail.timestamp));
	} catch {
		// Storage notifications are best-effort cross-tab hydration.
	}
}

export async function syncShelfRatingToServer(input: { bookId: unknown; rating: unknown }) {
	const response = await fetch("/api/shelf/rating", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			bookId: Math.max(0, Number(input.bookId || 0) || 0),
			rating: normalizeRatingValue(input.rating)
		})
	});
	if (response.status === 401) {
		window.location.href = "/settings#account-settings";
		return { ok: false, unauthorized: true, response, data: null };
	}
	let data: unknown = null;
	try {
		data = await response.json();
	} catch {
		data = null;
	}
	if (response.ok) notifyReadingDataChanged();
	return { ok: response.ok, unauthorized: false, response, data };
}

export function renderRatingStars(value: unknown) {
	const rating = normalizeRatingValue(value) || 0;
	return Array.from({ length: 5 }, (_, index) => (index < rating ? "★" : "☆")).join("");
}

export function setRatingControlValue(control: Element, value: unknown) {
	const rating = normalizeRatingValue(value);
	control.setAttribute("data-rating", rating ? String(rating) : "");
	const stars = control.querySelector("[data-rating-stars]");
	if (stars instanceof HTMLElement) {
		stars.textContent = renderRatingStars(rating);
	}
	const actions = control.querySelector(".rating-control-actions");
	if (actions instanceof HTMLElement) {
		actions.setAttribute("aria-label", rating ? `Your rating: ${rating}/5` : "Rate this book");
	}
	const clearButton = control.querySelector("[data-action='clear-rating']");
	if (clearButton instanceof HTMLButtonElement) {
		clearButton.style.display = rating ? "" : "none";
	}
	for (const button of Array.from(control.querySelectorAll("[data-action='set-rating']"))) {
		if (!(button instanceof HTMLElement)) continue;
		const buttonRating = normalizeRatingValue(button.getAttribute("data-rating"));
		button.setAttribute("aria-pressed", rating && buttonRating === rating ? "true" : "false");
		button.textContent = buttonRating && rating && buttonRating <= rating ? "★" : "☆";
	}
}

export function showRatingFeedback(control: Element, message: string, isError = false) {
	const feedback = control.querySelector("[data-rating-feedback]");
	if (!(feedback instanceof HTMLElement)) return;
	const existingTimer = Number(feedback.dataset.hideTimer || 0);
	if (existingTimer) window.clearTimeout(existingTimer);
	delete feedback.dataset.hideTimer;
	feedback.textContent = message;
	feedback.hidden = !message;
	feedback.classList.toggle("is-error", isError);
	feedback.classList.remove("is-hiding");
	if (message && !isError && message !== "Saving...") {
		const fadeTimer = window.setTimeout(() => {
			feedback.classList.add("is-hiding");
			const hideTimer = window.setTimeout(() => {
				feedback.hidden = true;
				feedback.textContent = "";
				feedback.classList.remove("is-hiding");
				delete feedback.dataset.hideTimer;
			}, 220);
			feedback.dataset.hideTimer = String(hideTimer);
		}, 1800);
		feedback.dataset.hideTimer = String(fadeTimer);
	}
}

export function initRatingControls(root: ParentNode = document) {
	const controls = Array.from(root.querySelectorAll("[data-rating-control]"));
	for (const control of controls) setRatingControlValue(control, control.getAttribute("data-rating"));
	document.addEventListener("click", async (event) => {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;
		const button = target.closest("[data-action='set-rating'], [data-action='clear-rating']");
		if (!(button instanceof HTMLButtonElement)) return;
		const control = button.closest("[data-rating-control]");
		if (!(control instanceof HTMLElement)) return;
		const bookId = Math.max(0, Number(control.dataset.bookId || 0) || 0);
		if (!bookId) return;
		const nextRating = button.dataset.action === "clear-rating" ? null : normalizeRatingValue(button.dataset.rating);
		button.disabled = true;
		showRatingFeedback(control, "Saving...");
		try {
			const result = await syncShelfRatingToServer({ bookId, rating: nextRating });
			if (!result.ok) {
				const message = result.unauthorized ? "Please log in to rate books." : "Failed to save rating.";
				showRatingFeedback(control, message, true);
				return;
			}
			const selectors = `[data-rating-control][data-book-id="${CSS.escape(String(bookId))}"]`;
			const matchingControls = Array.from(document.querySelectorAll(selectors));
			for (const matchingControl of matchingControls) {
				setRatingControlValue(matchingControl, nextRating);
			}
			showRatingFeedback(control, nextRating ? "Rating saved." : "Rating removed.");
		} catch {
			showRatingFeedback(control, "Failed to save rating.", true);
		} finally {
			button.disabled = false;
		}
	});
}

export function showShelfFeedback(
	dropdown: Element,
	message: string,
	feedbackTimers?: WeakMap<object, ReturnType<typeof setTimeout>>
) {
	const feedback = dropdown.querySelector(".shelf-feedback");
	if (!(feedback instanceof HTMLElement)) return;
	const existingElementTimer = Number(feedback.dataset.hideTimer || 0);
	if (existingElementTimer) window.clearTimeout(existingElementTimer);
	delete feedback.dataset.hideTimer;
	feedback.textContent = message;
	feedback.hidden = false;
	const isBusy = /\bsaving\b/i.test(message);
	const isError = /\b(failed|unable|error|retry|invalid|network|server)\b/i.test(message);
	feedback.classList.toggle("is-error", isError);
	feedback.classList.toggle("is-busy", isBusy);
	if (isBusy) return;
	const hideDelay = isError ? 4200 : 1800;
	if (feedbackTimers) {
		const existingTimer = feedbackTimers.get(dropdown);
		if (existingTimer) clearTimeout(existingTimer);
		const timer = setTimeout(() => {
			feedback.hidden = true;
			feedback.classList.remove("is-error", "is-busy");
		}, hideDelay);
		feedbackTimers.set(dropdown, timer);
		feedback.dataset.hideTimer = String(timer);
		return;
	}
	const timer = window.setTimeout(() => {
		feedback.hidden = true;
		feedback.classList.remove("is-error", "is-busy");
		delete feedback.dataset.hideTimer;
	}, hideDelay);
	feedback.dataset.hideTimer = String(timer);
}

export function closeShelfMenus(shelfDropdowns: Element[]) {
	for (const dropdown of shelfDropdowns) {
		const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
		const menu = dropdown.querySelector(".shelf-menu");
		if (menu instanceof HTMLElement) menu.hidden = true;
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
	}
}

let customShelvesFetchPromise: Promise<Array<{ id: number; name: string; icon: string }>> | null = null;

async function fetchCustomShelvesForDropdown() {
	if (!customShelvesFetchPromise) {
		customShelvesFetchPromise = fetch("/api/shelf/custom-shelves", { credentials: "same-origin" })
			.then(async (response) => {
				if (!response.ok) return [];
				const data = await response.json().catch(() => ({}));
				const shelves = Array.isArray((data as { shelves?: unknown[] })?.shelves) ? (data as { shelves: unknown[] }).shelves : [];
				return shelves.map((row) => ({
					id: Math.max(0, Number((row as { id?: unknown }).id || 0) || 0),
					name: String((row as { name?: unknown }).name || "").trim(),
					icon: String((row as { icon?: unknown }).icon || "bookmarks").trim() || "bookmarks"
				})).filter((row) => row.id > 0 && row.name).slice(0, 24);
			})
			.catch(() => []);
	}
	return customShelvesFetchPromise;
}

async function ensureCustomShelfOptions(dropdown: Element) {
	if (!(dropdown instanceof HTMLElement)) return;
	if (dropdown.dataset.customShelvesLoaded === "true") return;
	const optionsWrap = dropdown.querySelector("[data-custom-shelf-options]");
	if (!(optionsWrap instanceof HTMLElement)) return;
	const existing = optionsWrap.querySelector('[data-action="assign-custom-shelf"]');
	if (existing) {
		dropdown.dataset.customShelvesLoaded = "true";
		return;
	}
	const shelves = await fetchCustomShelvesForDropdown();
	if (shelves.length === 0) return;
	const currentCustomShelfId = Math.max(0, Number(dropdown.dataset.currentCustomShelfId || 0) || 0);
	const divider = document.createElement("div");
	divider.className = "shelf-option-divider";
	divider.setAttribute("role", "separator");
	divider.setAttribute("aria-hidden", "true");
	optionsWrap.append(divider);
	for (const shelf of shelves) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `shelf-option${currentCustomShelfId === shelf.id ? " is-current" : ""}`;
		button.setAttribute("data-action", "assign-custom-shelf");
		button.setAttribute("data-shelf-id", String(shelf.id));
		button.innerHTML = `<span class="material-icons shelf-option-icon" aria-hidden="true">${shelf.icon}</span><span>${shelf.name}</span>`;
		optionsWrap.append(button);
	}
	dropdown.dataset.customShelvesLoaded = "true";
}

export async function toggleShelfMenu(dropdown: Element, shelfDropdowns: Element[]) {
	const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
	const menu = dropdown.querySelector(".shelf-menu");
	if (!(trigger instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
	await ensureCustomShelfOptions(dropdown);
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
	if (response.ok) notifyReadingDataChanged();
	return { ok: response.ok, unauthorized: false, response, data };
}

export async function deleteShelfEntryFromServer(entry: unknown, redirectPath = "/settings#account-settings") {
	const response = await fetch("/api/shelf/entries", {
		method: "DELETE",
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

export async function removeBookFromAllShelvesOnServer(
	bookId: unknown,
	entry?: unknown,
	redirectPath = "/settings#account-settings"
) {
	const normalizedBookId = Math.max(0, Number(bookId || 0) || 0);
	const payload: Record<string, unknown> = {};
	if (normalizedBookId > 0) payload.bookId = normalizedBookId;
	if (entry && typeof entry === "object") payload.entry = entry;
	const response = await fetch("/api/shelf/entries", {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload)
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

export function resolveShelfRemoveMessage(result: {
	ok: boolean;
	unauthorized?: boolean;
	response?: Response;
	data?: unknown;
	error?: unknown;
}) {
	if (result.ok) return "";
	const apiError = (result.data && typeof result.data === "object")
		? String(
			(result.data as Record<string, unknown>).detail
			|| (result.data as Record<string, unknown>).error
			|| ""
		).trim()
		: "";
	if (apiError) return apiError;
	if (result.unauthorized || result.response?.status === 401) return "Please log in to manage shelves.";
	if (result.response?.status === 404) return "This book is already off your shelves.";
	if (result.response?.status === 400) return "Missing book details. Try removing again from the book page.";
	if (result.response && result.response.status >= 500) return "Server error while removing. Please retry.";
	if (result.error) return "Network error while removing. Please retry.";
	return "Failed to remove from shelves.";
}

export function resolveShelfSaveMessage(result: {
	ok: boolean;
	unauthorized?: boolean;
	response?: Response;
	data?: unknown;
	error?: unknown;
}) {
	if (result.ok) return "";
	const apiError = (result.data && typeof result.data === "object")
		? String(
			(result.data as Record<string, unknown>).detail
			|| (result.data as Record<string, unknown>).error
			|| ""
		).trim()
		: "";
	if (apiError) return apiError;
	if (result.unauthorized || result.response?.status === 401) return "Please log in to save books.";
	if (result.response?.status === 400) return "Invalid book data. Please try again.";
	if (result.response?.status === 409) return "Conflict while saving. Please retry.";
	if (result.response && result.response.status >= 500) return "Server error while saving. Please retry.";
	if (result.error) return "Network error while saving. Please retry.";
	return "Failed to save shelf entry.";
}

export async function saveShelfEntryWithRetry(
	entry: unknown,
	options?: { redirectPath?: string; retries?: number; retryDelayMs?: number }
) {
	const redirectPath = String(options?.redirectPath || "/settings#account-settings");
	const retries = Math.max(0, Number(options?.retries ?? 0) || 0);
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

export async function removeShelfEntryWithRetry(
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
			const result = await deleteShelfEntryFromServer(entry, redirectPath);
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
		message: resolveShelfSaveMessage(lastResult).replace("save", "remove")
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
	finishedReflection?: string;
	reviewTitle?: string;
	reviewSpoiler?: boolean;
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
		bookId: Math.max(0, Number(record.bookId || 0) || 0),
		title: payload.title,
		author: payload.author,
		description: payload.description,
		status,
		rating: null,
		totalPages,
		currentPage: Math.max(0, Number(options.currentPage ?? 0) || 0),
		finishedDate: String(options.finishedDate || "").trim(),
		finishedReflection: String(options.finishedReflection || "").trim().slice(0, 4000),
		reviewTitle: String(options.reviewTitle || "").trim().slice(0, 160),
		reviewSpoiler: options.reviewSpoiler === true,
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
