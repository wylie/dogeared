import { normalizeBookPayload } from "./bookPayload.ts";
import { normalizeReadingFormat, readingFormatLabel, type ReadingFormat } from "./readingFormats.ts";

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

export function isShelfActionBusy(dropdown: Element) {
	return dropdown instanceof HTMLElement && dropdown.dataset.shelfActionBusy === "true";
}

export function setShelfActionBusy(dropdown: Element, busy: boolean) {
	if (!(dropdown instanceof HTMLElement)) return;
	dropdown.dataset.shelfActionBusy = busy ? "true" : "false";
	dropdown.classList.toggle("is-saving", busy);
	dropdown.setAttribute("aria-busy", busy ? "true" : "false");
	for (const control of Array.from(dropdown.querySelectorAll('[data-action="toggle-shelf"], [role="menuitem"], .shelf-option'))) {
		if (control instanceof HTMLButtonElement) {
			control.disabled = busy;
			control.setAttribute("aria-disabled", busy ? "true" : "false");
		}
	}
}

export function normalizeRatingValue(value: unknown) {
	if (value === null || value === undefined || String(value).trim() === "") return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	const rounded = Math.floor(parsed);
	return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export function notifyReadingDataChanged() {
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

function ensureReadingFormatPromptStyles() {
	if (typeof document === "undefined" || document.getElementById("reading-format-prompt-styles")) return;
	const style = document.createElement("style");
	style.id = "reading-format-prompt-styles";
	style.textContent = `
		.reading-format-overlay {
			position: fixed;
			inset: 0;
			z-index: 20000;
			display: grid;
			place-items: center;
			padding: 1rem;
			background: rgba(34, 34, 34, 0.28);
		}
		.reading-format-dialog {
			width: min(420px, 100%);
			border-radius: var(--radius-lg, 12px);
			background: var(--color-surface, #fff);
			box-shadow: var(--shadow-popover, 0 18px 50px rgba(0, 0, 0, 0.18));
			padding: 1rem;
			color: var(--color-text, #222);
		}
		.reading-format-dialog h2 {
			margin: 0;
			font-size: 1.1rem;
			line-height: 1.25;
		}
		.reading-format-dialog p {
			margin: 0.35rem 0 0;
			color: var(--color-text-muted, #59636f);
			font-size: 0.92rem;
			line-height: 1.4;
		}
		.reading-format-options {
			display: grid;
			gap: 0.5rem;
			margin-top: 0.85rem;
		}
		.reading-format-option {
			width: 100%;
			min-height: 48px;
			border: 1px solid var(--color-border-soft, rgba(87, 117, 144, 0.28));
			border-radius: var(--radius-md, 10px);
			background: rgba(255, 255, 255, 0.74);
			color: var(--color-text, #222);
			font: inherit;
			font-weight: 750;
			display: flex;
			align-items: center;
			gap: 0.65rem;
			padding: 0.65rem 0.75rem;
			cursor: pointer;
			text-align: left;
		}
		.reading-format-option:hover,
		.reading-format-option:focus-visible {
			border-color: var(--color-primary, #1f7a45);
			background: rgba(191, 217, 171, 0.22);
		}
		.reading-format-option .material-icons {
			width: 28px;
			height: 28px;
			border-radius: 999px;
			display: inline-grid;
			place-items: center;
			background: rgba(87, 117, 144, 0.12);
			color: var(--color-nav, #1f5d87);
			font-size: 1.05rem;
			line-height: 1;
		}
		.reading-format-cancel {
			margin-top: 0.65rem;
			border: none;
			background: transparent;
			color: var(--color-text-muted, #59636f);
			font: inherit;
			font-weight: 700;
			cursor: pointer;
		}
	`;
	document.head.append(style);
}

export function promptForReadingFormat(defaultFormat: ReadingFormat = "physical"): Promise<ReadingFormat | "cancelled"> {
	if (typeof document === "undefined") return Promise.resolve(normalizeReadingFormat(defaultFormat));
	ensureReadingFormatPromptStyles();
	const existing = document.getElementById("reading-format-overlay");
	if (existing) existing.remove();
	const normalizedDefault = normalizeReadingFormat(defaultFormat);
	const options: Array<{ value: ReadingFormat; icon: string; label: string }> = [
		{ value: "physical", icon: "menu_book", label: "Physical Book" },
		{ value: "ebook", icon: "tablet_mac", label: "Ebook" },
		{ value: "audio", icon: "headphones", label: "Audiobook" }
	];
	return new Promise((resolve) => {
		const overlay = document.createElement("div");
		overlay.id = "reading-format-overlay";
		overlay.className = "reading-format-overlay";
		const dialog = document.createElement("div");
		dialog.className = "reading-format-dialog";
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");
		dialog.setAttribute("aria-labelledby", "reading-format-title");
		const title = document.createElement("h2");
		title.id = "reading-format-title";
		title.textContent = "How are you reading this book?";
		const hint = document.createElement("p");
		hint.textContent = `Default is ${readingFormatLabel(normalizedDefault)}.`;
		const optionWrap = document.createElement("div");
		optionWrap.className = "reading-format-options";
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") close("cancelled");
		};
		const close = (value: ReadingFormat | "cancelled") => {
			document.removeEventListener("keydown", onKeydown);
			overlay.remove();
			resolve(value);
		};
		for (const option of options) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "reading-format-option";
			button.dataset.readingFormat = option.value;
			button.setAttribute("aria-label", option.label);
			const icon = document.createElement("span");
			icon.className = "material-icons";
			icon.setAttribute("aria-hidden", "true");
			icon.textContent = option.icon;
			const label = document.createElement("span");
			label.textContent = option.label;
			button.append(icon, label);
			button.addEventListener("click", () => close(option.value));
			optionWrap.append(button);
		}
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "reading-format-cancel";
		cancel.textContent = "Cancel";
		cancel.addEventListener("click", () => close("cancelled"));
		overlay.addEventListener("click", (event) => {
			if (event.target === overlay) close("cancelled");
		});
		document.addEventListener("keydown", onKeydown);
		dialog.append(title, hint, optionWrap, cancel);
		overlay.append(dialog);
		document.body.append(overlay);
		const defaultButton = optionWrap.querySelector(`[data-reading-format="${normalizedDefault === "unknown" ? "physical" : normalizedDefault}"]`);
		(defaultButton instanceof HTMLElement ? defaultButton : optionWrap.querySelector("button"))?.focus();
	});
}

export async function prepareReadingFormatForShelfStatus(entry: Record<string, unknown>, status: string) {
	if (String(status || "").trim() !== "reading") return true;
	const existingFormat = normalizeReadingFormat(entry.readingFormat);
	if (existingFormat !== "unknown") return true;
	const selected = await promptForReadingFormat("physical");
	if (selected === "cancelled") return false;
	entry.readingFormat = selected;
	return true;
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
	const isBusy = /\b(saving|removing)\b/i.test(message);
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

function numericStyleValue(element: Element, property: string, fallback: number) {
	const rawValue = window.getComputedStyle(element).getPropertyValue(property).trim();
	const parsed = Number.parseFloat(rawValue);
	return Number.isFinite(parsed) ? parsed : fallback;
}

let activeShelfDropdown: HTMLElement | null = null;
let activeShelfMenu: HTMLElement | null = null;
let activeShelfTrigger: HTMLElement | null = null;

function getShelfMenu(dropdown: Element) {
	const localMenu = dropdown.querySelector(".shelf-menu");
	if (localMenu instanceof HTMLElement) return localMenu;
	return null;
}

export function resolveShelfDropdownFromTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return null;
	const localDropdown = target.closest(".shelf-dropdown");
	if (localDropdown instanceof HTMLElement) return localDropdown;
	return null;
}

export function isShelfDropdownOrMenuTarget(target: EventTarget | null) {
	return target instanceof Element
		&& (target.closest(".shelf-dropdown") instanceof HTMLElement || target.closest(".shelf-menu") instanceof HTMLElement);
}

function focusFirstShelfMenuItem(menu: HTMLElement) {
	const item = menu.querySelector('[role="menuitem"]:not(:disabled), .shelf-option:not(:disabled)');
	if (item instanceof HTMLElement) item.focus({ preventScroll: true });
}

function placeShelfMenu(trigger: HTMLElement, menu: HTMLElement) {
	if (menu.hidden) return;
	const margin = numericStyleValue(menu, "--shelf-menu-viewport-padding", 8);
	const gap = numericStyleValue(menu, "--shelf-menu-gap", 6);
	const viewport = window.visualViewport;
	const viewportWidth = viewport?.width ?? window.innerWidth;
	const viewportHeight = viewport?.height ?? window.innerHeight;
	const wrapper = trigger.closest(".shelf-button-wrapper");
	const anchor = wrapper instanceof HTMLElement ? wrapper : trigger;

	menu.removeAttribute("data-align");
	menu.removeAttribute("data-placement");
	menu.style.removeProperty("max-height");

	const anchorRect = anchor.getBoundingClientRect();
	const menuRect = menu.getBoundingClientRect();
	if (anchorRect.left + menuRect.width > viewportWidth - margin) {
		menu.dataset.align = "end";
	}

	const spaceBelow = viewportHeight - anchorRect.bottom - margin - gap;
	const spaceAbove = anchorRect.top - margin - gap;
	if (menuRect.height > spaceBelow && spaceAbove > spaceBelow) {
		menu.dataset.placement = "top";
		menu.style.maxHeight = `${Math.max(160, spaceAbove)}px`;
	} else {
		menu.dataset.placement = "bottom";
		menu.style.maxHeight = `${Math.max(160, spaceBelow)}px`;
	}
}

export function closeShelfMenus(shelfDropdowns: Element[], options?: { restoreFocus?: boolean }) {
	let focusTarget: HTMLElement | null = null;
	const shouldRestoreFocus = options?.restoreFocus === true || (
		activeShelfMenu instanceof HTMLElement
		&& document.activeElement instanceof Element
		&& activeShelfMenu.contains(document.activeElement)
	);
	const visitedDropdowns = new Set<Element>();
	for (const dropdown of shelfDropdowns) {
		visitedDropdowns.add(dropdown);
		const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
		const menu = getShelfMenu(dropdown);
		if (menu instanceof HTMLElement) {
			if (!menu.hidden && trigger instanceof HTMLElement) {
				focusTarget ||= activeShelfTrigger instanceof HTMLElement && dropdown.contains(activeShelfTrigger)
					? activeShelfTrigger
					: trigger;
			}
			menu.hidden = true;
			menu.removeAttribute("data-placement");
			menu.removeAttribute("data-align");
			menu.style.removeProperty("max-height");
		}
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
		if (activeShelfTrigger instanceof HTMLElement && dropdown.contains(activeShelfTrigger)) activeShelfTrigger = null;
	}
	if (activeShelfDropdown && !visitedDropdowns.has(activeShelfDropdown)) {
		const trigger = activeShelfDropdown.querySelector('[data-action="toggle-shelf"]');
		if (activeShelfMenu) {
			if (!activeShelfMenu.hidden && trigger instanceof HTMLElement) focusTarget ||= trigger;
			activeShelfMenu.hidden = true;
			activeShelfMenu.removeAttribute("data-placement");
			activeShelfMenu.removeAttribute("data-align");
			activeShelfMenu.style.removeProperty("max-height");
		}
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
	}
	activeShelfTrigger = null;
	activeShelfDropdown = null;
	activeShelfMenu = null;
	if (shouldRestoreFocus) focusTarget?.focus({ preventScroll: true });
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
		button.setAttribute("role", "menuitem");
		button.innerHTML = `<span class="material-icons shelf-option-icon" aria-hidden="true">${shelf.icon}</span><span>${shelf.name}</span>`;
		optionsWrap.append(button);
	}
	dropdown.dataset.customShelvesLoaded = "true";
}

export async function toggleShelfMenu(dropdown: Element, shelfDropdowns: Element[]) {
	const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
	const menu = getShelfMenu(dropdown);
	if (!(dropdown instanceof HTMLElement) || !(trigger instanceof HTMLElement) || !(menu instanceof HTMLElement)) return;
	await ensureCustomShelfOptions(dropdown);
	const willOpen = menu.hidden;
	closeShelfMenus(shelfDropdowns);
	if (willOpen) {
		activeShelfTrigger = trigger;
		activeShelfDropdown = dropdown;
		activeShelfMenu = menu;
		menu.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
		placeShelfMenu(trigger, menu);
		window.requestAnimationFrame(() => {
			if (activeShelfTrigger === trigger && activeShelfMenu === menu) placeShelfMenu(trigger, menu);
		});
	} else {
		menu.hidden = true;
		trigger.setAttribute("aria-expanded", "false");
	}
}

if (typeof document !== "undefined") {
	document.addEventListener("keydown", (event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (event.key === "Escape") {
			const dropdowns = Array.from(document.querySelectorAll(".shelf-dropdown"));
			if (dropdowns.some((dropdown) => {
				const menu = dropdown.querySelector(".shelf-menu");
				return menu instanceof HTMLElement && !menu.hidden;
			})) {
				event.preventDefault();
				closeShelfMenus(dropdowns, { restoreFocus: true });
			}
			return;
		}
		if (event.key !== "ArrowDown" || !(target instanceof HTMLElement)) return;
		const trigger = target.closest('[data-action="toggle-shelf"]');
		if (!(trigger instanceof HTMLElement)) return;
		const dropdown = trigger.closest(".shelf-dropdown");
		const menu = dropdown?.querySelector(".shelf-menu");
		if (!(dropdown instanceof HTMLElement) || !(menu instanceof HTMLElement) || menu.hidden) return;
		event.preventDefault();
		focusFirstShelfMenuItem(menu);
	});
	document.addEventListener("keydown", (event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		const menu = target?.closest(".shelf-menu");
		if (!(menu instanceof HTMLElement)) return;
		const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled), .shelf-option:not(:disabled)'))
			.filter((item): item is HTMLElement => item instanceof HTMLElement);
		if (items.length === 0) return;
		const currentIndex = Math.max(0, items.indexOf(target as HTMLElement));
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const direction = event.key === "ArrowDown" ? 1 : -1;
			items[(currentIndex + direction + items.length) % items.length]?.focus({ preventScroll: true });
		}
		if (event.key === "Home") {
			event.preventDefault();
			items[0]?.focus({ preventScroll: true });
		}
		if (event.key === "End") {
			event.preventDefault();
			items[items.length - 1]?.focus({ preventScroll: true });
		}
	});
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

const inFlightShelfMutations = new Map<string, Promise<{
	ok: boolean;
	unauthorized?: boolean;
	response?: Response;
	data?: unknown;
	error?: unknown;
	message?: string;
}>>();

function shelfMutationKey(action: string, entry: unknown) {
	if (!entry || typeof entry !== "object") return `${action}:unknown`;
	const record = entry as Record<string, unknown>;
	return JSON.stringify({
		action,
		bookId: Math.max(0, Number(record.bookId || 0) || 0),
		title: String(record.title || "").trim().toLowerCase(),
		author: String(record.author || "").trim().toLowerCase(),
		status: String(record.status || "").trim(),
		readingFormat: normalizeReadingFormat(record.readingFormat),
		isbn10: String(record.isbn10 || "").trim().toUpperCase(),
		isbn13: String(record.isbn13 || "").trim().toUpperCase(),
		googleBooksId: String(record.googleBooksId || "").trim(),
		source: String(record.source || "").trim(),
		sourceWorkId: String(record.sourceWorkId || "").trim(),
		sourceEditionId: String(record.sourceEditionId || "").trim()
	});
}

export async function saveShelfEntryWithRetry(
	entry: unknown,
	options?: { redirectPath?: string; retries?: number; retryDelayMs?: number }
) {
	const mutationKey = shelfMutationKey("save", entry);
	const existingMutation = inFlightShelfMutations.get(mutationKey);
	if (existingMutation) return existingMutation;
	const mutation = saveShelfEntryWithRetryUncached(entry, options);
	inFlightShelfMutations.set(mutationKey, mutation);
	try {
		return await mutation;
	} finally {
		inFlightShelfMutations.delete(mutationKey);
	}
}

async function saveShelfEntryWithRetryUncached(
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
	const mutationKey = shelfMutationKey("remove", entry);
	const existingMutation = inFlightShelfMutations.get(mutationKey);
	if (existingMutation) return existingMutation;
	const mutation = removeShelfEntryWithRetryUncached(entry, options);
	inFlightShelfMutations.set(mutationKey, mutation);
	try {
		return await mutation;
	} finally {
		inFlightShelfMutations.delete(mutationKey);
	}
}

async function removeShelfEntryWithRetryUncached(
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
	preferredProgressType?: string;
	progressType?: string;
	readingFormat?: string;
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
		preferredProgressType: String(options.preferredProgressType ?? options.progressType ?? "").trim(),
		readingFormat: normalizeReadingFormat(options.readingFormat),
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
