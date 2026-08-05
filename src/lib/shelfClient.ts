import {
	arrow,
	autoUpdate,
	computePosition,
	flip,
	offset,
	shift
} from "@floating-ui/dom";
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

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

type ShelfMenuViewport = {
	width: number;
	height: number;
};

let activeShelfAnchor: HTMLElement | null = null;
let activeShelfDropdown: HTMLElement | null = null;
let activeShelfMenu: HTMLElement | null = null;
let cleanupShelfMenuAutoUpdate: (() => void) | null = null;
let shelfDropdownIdCounter = 0;
const shelfMenuOrigins = new WeakMap<HTMLElement, { parent: Node; nextSibling: ChildNode | null }>();

function shelfMenuViewport(): ShelfMenuViewport {
	const viewport = window.visualViewport;
	return {
		width: viewport?.width ?? window.innerWidth,
		height: viewport?.height ?? window.innerHeight
	};
}

function isTriggerInViewport(rect: DOMRect, viewport: ShelfMenuViewport) {
	return rect.width > 0
		&& rect.height > 0
		&& rect.bottom > 0
		&& rect.right > 0
		&& rect.top < viewport.height
		&& rect.left < viewport.width;
}

function getShelfMenu(dropdown: Element) {
	const localMenu = dropdown.querySelector(".shelf-menu");
	if (localMenu instanceof HTMLElement) return localMenu;
	const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
	const menuId = trigger instanceof HTMLElement ? trigger.getAttribute("aria-controls") : "";
	const controlledMenu = menuId ? document.getElementById(menuId) : null;
	return controlledMenu instanceof HTMLElement && controlledMenu.classList.contains("shelf-menu")
		? controlledMenu
		: null;
}

function getShelfDropdownId(dropdown: HTMLElement) {
	if (!dropdown.dataset.shelfDropdownId) {
		shelfDropdownIdCounter += 1;
		dropdown.dataset.shelfDropdownId = `shelf-dropdown-${shelfDropdownIdCounter}`;
	}
	return dropdown.dataset.shelfDropdownId;
}

function portalShelfMenu(dropdown: HTMLElement, menu: HTMLElement) {
	if (!shelfMenuOrigins.has(menu) && menu.parentNode) {
		shelfMenuOrigins.set(menu, {
			parent: menu.parentNode,
			nextSibling: menu.nextSibling
		});
	}
	menu.dataset.shelfDropdownId = getShelfDropdownId(dropdown);
	menu.dataset.shelfPortal = "true";
	if (menu.parentNode !== document.body) document.body.append(menu);
}

function restoreShelfMenu(menu: HTMLElement) {
	const origin = shelfMenuOrigins.get(menu);
	delete menu.dataset.shelfDropdownId;
	delete menu.dataset.shelfPortal;
	menu.style.removeProperty("position");
	menu.style.removeProperty("left");
	menu.style.removeProperty("top");
	menu.style.removeProperty("min-width");
	menu.style.removeProperty("max-width");
	menu.style.removeProperty("max-height");
	if (!origin || menu.parentNode !== document.body) return;
	if (origin.nextSibling && origin.nextSibling.parentNode === origin.parent) {
		origin.parent.insertBefore(menu, origin.nextSibling);
	} else {
		origin.parent.appendChild(menu);
	}
}

function ensureShelfMenuCaret(menu: HTMLElement) {
	const existing = menu.querySelector(".shelf-menu-caret");
	if (existing instanceof HTMLElement) return existing;
	const caret = document.createElement("span");
	caret.className = "shelf-menu-caret";
	caret.setAttribute("aria-hidden", "true");
	menu.prepend(caret);
	return caret;
}

export function resolveShelfDropdownFromTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return null;
	const localDropdown = target.closest(".shelf-dropdown");
	if (localDropdown instanceof HTMLElement) return localDropdown;
	const menu = target.closest(".shelf-menu");
	if (!(menu instanceof HTMLElement)) return null;
	const dropdownId = menu.dataset.shelfDropdownId || "";
	if (dropdownId) {
		const dropdown = document.querySelector(`[data-shelf-dropdown-id="${CSS.escape(dropdownId)}"]`);
		if (dropdown instanceof HTMLElement) return dropdown;
	}
	return activeShelfMenu === menu ? activeShelfDropdown : null;
}

export function isShelfDropdownOrMenuTarget(target: EventTarget | null) {
	return target instanceof Element
		&& (target.closest(".shelf-dropdown") instanceof HTMLElement || target.closest(".shelf-menu") instanceof HTMLElement);
}

function focusFirstShelfMenuItem(menu: HTMLElement) {
	const item = menu.querySelector('[role="menuitem"]:not(:disabled), .shelf-option:not(:disabled)');
	if (item instanceof HTMLElement) item.focus({ preventScroll: true });
}

async function positionShelfMenu(anchor: HTMLElement, menu: HTMLElement) {
	if (menu.hidden) return;
	const viewport = shelfMenuViewport();
	const margin = numericStyleValue(menu, "--shelf-menu-viewport-padding", 8);
	const safeTop = numericStyleValue(menu, "--shelf-safe-area-top", 0);
	const safeRight = numericStyleValue(menu, "--shelf-safe-area-right", 0);
	const safeBottom = numericStyleValue(menu, "--shelf-safe-area-bottom", 0);
	const safeLeft = numericStyleValue(menu, "--shelf-safe-area-left", 0);
	const gap = numericStyleValue(menu, "--shelf-menu-gap", 6);
	const triggerRect = anchor.getBoundingClientRect();

	if (!isTriggerInViewport(triggerRect, viewport)) {
		closeShelfMenus(Array.from(document.querySelectorAll(".shelf-dropdown")));
		return;
	}

	const availableWidth = Math.max(0, viewport.width - safeLeft - safeRight - margin * 2);
	const availableHeight = Math.max(0, viewport.height - safeTop - safeBottom - margin * 2);
	menu.style.minWidth = `${Math.min(180, availableWidth)}px`;
	menu.style.maxWidth = `${availableWidth}px`;
	menu.style.maxHeight = `${availableHeight}px`;
	const caret = ensureShelfMenuCaret(menu);
	const collisionPadding = {
		top: safeTop + margin,
		right: safeRight + margin,
		bottom: safeBottom + margin,
		left: safeLeft + margin
	};
	const { x, y, placement, middlewareData } = await computePosition(anchor, menu, {
		placement: "bottom-start",
		strategy: "fixed",
		middleware: [
			offset(gap),
			flip({ padding: collisionPadding }),
			shift({ padding: collisionPadding }),
			arrow({ element: caret, padding: 12 })
		]
	});
	const side = placement.split("-")[0] || "bottom";
	const staticSide: Record<string, string> = {
		top: "bottom",
		right: "left",
		bottom: "top",
		left: "right"
	};
	Object.assign(menu.style, {
		position: "fixed",
		left: `${Math.round(x)}px`,
		top: `${Math.round(y)}px`
	});
	menu.dataset.placement = side;
	Object.assign(caret.style, {
		left: middlewareData.arrow?.x != null ? `${Math.round(middlewareData.arrow.x)}px` : "",
		top: middlewareData.arrow?.y != null ? `${Math.round(middlewareData.arrow.y)}px` : "",
		right: "",
		bottom: ""
	});
	const caretStaticSide = staticSide[side];
	if (caretStaticSide) caret.style.setProperty(caretStaticSide, "calc(var(--shelf-menu-caret-size) / -2)");
}

function repositionOpenShelfMenu() {
	if (typeof document === "undefined") return;
	if (
		!(activeShelfAnchor instanceof HTMLElement)
		|| !(activeShelfMenu instanceof HTMLElement)
		|| !activeShelfAnchor.isConnected
		|| !activeShelfMenu.isConnected
	) {
		closeShelfMenus(Array.from(document.querySelectorAll(".shelf-dropdown")));
		return;
	}
	if (!activeShelfDropdown?.contains(activeShelfAnchor) || activeShelfMenu.hidden) {
		activeShelfAnchor = null;
		activeShelfDropdown = null;
		activeShelfMenu = null;
		stopShelfMenuTracking();
		return;
	}
	void positionShelfMenu(activeShelfAnchor, activeShelfMenu);
}

function startShelfMenuTracking() {
	if (!(activeShelfAnchor instanceof HTMLElement) || !(activeShelfMenu instanceof HTMLElement)) return;
	stopShelfMenuTracking();
	cleanupShelfMenuAutoUpdate = autoUpdate(activeShelfAnchor, activeShelfMenu, repositionOpenShelfMenu, {
		ancestorScroll: true,
		ancestorResize: true,
		elementResize: true,
		layoutShift: true
	});
}

function stopShelfMenuTracking() {
	cleanupShelfMenuAutoUpdate?.();
	cleanupShelfMenuAutoUpdate = null;
}

export function closeShelfMenus(shelfDropdowns: Element[], options?: { restoreFocus?: boolean }) {
	stopShelfMenuTracking();
	let focusTarget: HTMLElement | null = null;
	const visitedDropdowns = new Set<Element>();
	for (const dropdown of shelfDropdowns) {
		visitedDropdowns.add(dropdown);
		const trigger = dropdown.querySelector('[data-action="toggle-shelf"]');
		const menu = getShelfMenu(dropdown);
		if (menu instanceof HTMLElement) {
			if (!menu.hidden && trigger instanceof HTMLElement) {
				focusTarget ||= activeShelfAnchor instanceof HTMLElement && dropdown.contains(activeShelfAnchor)
					? activeShelfAnchor
					: trigger;
			}
			menu.hidden = true;
			menu.removeAttribute("data-placement");
			restoreShelfMenu(menu);
		}
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
		if (activeShelfAnchor instanceof HTMLElement && dropdown.contains(activeShelfAnchor)) activeShelfAnchor = null;
	}
	if (activeShelfDropdown && !visitedDropdowns.has(activeShelfDropdown)) {
		const trigger = activeShelfDropdown.querySelector('[data-action="toggle-shelf"]');
		if (activeShelfMenu) {
			if (!activeShelfMenu.hidden && trigger instanceof HTMLElement) focusTarget ||= trigger;
			activeShelfMenu.hidden = true;
			activeShelfMenu.removeAttribute("data-placement");
			restoreShelfMenu(activeShelfMenu);
		}
		if (trigger instanceof HTMLElement) trigger.setAttribute("aria-expanded", "false");
	}
	activeShelfAnchor = null;
	activeShelfDropdown = null;
	activeShelfMenu = null;
	if (options?.restoreFocus) focusTarget?.focus({ preventScroll: true });
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
		activeShelfAnchor = trigger;
		activeShelfDropdown = dropdown;
		activeShelfMenu = menu;
		portalShelfMenu(dropdown, menu);
		menu.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
		startShelfMenuTracking();
		await positionShelfMenu(trigger, menu);
		window.requestAnimationFrame(() => {
			if (activeShelfAnchor === trigger && activeShelfMenu === menu) void positionShelfMenu(trigger, menu);
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
