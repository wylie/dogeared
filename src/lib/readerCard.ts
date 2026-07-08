import { authorHref } from "./author";
import type { PublicReaderSuggestion } from "./feed";

type ReaderCardAction = "follow" | "unfollow";

type ReaderCardOptions = {
	action?: ReaderCardAction;
	extraClass?: string;
	extraAttrs?: Record<string, string | boolean | undefined>;
};

function escapeHtml(value: unknown) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown) {
	return escapeHtml(value);
}

function profileHref(username: string) {
	return `/profile/${encodeURIComponent(username)}`;
}

function favoriteBookHref(reader: PublicReaderSuggestion) {
	const title = String(reader.favoriteBook || "").trim();
	if (!title) return "";
	const author = String(reader.favoriteAuthor || "").trim();
	return `/book?title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ""}`;
}

function renderExtraAttrs(attrs: ReaderCardOptions["extraAttrs"] = {}) {
	return Object.entries(attrs)
		.filter(([, value]) => value !== false && value !== undefined)
		.map(([key, value]) => value === true ? escapeAttribute(key) : `${escapeAttribute(key)}="${escapeAttribute(value)}"`)
		.join(" ");
}

export function renderReaderCardHtml(reader: PublicReaderSuggestion, options: ReaderCardOptions = {}) {
	const username = String(reader.username || "").trim();
	if (!username) return "";
	const action = options.action || "follow";
	const actionLabel = action === "unfollow" ? "Unfollow" : "Follow";
	const actionName = action === "unfollow" ? "unfollow-reader" : "follow-reader";
	const extraClass = String(options.extraClass || "").trim();
	const attrs = renderExtraAttrs(options.extraAttrs);
	const classes = `people-strip-card${extraClass ? ` ${extraClass}` : ""}`;
	const name = String(reader.name || "").trim();
	const avatar = String(reader.avatar || "").trim();
	const bookHref = favoriteBookHref(reader);
	const favoriteAuthor = String(reader.favoriteAuthor || "").trim();

	return `
		<li class="${escapeAttribute(classes)}" data-reader-card${attrs ? ` ${attrs}` : ""}>
			<div class="people-strip-top">
				<a class="people-strip-avatar-link" href="${profileHref(username)}" aria-label="View ${escapeAttribute(username)}'s profile">
					${avatar
						? `<img src="${escapeAttribute(avatar)}" alt="" class="people-strip-avatar" loading="lazy" decoding="async" width="54" height="54">`
						: `<span class="people-strip-avatar people-strip-avatar-fallback" aria-hidden="true">@</span>`}
				</a>
				<button type="button" class="follow-button follow-button-small" data-action="${actionName}" data-username="${escapeAttribute(username)}">${actionLabel}</button>
			</div>
			<a class="people-strip-name" href="${profileHref(username)}">
				<strong>${escapeHtml(name || `@${username}`)}</strong>
				<span>@${escapeHtml(username)}</span>
			</a>
			${reader.blurb ? `<p>${escapeHtml(reader.blurb)}</p>` : ""}
			<div class="people-strip-facts">
				${reader.location ? `<p><strong>Location:</strong> ${escapeHtml(reader.location)}</p>` : ""}
				${reader.readingGoal ? `<p><strong>Goal:</strong> ${escapeHtml(reader.readingGoal)}</p>` : ""}
				${reader.favoriteBook && bookHref ? `<p><strong>Favorite book:</strong> <a href="${escapeAttribute(bookHref)}">${escapeHtml(reader.favoriteBook)}</a></p>` : ""}
				${favoriteAuthor ? `<p><strong>Favorite author:</strong> <a href="${escapeAttribute(authorHref(favoriteAuthor, 0))}">${escapeHtml(favoriteAuthor)}</a></p>` : ""}
			</div>
			<p class="reader-feedback" data-reader-feedback role="status" aria-live="polite" hidden></p>
		</li>
	`;
}

export function renderReaderCardsHtml(readers: PublicReaderSuggestion[], options: ReaderCardOptions = {}) {
	return readers.map((reader) => renderReaderCardHtml(reader, options)).join("");
}
