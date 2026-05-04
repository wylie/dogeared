type ProfileEntry = {
	id: string;
	bookId?: number;
	title: string;
	author?: string;
	format?: string;
	language?: string;
	publishedDate?: string;
	totalPages?: number;
	currentPage?: number;
	status: string;
	finishedDate?: string;
	rating?: number;
	isbn10?: string;
	isbn13?: string;
	coverUrl?: string;
};

type RenderOptions = {
	escapeHtml: (value: unknown) => string;
	formatPublishedLabel: (value: string) => string;
	formatFinishedLabel: (value: string) => string;
	progressPercent: (entry: ProfileEntry) => number;
	normalizeNumber: (value: unknown) => number;
	normalizeRating: (value: unknown) => number;
	renderRatingStars: (value: number, interactive?: boolean) => string;
	coverFromIsbn: (isbn13: unknown, isbn10: unknown) => string;
	pendingFinishEntryId: string;
	pendingFinishRating: number;
};

export function renderProfileBookCard(entry: ProfileEntry, options: RenderOptions) {
	const {
		escapeHtml,
		formatPublishedLabel,
		formatFinishedLabel,
		progressPercent,
		normalizeNumber,
		normalizeRating,
		renderRatingStars,
		coverFromIsbn,
		pendingFinishEntryId,
		pendingFinishRating
	} = options;

	const titleHref = `/book?bookId=${encodeURIComponent(String(entry.bookId || 0))}&isbn13=${encodeURIComponent(String(entry.isbn13 || ""))}&isbn10=${encodeURIComponent(String(entry.isbn10 || ""))}&title=${encodeURIComponent(String(entry.title || ""))}&author=${encodeURIComponent(String(entry.author || ""))}`;
	const authorName = String(entry.author || "").trim();
	const authorSlug = authorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	const author = entry.author
		? `<p class="meta"><a class="author-link" href="/author/${encodeURIComponent(authorSlug)}?name=${encodeURIComponent(authorName)}">${escapeHtml(entry.author)}</a></p>`
		: "";
	const formatMeta = entry.format ? `<p class="meta">${escapeHtml(entry.format)}${entry.language ? ` • ${escapeHtml(String(entry.language).toUpperCase())}` : ""}</p>` : "";
	const publishedMeta = entry.publishedDate ? `<p class="meta">Published: ${escapeHtml(formatPublishedLabel(entry.publishedDate))}</p>` : "";
	const total = normalizeNumber(entry.totalPages);
	const current = normalizeNumber(entry.currentPage);
	const rating = normalizeRating(entry.rating);
	const percent = progressPercent(entry);
	const progress = (entry.status !== "want_to_read" && total > 0)
		? `<div class="progress-wrap"><div class="progress-bar" style="width:${percent}%"></div></div><p class="meta">${current}/${total} pages (${percent}%)</p>`
		: "";
	const progressEditor = entry.status === "reading"
		? `<div class="progress-editor">
			<label class="progress-label" for="progress-${escapeHtml(entry.id)}">Update progress</label>
			<div class="progress-controls">
				<input
					id="progress-${escapeHtml(entry.id)}"
					class="progress-input"
					type="number"
					min="0"
					${total > 0 ? `max="${total}"` : ""}
					step="1"
					inputmode="numeric"
					placeholder="Page #"
					value="${current}"
				/>
				<button type="button" class="secondary progress-save" data-action="update-progress">Save</button>
			</div>
		</div>`
		: "";
	const finishedDate = entry.finishedDate
		? `<p class="meta">Finished: ${escapeHtml(formatFinishedLabel(entry.finishedDate))}</p>`
		: "";
	const coverUrl = entry.coverUrl || coverFromIsbn(entry.isbn13, entry.isbn10);
	const cover = coverUrl
		? `<img class="cover" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" data-cover-image onerror="this.hidden=true; if (this.nextElementSibling) this.nextElementSibling.hidden=false;" />
		   <div class="cover cover-placeholder" data-cover-placeholder hidden>
			   <span class="material-icons cover-placeholder-icon" aria-hidden="true">menu_book</span>
		   </div>`
		: `<div class="cover cover-placeholder">
			<span class="material-icons cover-placeholder-icon" aria-hidden="true">menu_book</span>
		</div>`;
	const actionButtons = [
		entry.status === "want_to_read" ? `<button type="button" data-action="start" class="secondary">Start Reading</button>` : "",
		entry.status === "reading" ? `<button type="button" data-action="finish" class="secondary">Mark Finished</button>` : ""
	].filter(Boolean).join("");
	const inlineActions = actionButtons
		? `<div class="card-actions"><div class="entry-actions">${actionButtons}</div></div>`
		: "";
	const finishPrompt = entry.status === "reading" && pendingFinishEntryId === entry.id
		? `<div class="rating-block finish-rating-block">
			<p class="rating-label">Rate this book before moving it to Read</p>
			<div class="rating-stars">${renderRatingStars(pendingFinishRating, true)}</div>
			<div class="entry-actions finish-rating-actions">
				<button type="button" class="secondary" data-action="cancel-finish">Cancel</button>
				<button type="button" data-action="confirm-finish" ${pendingFinishRating > 0 ? "" : "disabled"}>Save Rating & Move to Read</button>
			</div>
		</div>`
		: "";
	const ratingBlock = entry.status === "finished"
		? `<div class="rating-block">
			<p class="rating-label">${rating > 0 ? `Your rating: ${rating}/5` : "Rate this book"}</p>
			<div class="rating-stars">${renderRatingStars(rating, true)}</div>
		</div>`
		: "";

	return `
		<article class="entry-card book-card" data-id="${escapeHtml(entry.id)}">
			<div class="card-menu-wrap">
				<button type="button" class="card-menu-trigger" data-action="toggle-card-menu" aria-expanded="false" aria-label="More actions">
					<span class="material-icons" aria-hidden="true">more_vert</span>
				</button>
				<div class="card-menu" hidden>
					<p class="card-menu-label">Move to shelf</p>
					<button type="button" class="card-menu-item" data-action="move-shelf" data-status="want_to_read">Want to Read</button>
					<button type="button" class="card-menu-item" data-action="move-shelf" data-status="reading">Currently Reading</button>
					<button type="button" class="card-menu-item" data-action="move-shelf" data-status="finished">Read</button>
					<div class="card-menu-divider"></div>
					<button type="button" class="card-menu-item danger-text" data-action="delete">Delete</button>
				</div>
			</div>
			<div class="cover-wrap">
				${cover}
			</div>
			<div class="card-body">
				<h3><a href="${escapeHtml(titleHref)}">${escapeHtml(entry.title)}</a></h3>
				${author}
				${formatMeta}
				${publishedMeta}
				${progress}
				${progressEditor}
				${finishedDate}
				${finishPrompt}
				${ratingBlock}
				${inlineActions}
			</div>
		</article>
	`;
}
