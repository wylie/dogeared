import { canonicalCatalogWorkKey, canonicalizeCatalogTitle, normalizeCatalogIsbn, normalizeCatalogText } from "./catalogKeys.ts";
import { normalizeRedundantEditionTitle, normalizeRedundantSeriesTitle } from "./canonicalTitles.ts";
import { ensureCanonicalWorkSchema } from "./catalogWorks.ts";
import { ensureBookCoverEnrichmentSchema } from "./bookCoverEnrichment.ts";
import { ensureCollectionSchema } from "./collections.ts";
import { ensureCustomShelfSchema } from "./customShelves.ts";
import { ensureReadingJournalSchema } from "./readingJournal.ts";
import { ensureSeriesSchema, inferKnownSeriesMetadata, upsertKnownSeriesForBook } from "./series.ts";
import { normalizeCanonicalSeriesTitles } from "./canonicalTitleCleanup.ts";
import type { getNeonSql } from "./neon.ts";

type Sql = ReturnType<typeof getNeonSql>;

export type WorkNormalizationBook = {
	bookId: number;
	workId: number;
	title: string;
	normalizedTitle: string;
	author: string;
	canonicalWorkKey: string;
	workKey: string;
	seriesName: string;
	seriesBookOrder: number;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	sourceKeys: string[];
	editionKeys: string[];
	shelfCount: number;
	ratingCount: number;
	reviewCount: number;
	activityCount: number;
	hasCover: boolean;
	hasDescription: boolean;
	hasRedundantSeriesSuffix: boolean;
	hasRedundantEditionSuffix: boolean;
};

export type PotentialDuplicateWorkGroup = {
	groupKey: string;
	confidenceScore: number;
	reasons: string[];
	target: WorkNormalizationBook;
	duplicates: WorkNormalizationBook[];
	books: WorkNormalizationBook[];
};

export type CanonicalWorkNormalizationResult = {
	knownSeriesChecked: number;
	knownSeriesAttached: number;
	workKeysChecked: number;
	workKeysRepaired: number;
	editionsAttached: number;
	titlesChecked: number;
	titlesUpdated: number;
	seriesPlaceholdersRemoved: number;
	duplicateGroupsChecked: number;
	worksMerged: number;
	metadataConflictsRemaining: number;
	messages: string[];
};

type WorkCandidateRow = {
	book_id: number;
	work_id: number | null;
	title: string;
	primary_author: string;
	canonical_work_key: string;
	work_key: string;
	series_name: string;
	series_book_order: number | null;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	source_keys: string[] | null;
	edition_keys: string[] | null;
	shelf_count: number;
	rating_count: number;
	review_count: number;
	activity_count: number;
	has_cover: boolean;
	has_description: boolean;
	updated_at: string;
};

type WorkRekeyRow = {
	id: number;
	work_id: number | null;
	title: string;
	primary_author: string;
	author_id: number | null;
	synopsis: string;
	cover_url: string;
	published_year: number | null;
	page_count: number | null;
	language: string;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	publisher: string;
	current_work_key: string;
	canonical_work_key: string;
	series_id: number | null;
	series_name: string;
	series_book_order: number | null;
	shelf_count: number;
	rating_count: number;
};

function numeric(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function textArray(value: unknown) {
	return Array.isArray(value) ? value.map((item) => normalizeCatalogText(item)).filter(Boolean) : [];
}

function normalizedBookFromRow(row: WorkCandidateRow): WorkNormalizationBook {
	const title = normalizeCatalogText(row.title);
	const seriesName = normalizeCatalogText(row.series_name);
	const seriesBookOrder = numeric(row.series_book_order);
	const titleCleanup = normalizeRedundantSeriesTitle({
		title,
		seriesName,
		bookOrder: seriesBookOrder
	});
	const editionTitleCleanup = normalizeRedundantEditionTitle({ title: titleCleanup.title || title });
	const normalizedTitle = editionTitleCleanup.title || titleCleanup.title || title;
	const author = normalizeCatalogText(row.primary_author);
	return {
		bookId: numeric(row.book_id),
		workId: numeric(row.work_id),
		title,
		normalizedTitle,
		author,
		canonicalWorkKey: normalizeCatalogText(row.canonical_work_key),
		workKey: normalizeCatalogText(row.work_key),
		seriesName,
		seriesBookOrder,
		isbn10: normalizeCatalogIsbn(row.isbn10),
		isbn13: normalizeCatalogIsbn(row.isbn13),
		googleBooksId: normalizeCatalogText(row.google_books_id),
		sourceKeys: textArray(row.source_keys),
		editionKeys: textArray(row.edition_keys),
		shelfCount: numeric(row.shelf_count),
		ratingCount: numeric(row.rating_count),
		reviewCount: numeric(row.review_count),
		activityCount: numeric(row.activity_count),
		hasCover: row.has_cover === true,
		hasDescription: row.has_description === true,
		hasRedundantSeriesSuffix: titleCleanup.changed,
		hasRedundantEditionSuffix: editionTitleCleanup.changed
	};
}

function readerSignal(book: WorkNormalizationBook) {
	return book.shelfCount * 8 + book.reviewCount * 6 + book.ratingCount * 4 + book.activityCount * 2;
}

function metadataSignal(book: WorkNormalizationBook) {
	return (book.seriesName && book.seriesBookOrder > 0 ? 6 : 0)
		+ (book.hasCover ? 3 : 0)
		+ (book.hasDescription ? 2 : 0)
		+ (book.isbn13 || book.isbn10 ? 2 : 0)
		+ (book.googleBooksId ? 2 : 0)
		+ (book.hasRedundantSeriesSuffix || book.hasRedundantEditionSuffix ? -4 : 0);
}

function chooseTarget(books: WorkNormalizationBook[]) {
	return [...books].sort((a, b) => (
		readerSignal(b) - readerSignal(a)
		|| metadataSignal(b) - metadataSignal(a)
		|| Number(a.hasRedundantSeriesSuffix || a.hasRedundantEditionSuffix) - Number(b.hasRedundantSeriesSuffix || b.hasRedundantEditionSuffix)
		|| a.bookId - b.bookId
	))[0];
}

function sharedSignalCount(books: WorkNormalizationBook[], key: keyof Pick<WorkNormalizationBook, "isbn10" | "isbn13" | "googleBooksId">) {
	const counts = new Map<string, number>();
	for (const book of books) {
		const value = normalizeCatalogText(book[key]);
		if (!value) continue;
		counts.set(value, (counts.get(value) || 0) + 1);
	}
	return Math.max(0, ...Array.from(counts.values()));
}

function hasSharedSourceKey(books: WorkNormalizationBook[]) {
	const counts = new Map<string, number>();
	for (const book of books) {
		for (const key of book.sourceKeys) {
			counts.set(key, (counts.get(key) || 0) + 1);
		}
	}
	return Array.from(counts.values()).some((count) => count > 1);
}

function hasSharedEditionKey(books: WorkNormalizationBook[]) {
	const counts = new Map<string, number>();
	for (const book of books) {
		for (const key of book.editionKeys) {
			counts.set(key, (counts.get(key) || 0) + 1);
		}
	}
	return Array.from(counts.values()).some((count) => count > 1);
}

function sameSeriesPosition(books: WorkNormalizationBook[]) {
	const keys = new Set(books.map((book) => (
		book.seriesName && book.seriesBookOrder > 0
			? `${canonicalizeCatalogTitle(book.seriesName)}:${book.seriesBookOrder}`
			: ""
	)).filter(Boolean));
	return keys.size === 1;
}

function sameExistingWork(books: WorkNormalizationBook[]) {
	const workIds = new Set(books.map((book) => book.workId).filter((workId) => workId > 0));
	return workIds.size === 1;
}

export function scorePotentialDuplicateBooks(books: WorkNormalizationBook[]) {
	let score = 65;
	const reasons = ["Same canonical title and author."];
	if (sameSeriesPosition(books)) {
		score += 35;
		reasons.push("Same structured series and book number.");
	}
	if (sameExistingWork(books)) {
		score += 35;
		reasons.push("Already attached to the same canonical Work.");
	}
	if (sharedSignalCount(books, "isbn13") > 1 || sharedSignalCount(books, "isbn10") > 1) {
		score += 25;
		reasons.push("Shared ISBN evidence.");
	}
	if (sharedSignalCount(books, "googleBooksId") > 1 || hasSharedSourceKey(books)) {
		score += 25;
		reasons.push("Shared external provider identifier.");
	}
	if (hasSharedEditionKey(books)) {
		score += 20;
		reasons.push("Shared edition key.");
	}
	if (books.some((book) => book.hasRedundantSeriesSuffix)) {
		score += 15;
		reasons.push("One title only differs by redundant series metadata.");
	}
	if (books.some((book) => book.hasRedundantEditionSuffix)) {
		score += 15;
		reasons.push("One title only differs by redundant edition metadata.");
	}
	return { score: Math.min(100, score), reasons };
}

export function buildPotentialDuplicateWorkGroups(books: WorkNormalizationBook[], ignoredPairs: Set<string> = new Set()) {
	const byKey = new Map<string, WorkNormalizationBook[]>();
	for (const book of books) {
		if (!book.bookId || !book.normalizedTitle) continue;
		const groupKey = canonicalCatalogWorkKey({ title: book.normalizedTitle, author: book.author });
		if (!groupKey || groupKey.includes("untitled|")) continue;
		const existing = byKey.get(groupKey) || [];
		existing.push(book);
		byKey.set(groupKey, existing);
	}

	const groups: PotentialDuplicateWorkGroup[] = [];
	for (const [groupKey, groupBooks] of byKey.entries()) {
		const distinctBookIds = new Set(groupBooks.map((book) => book.bookId));
		if (distinctBookIds.size < 2) continue;
		const scored = scorePotentialDuplicateBooks(groupBooks);
		if (scored.score < 85) continue;
		const target = chooseTarget(groupBooks);
		const duplicates = groupBooks
			.filter((book) => book.bookId !== target.bookId)
			.filter((book) => !ignoredPairs.has(`${groupKey}:${target.bookId}:${book.bookId}`) && !ignoredPairs.has(`${groupKey}:${book.bookId}:${target.bookId}`))
			.sort((a, b) => readerSignal(b) - readerSignal(a) || a.bookId - b.bookId);
		if (duplicates.length === 0) continue;
		groups.push({
			groupKey,
			confidenceScore: scored.score,
			reasons: scored.reasons,
			target,
			duplicates,
			books: [target, ...duplicates]
		});
	}
	return groups.sort((a, b) => b.confidenceScore - a.confidenceScore || b.books.length - a.books.length || a.target.bookId - b.target.bookId);
}

export async function ensureWorkMergeReviewSchema(sql: Sql) {
	await sql`
		create table if not exists catalog_work_merge_review (
			id bigserial primary key,
			group_key text not null,
			target_book_id bigint not null,
			source_book_id bigint not null,
			status text not null default 'pending' check (status in ('pending', 'ignored', 'merged')),
			reason text not null default '',
			metadata jsonb not null default '{}'::jsonb,
			reviewed_at timestamptz,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			unique (group_key, target_book_id, source_book_id)
		)
	`;
	await sql`create index if not exists idx_catalog_work_merge_review_status on catalog_work_merge_review(status, updated_at desc)`;
}

async function ensureRecommendationFeedbackSchema(sql: Sql) {
	await sql`
		create table if not exists user_recommendation_feedback (
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			feedback text not null check (feedback in ('interesting', 'not_interested')),
			source text not null default '',
			reason text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (user_id, book_id)
		)
	`;
	await sql`create index if not exists idx_recommendation_feedback_user_updated on user_recommendation_feedback(user_id, updated_at desc)`;
}

export async function loadPotentialDuplicateWorks(sql: Sql, limit = 25) {
	await ensureCanonicalWorkSchema(sql);
	await ensureWorkMergeReviewSchema(sql);
	const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit || 25))));
	const ignoredRows = await sql<Array<{ group_key: string; target_book_id: number; source_book_id: number }>>`
		select group_key, target_book_id, source_book_id
		from catalog_work_merge_review
		where status in ('ignored', 'merged')
	`;
	const ignoredPairs = new Set(ignoredRows.map((row) => `${row.group_key}:${Number(row.target_book_id || 0)}:${Number(row.source_book_id || 0)}`));
	const rows = await sql<WorkCandidateRow[]>`
		select
			b.id as book_id,
			b.work_id,
			coalesce(nullif(trim(b.title), ''), '') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			coalesce(nullif(trim(b.canonical_work_key), ''), '') as canonical_work_key,
			coalesce(nullif(trim(bw.work_key), ''), '') as work_key,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			coalesce(sb.book_order, bw.series_position, 0)::numeric as series_book_order,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			coalesce(bs.source_keys, array[]::text[]) as source_keys,
			coalesce(be.edition_keys, array[]::text[]) as edition_keys,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(sc.rating_count, 0)::int as rating_count,
			coalesce(sc.review_count, 0)::int as review_count,
			coalesce(ac.activity_count, 0)::int as activity_count,
			trim(coalesce(b.cover_url, '')) <> '' as has_cover,
			trim(coalesce(b.synopsis, '')) <> '' as has_description,
			b.updated_at::text as updated_at
		from book b
		left join book_work bw on bw.id = b.work_id
		left join series_book sb on sb.book_id = b.id
		left join series s on s.id = sb.series_id
		left join lateral (
			select array_agg(distinct source || ':' || source_key order by source || ':' || source_key) as source_keys
			from book_source
			where book_id = b.id
		) bs on true
		left join lateral (
			select array_agg(distinct edition_key order by edition_key) as edition_keys
			from book_edition
			where book_id = b.id or (b.work_id is not null and work_id = b.work_id)
		) be on true
		left join lateral (
			select
				count(*)::int as shelf_count,
				count(*) filter (where rating is not null)::int as rating_count,
				count(*) filter (where char_length(trim(coalesce(finished_reflection, ''))) > 0 or char_length(trim(coalesce(review_title, ''))) > 0)::int as review_count
			from user_book
			where book_id = b.id
		) sc on true
		left join lateral (
			select count(*)::int as activity_count
			from user_activity
			where book_id = b.id
		) ac on true
		where trim(coalesce(b.title, '')) <> ''
			and trim(coalesce(b.primary_author, '')) <> ''
		order by b.updated_at desc, b.id desc
		limit ${normalizedLimit * 80}
	`;
	return buildPotentialDuplicateWorkGroups(rows.map(normalizedBookFromRow), ignoredPairs).slice(0, normalizedLimit);
}

export async function ignorePotentialDuplicateWork(sql: Sql, input: { groupKey?: unknown; targetBookId?: unknown; sourceBookId?: unknown; reason?: unknown }) {
	await ensureWorkMergeReviewSchema(sql);
	const groupKey = normalizeCatalogText(input.groupKey);
	const targetBookId = Math.max(0, Math.floor(Number(input.targetBookId || 0)));
	const sourceBookId = Math.max(0, Math.floor(Number(input.sourceBookId || 0)));
	if (!groupKey || targetBookId <= 0 || sourceBookId <= 0 || targetBookId === sourceBookId) {
		return { ok: false, message: "Duplicate suggestion could not be ignored." };
	}
	await sql`
		insert into catalog_work_merge_review (group_key, target_book_id, source_book_id, status, reason, reviewed_at, updated_at)
		values (${groupKey}, ${targetBookId}, ${sourceBookId}, 'ignored', ${normalizeCatalogText(input.reason)}, now(), now())
		on conflict (group_key, target_book_id, source_book_id) do update set
			status = 'ignored',
			reason = excluded.reason,
			reviewed_at = now(),
			updated_at = now()
	`;
	return { ok: true, message: "Duplicate suggestion ignored." };
}

type MergeBookRow = {
	id: number;
	work_id: number | null;
	title: string;
	primary_author: string;
	canonical_work_key: string;
	series_name: string;
	series_book_order: number | null;
};

function finalMergedTitle(target: MergeBookRow, source: MergeBookRow) {
	const targetTitle = normalizeRedundantSeriesTitle({
		title: target.title,
		seriesName: target.series_name,
		bookOrder: target.series_book_order
	});
	if (targetTitle.changed) return targetTitle.title;
	const targetEditionTitle = normalizeRedundantEditionTitle({ title: target.title });
	if (targetEditionTitle.changed) return targetEditionTitle.title;
	const sourceTitle = normalizeRedundantSeriesTitle({
		title: source.title,
		seriesName: source.series_name,
		bookOrder: source.series_book_order
	});
	if (sourceTitle.changed && canonicalizeCatalogTitle(sourceTitle.title) === canonicalizeCatalogTitle(target.title)) return sourceTitle.title;
	const sourceEditionTitle = normalizeRedundantEditionTitle({ title: source.title });
	if (sourceEditionTitle.changed && canonicalizeCatalogTitle(sourceEditionTitle.title) === canonicalizeCatalogTitle(target.title)) return sourceEditionTitle.title;
	return normalizeCatalogText(target.title);
}

export async function mergeCatalogWorks(sql: Sql, input: { groupKey?: unknown; targetBookId?: unknown; sourceBookId?: unknown; reason?: unknown }) {
	await ensureCanonicalWorkSchema(sql);
	await ensureCollectionSchema(sql);
	await ensureCustomShelfSchema(sql);
	await ensureReadingJournalSchema(sql);
	await ensureRecommendationFeedbackSchema(sql);
	await ensureBookCoverEnrichmentSchema(sql);
	await ensureWorkMergeReviewSchema(sql);
	await sql`
		create table if not exists book_tag (
			book_id bigint not null references book(id) on delete cascade,
			tag_slug text not null,
			tag_name text not null,
			primary key (book_id, tag_slug)
		)
	`;
	await sql`
		create table if not exists user_reading_progress_event (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			from_page int not null default 0,
			to_page int not null default 0,
			page_delta int not null default 0,
			recorded_at timestamptz not null default now()
		)
	`;
	const groupKey = normalizeCatalogText(input.groupKey);
	const targetBookId = Math.max(0, Math.floor(Number(input.targetBookId || 0)));
	const sourceBookId = Math.max(0, Math.floor(Number(input.sourceBookId || 0)));
	if (!groupKey || targetBookId <= 0 || sourceBookId <= 0 || targetBookId === sourceBookId) {
		return { ok: false, message: "Merge request was incomplete." };
	}
	const rows = await sql<MergeBookRow[]>`
		select
			b.id,
			b.work_id,
			coalesce(nullif(trim(b.title), ''), '') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			coalesce(nullif(trim(b.canonical_work_key), ''), '') as canonical_work_key,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			coalesce(sb.book_order, bw.series_position, 0)::numeric as series_book_order
		from book b
		left join book_work bw on bw.id = b.work_id
		left join series_book sb on sb.book_id = b.id
		left join series s on s.id = sb.series_id
		where b.id in (${targetBookId}, ${sourceBookId})
	`;
	const target = rows.find((row) => Number(row.id) === targetBookId);
	const source = rows.find((row) => Number(row.id) === sourceBookId);
	if (!target || !source) return { ok: false, message: "One of the books no longer exists." };
	let targetWorkId = Math.max(0, Number(target.work_id || 0));
	const sourceWorkId = Math.max(0, Number(source.work_id || 0));
	const mergedTitle = finalMergedTitle(target, source) || target.title || source.title || "Untitled";
	const mergedWorkKey = canonicalCatalogWorkKey({ title: mergedTitle, author: target.primary_author || source.primary_author });
	const reason = normalizeCatalogText(input.reason) || "Admin-approved duplicate Work merge.";
	if (targetWorkId <= 0 && sourceWorkId > 0) {
		targetWorkId = sourceWorkId;
	}
	if (targetWorkId <= 0) {
		const workRows = await sql<Array<{ id: number }>>`
			insert into book_work (
				work_key,
				title,
				canonical_title,
				primary_author,
				updated_at
			)
			values (
				${mergedWorkKey},
				${mergedTitle},
				${mergedTitle},
				${normalizeCatalogText(target.primary_author || source.primary_author)},
				now()
			)
			on conflict (work_key) do update set
				title = excluded.title,
				canonical_title = excluded.canonical_title,
				primary_author = case when excluded.primary_author <> '' then excluded.primary_author else book_work.primary_author end,
				updated_at = now()
			returning id
		`;
		targetWorkId = Number(workRows[0]?.id || 0);
	}
	if (targetWorkId <= 0) return { ok: false, message: "Target book could not be attached to a canonical Work." };
	const sourceMergeKey = `${mergedWorkKey}:merged:${sourceBookId}`;

	await sql.transaction((tx) => [
		tx`
			update book
			set canonical_work_key = ${sourceMergeKey}, updated_at = now()
			where id = ${sourceBookId}
		`,
		tx`
			update book
			set
				title = ${mergedTitle},
				canonical_work_key = ${mergedWorkKey},
				work_id = ${targetWorkId},
				updated_at = now()
			where id = ${targetBookId}
		`,
		tx`
			update book_work tw
			set
				title = ${mergedTitle},
				canonical_title = ${mergedTitle},
				description = case when trim(coalesce(tw.description, '')) = '' then coalesce(nullif(trim(sw.description), ''), nullif(trim(sb.synopsis), ''), tw.description) else tw.description end,
				preferred_cover_url = case when trim(coalesce(tw.preferred_cover_url, '')) = '' then coalesce(nullif(trim(sw.preferred_cover_url), ''), nullif(trim(sb.cover_url), ''), tw.preferred_cover_url) else tw.preferred_cover_url end,
				series_id = coalesce(tw.series_id, sw.series_id),
				series_position = coalesce(tw.series_position, sw.series_position),
				original_publication_year = coalesce(tw.original_publication_year, sw.original_publication_year, sb.published_year),
				metadata = tw.metadata || jsonb_build_object('lastMerge', jsonb_build_object('sourceBookId', ${sourceBookId}::bigint, 'mergedAt', now(), 'reason', ${reason}::text)),
				updated_at = now()
			from book sb
			left join book_work sw on sw.id = ${sourceWorkId}
			where tw.id = ${targetWorkId}
				and sb.id = ${sourceBookId}
		`,
		tx`
			with matched as (
				select se.id as source_edition_id, te.id as target_edition_id
			from book_edition se
			join book_edition te on te.work_id = ${targetWorkId}
				and te.edition_key = se.edition_key
			where se.work_id = ${sourceWorkId}
				and ${sourceWorkId}::bigint > 0
				and ${sourceWorkId}::bigint <> ${targetWorkId}::bigint
				and se.id <> te.id
		)
			update user_book ub
			set edition_id = matched.target_edition_id
			from matched
			where ub.edition_id = matched.source_edition_id
		`,
		tx`
			with matched as (
				select se.*, te.id as target_edition_id
				from book_edition se
				join book_edition te on te.work_id = ${targetWorkId}
					and te.edition_key = se.edition_key
				where se.work_id = ${sourceWorkId}
					and ${sourceWorkId}::bigint > 0
					and ${sourceWorkId}::bigint <> ${targetWorkId}::bigint
					and se.id <> te.id
			)
			update book_edition te
			set
				isbn10 = case when te.isbn10 = '' then matched.isbn10 else te.isbn10 end,
				isbn13 = case when te.isbn13 = '' then matched.isbn13 else te.isbn13 end,
				publisher = case when te.publisher = '' then matched.publisher else te.publisher end,
				format = case when te.format = '' then matched.format else te.format end,
				language = case when te.language = '' then matched.language else te.language end,
				publication_date = case when te.publication_date = '' then matched.publication_date else te.publication_date end,
				publication_year = coalesce(te.publication_year, matched.publication_year),
				page_count = greatest(te.page_count, matched.page_count),
				cover_url = case when te.cover_url = '' then matched.cover_url else te.cover_url end,
				google_books_id = case when te.google_books_id = '' then matched.google_books_id else te.google_books_id end,
				open_library_work_id = case when te.open_library_work_id = '' then matched.open_library_work_id else te.open_library_work_id end,
				open_library_edition_id = case when te.open_library_edition_id = '' then matched.open_library_edition_id else te.open_library_edition_id end,
				external_ids = te.external_ids || matched.external_ids,
				metadata = te.metadata || matched.metadata,
				updated_at = now()
			from matched
			where te.id = matched.target_edition_id
		`,
		tx`
			delete from book_edition se
			using book_edition te
			where se.work_id = ${sourceWorkId}
				and te.work_id = ${targetWorkId}
				and ${sourceWorkId}::bigint > 0
				and ${sourceWorkId}::bigint <> ${targetWorkId}::bigint
				and te.edition_key = se.edition_key
				and se.id <> te.id
		`,
		tx`
			update book_edition
			set work_id = ${targetWorkId}, book_id = null, updated_at = now()
			where (work_id = ${sourceWorkId} and ${sourceWorkId}::bigint > 0 and ${sourceWorkId}::bigint <> ${targetWorkId}::bigint)
				or book_id = ${sourceBookId}
		`,
		tx`
			insert into book_genre (book_id, genre_slug, genre_name)
			select ${targetBookId}, genre_slug, genre_name
			from book_genre
			where book_id = ${sourceBookId}
			on conflict (book_id, genre_slug) do update set genre_name = excluded.genre_name
		`,
		tx`delete from book_genre where book_id = ${sourceBookId}`,
		tx`
			insert into book_tag (book_id, tag_slug, tag_name)
			select ${targetBookId}, tag_slug, tag_name
			from book_tag
			where book_id = ${sourceBookId}
			on conflict (book_id, tag_slug) do update set tag_name = excluded.tag_name
		`,
		tx`delete from book_tag where book_id = ${sourceBookId}`,
		tx`
			with merged as (
				select
					ub.user_id,
					${targetBookId}::bigint as book_id,
					(array_agg(ub.status order by case ub.status when 'finished' then 3 when 'reading' then 2 else 1 end desc, ub.updated_at desc))[1] as status,
					(array_agg(ub.rating order by (ub.rating is not null) desc, ub.updated_at desc))[1] as rating,
					max(ub.total_pages) as total_pages,
					max(ub.current_page) as current_page,
					(array_remove(array_agg(ub.finished_date order by (ub.finished_date is not null) desc, ub.updated_at desc), null))[1] as finished_date,
					coalesce((array_remove(array_agg(nullif(trim(coalesce(ub.finished_reflection, '')), '') order by ub.review_updated_at desc nulls last, ub.updated_at desc), null))[1], '') as finished_reflection,
					coalesce((array_remove(array_agg(nullif(trim(coalesce(ub.review_title, '')), '') order by ub.review_updated_at desc nulls last, ub.updated_at desc), null))[1], '') as review_title,
					bool_or(coalesce(ub.review_spoiler, false)) as review_spoiler,
					max(ub.review_updated_at) as review_updated_at,
					min(ub.first_added_at) as first_added_at,
					max(ub.updated_at) as updated_at,
					(array_remove(array_agg(ub.edition_id order by ub.updated_at desc), null))[1] as edition_id
				from user_book ub
				where ub.book_id in (${targetBookId}, ${sourceBookId})
				group by ub.user_id
			)
			insert into user_book (
				user_id, book_id, status, rating, total_pages, current_page, finished_date,
				finished_reflection, review_title, review_spoiler, review_updated_at,
				first_added_at, updated_at, edition_id
			)
			select user_id, book_id, status, rating, total_pages, current_page, finished_date,
				finished_reflection, review_title, review_spoiler, review_updated_at,
				first_added_at, updated_at, edition_id
			from merged
			on conflict (user_id, book_id) do update set
				status = excluded.status,
				rating = coalesce(excluded.rating, user_book.rating),
				total_pages = greatest(user_book.total_pages, excluded.total_pages),
				current_page = greatest(user_book.current_page, excluded.current_page),
				finished_date = coalesce(excluded.finished_date, user_book.finished_date),
				finished_reflection = case when excluded.finished_reflection <> '' then excluded.finished_reflection else user_book.finished_reflection end,
				review_title = case when excluded.review_title <> '' then excluded.review_title else user_book.review_title end,
				review_spoiler = excluded.review_spoiler or user_book.review_spoiler,
				review_updated_at = greatest(coalesce(user_book.review_updated_at, excluded.review_updated_at), coalesce(excluded.review_updated_at, user_book.review_updated_at)),
				first_added_at = least(coalesce(user_book.first_added_at, excluded.first_added_at), coalesce(excluded.first_added_at, user_book.first_added_at)),
				updated_at = greatest(coalesce(user_book.updated_at, excluded.updated_at), coalesce(excluded.updated_at, user_book.updated_at)),
				edition_id = coalesce(user_book.edition_id, excluded.edition_id)
		`,
		tx`delete from user_book where book_id = ${sourceBookId}`,
		tx`update user_activity set book_id = ${targetBookId} where book_id = ${sourceBookId}`,
		tx`update user_reading_progress_event set book_id = ${targetBookId} where book_id = ${sourceBookId}`,
		tx`
			insert into reading_journal_entry (
				user_id, book_id, started_thoughts, mid_book_notes, finished_thoughts,
				favorite_quote, would_reread, recommended_to, personal_tags, visibility,
				metadata, created_at, updated_at
			)
			select user_id, ${targetBookId}, started_thoughts, mid_book_notes, finished_thoughts,
				favorite_quote, would_reread, recommended_to, personal_tags, visibility,
				metadata, created_at, updated_at
			from reading_journal_entry
			where book_id = ${sourceBookId}
			on conflict (user_id, book_id) do update set
				started_thoughts = case when excluded.started_thoughts <> '' then excluded.started_thoughts else reading_journal_entry.started_thoughts end,
				mid_book_notes = case when excluded.mid_book_notes <> '' then excluded.mid_book_notes else reading_journal_entry.mid_book_notes end,
				finished_thoughts = case when excluded.finished_thoughts <> '' then excluded.finished_thoughts else reading_journal_entry.finished_thoughts end,
				favorite_quote = case when excluded.favorite_quote <> '' then excluded.favorite_quote else reading_journal_entry.favorite_quote end,
				would_reread = coalesce(reading_journal_entry.would_reread, excluded.would_reread),
				recommended_to = case when excluded.recommended_to <> '' then excluded.recommended_to else reading_journal_entry.recommended_to end,
				personal_tags = array(select distinct unnest(reading_journal_entry.personal_tags || excluded.personal_tags)),
				metadata = reading_journal_entry.metadata || excluded.metadata,
				updated_at = greatest(reading_journal_entry.updated_at, excluded.updated_at)
		`,
		tx`delete from reading_journal_entry where book_id = ${sourceBookId}`,
		tx`update reading_journal_note set book_id = ${targetBookId}, updated_at = now() where book_id = ${sourceBookId}`,
		tx`
			insert into user_custom_shelf_book (user_id, shelf_id, book_id, created_at)
			select user_id, shelf_id, ${targetBookId}, min(created_at)
			from user_custom_shelf_book
			where book_id in (${targetBookId}, ${sourceBookId})
			group by user_id, shelf_id
			on conflict do nothing
		`,
		tx`delete from user_custom_shelf_book where book_id = ${sourceBookId}`,
		tx`
			insert into series_book (series_id, book_id, title_override, book_order, publication_order, chronological_order, metadata, created_at, updated_at)
			select series_id, ${targetBookId}, '', book_order, publication_order, chronological_order, metadata, created_at, now()
			from series_book
			where book_id = ${sourceBookId}
			on conflict do nothing
		`,
		tx`delete from series_book where book_id = ${sourceBookId}`,
		tx`
			insert into collection_book (collection_id, book_id, sort_order, editor_note, featured_quote, created_at, updated_at)
			select collection_id, ${targetBookId}, sort_order, editor_note, featured_quote, created_at, updated_at
			from collection_book
			where book_id = ${sourceBookId}
			on conflict do nothing
		`,
		tx`delete from collection_book where book_id = ${sourceBookId}`,
		tx`
			insert into user_recommendation_feedback (user_id, book_id, feedback, source, reason, created_at, updated_at)
			select
				user_id,
				${targetBookId},
				(array_agg(feedback order by case feedback when 'not_interested' then 2 else 1 end desc, updated_at desc))[1],
				coalesce((array_remove(array_agg(nullif(trim(source), '') order by updated_at desc), null))[1], ''),
				coalesce((array_remove(array_agg(nullif(trim(reason), '') order by updated_at desc), null))[1], ''),
				min(created_at),
				max(updated_at)
			from user_recommendation_feedback
			where book_id in (${targetBookId}, ${sourceBookId})
			group by user_id
			on conflict (user_id, book_id) do update set
				feedback = excluded.feedback,
				source = case when excluded.source <> '' then excluded.source else user_recommendation_feedback.source end,
				reason = case when excluded.reason <> '' then excluded.reason else user_recommendation_feedback.reason end,
				updated_at = greatest(user_recommendation_feedback.updated_at, excluded.updated_at)
		`,
		tx`delete from user_recommendation_feedback where book_id = ${sourceBookId}`,
		tx`
			delete from book_source source_row
			where source_row.book_id = ${sourceBookId}
				and exists (
					select 1 from book_source target_row
					where target_row.book_id = ${targetBookId}
						and target_row.source = source_row.source
						and target_row.source_key = source_row.source_key
				)
		`,
		tx`update book_source set book_id = ${targetBookId}, last_synced_at = now() where book_id = ${sourceBookId}`,
		tx`update book_cover_enrichment_cache set book_id = ${targetBookId}, updated_at = now() where book_id = ${sourceBookId}`,
		tx`delete from book where id = ${sourceBookId}`,
		tx`
			delete from book_work bw
			where bw.id = ${sourceWorkId}
				and bw.id <> ${targetWorkId}
				and not exists (select 1 from book where work_id = bw.id)
				and not exists (select 1 from book_edition where work_id = bw.id)
		`,
		tx`
			insert into catalog_work_merge_review (group_key, target_book_id, source_book_id, status, reason, reviewed_at, updated_at, metadata)
			values (
				${groupKey},
				${targetBookId},
				${sourceBookId},
				'merged',
				${reason},
				now(),
				now(),
				jsonb_build_object('targetWorkId', ${targetWorkId}::bigint, 'sourceWorkId', ${sourceWorkId}::bigint, 'mergedTitle', ${mergedTitle}::text)
			)
			on conflict (group_key, target_book_id, source_book_id) do update set
				status = 'merged',
				reason = excluded.reason,
				reviewed_at = now(),
				updated_at = now(),
				metadata = catalog_work_merge_review.metadata || excluded.metadata
		`
	]);
	return { ok: true, message: `Merged "${source.title}" into "${mergedTitle}".` };
}

function isSafeAutomaticMerge(group: PotentialDuplicateWorkGroup) {
	if (group.confidenceScore < 100) return false;
	const allSameSeries = group.books.every((book) => book.seriesName && book.seriesBookOrder > 0)
		&& sameSeriesPosition(group.books);
	const allSameWork = sameExistingWork(group.books);
	const hasIdentifierEvidence = group.reasons.some((reason) => /ISBN|external provider|edition key/i.test(reason));
	const hasCleanupEvidence = group.reasons.some((reason) => /redundant series|edition metadata/i.test(reason));
	return allSameSeries || allSameWork || hasIdentifierEvidence || hasCleanupEvidence;
}

export async function attachKnownSeriesRelationships(sql: Sql, limit = 1000) {
	await ensureCanonicalWorkSchema(sql);
	await ensureSeriesSchema(sql);
	const normalizedLimit = Math.max(1, Math.min(5000, Math.floor(Number(limit || 1000))));
	const rows = await sql<Array<{
		id: number;
		work_id: number | null;
		title: string;
		primary_author: string;
		cover_url: string;
		published_year: number | null;
	}>>`
		select
			b.id,
			b.work_id,
			coalesce(nullif(trim(b.title), ''), '') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
			b.published_year
		from book b
		where trim(coalesce(b.title, '')) <> ''
			and trim(coalesce(b.primary_author, '')) <> ''
		order by b.updated_at desc, b.id desc
		limit ${normalizedLimit}
	`;
	let attached = 0;
	for (const row of rows) {
		const inferred = inferKnownSeriesMetadata({ title: row.title, author: row.primary_author });
		if (!inferred) continue;
		const result = await upsertKnownSeriesForBook(sql, {
			bookId: Number(row.id || 0),
			workId: Number(row.work_id || 0),
			title: row.title,
			author: row.primary_author,
			coverUrl: row.cover_url,
			publishedYear: row.published_year
		});
		if (result) attached += 1;
	}
	return { checked: rows.length, attached };
}

function canonicalTitleForRekey(row: WorkRekeyRow) {
	const rawTitle = normalizeCatalogText(row.title) || "Untitled";
	const seriesTitle = normalizeRedundantSeriesTitle({
		title: rawTitle,
		seriesName: row.series_name,
		bookOrder: row.series_book_order
	});
	const editionTitle = normalizeRedundantEditionTitle({ title: seriesTitle.title || rawTitle });
	return editionTitle.title || seriesTitle.title || rawTitle;
}

export async function repairCanonicalWorkKeys(sql: Sql, limit = 5000) {
	await ensureCanonicalWorkSchema(sql);
	const normalizedLimit = Math.max(1, Math.min(10000, Math.floor(Number(limit || 5000))));
	const rows = await sql<WorkRekeyRow[]>`
		select
			b.id,
			b.work_id,
			coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			b.author_id,
			coalesce(nullif(trim(b.synopsis), ''), '') as synopsis,
			coalesce(nullif(trim(b.cover_url), ''), '') as cover_url,
			b.published_year,
			b.page_count,
			coalesce(nullif(trim(b.language), ''), '') as language,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			coalesce(nullif(trim(b.publisher), ''), '') as publisher,
			coalesce(nullif(trim(bw.work_key), ''), '') as current_work_key,
			coalesce(nullif(trim(b.canonical_work_key), ''), '') as canonical_work_key,
			coalesce(sb.series_id, bw.series_id) as series_id,
			coalesce(nullif(trim(s.name), ''), nullif(trim(ws.name), ''), '') as series_name,
			coalesce(sb.book_order, bw.series_position, 0)::numeric as series_book_order,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(sc.rating_count, 0)::int as rating_count
		from book b
		left join book_work bw on bw.id = b.work_id
		left join series_book sb on sb.book_id = b.id
		left join series s on s.id = sb.series_id
		left join series ws on ws.id = bw.series_id
		left join lateral (
			select
				count(*)::int as shelf_count,
				count(*) filter (where rating is not null)::int as rating_count
			from user_book ub
			where ub.book_id = b.id
		) sc on true
		where trim(coalesce(b.title, '')) <> ''
			and trim(coalesce(b.primary_author, '')) <> ''
		order by b.updated_at desc, b.id desc
		limit ${normalizedLimit}
	`;

	let repaired = 0;
	let editionsAttached = 0;
	for (const row of rows) {
		const canonicalTitle = canonicalTitleForRekey(row);
		const workKey = canonicalCatalogWorkKey({ title: canonicalTitle, author: row.primary_author });
		if (!workKey) continue;
		const currentWorkId = Number(row.work_id || 0);
		if (currentWorkId > 0 && row.current_work_key === workKey && row.canonical_work_key === workKey) continue;
		const workRows = await sql<Array<{ id: number }>>`
			insert into book_work (
				work_key,
				title,
				canonical_title,
				primary_author,
				author_id,
				description,
				series_id,
				series_position,
				original_publication_year,
				preferred_cover_url,
				updated_at
			)
			values (
				${workKey},
				${canonicalTitle},
				${canonicalTitle},
				${normalizeCatalogText(row.primary_author)},
				${Number(row.author_id || 0) > 0 ? Number(row.author_id || 0) : null},
				${normalizeCatalogText(row.synopsis)},
				${Number(row.series_id || 0) > 0 ? Number(row.series_id || 0) : null},
				${Number(row.series_book_order || 0) > 0 ? Number(row.series_book_order || 0) : null},
				${Number(row.published_year || 0) > 0 ? Number(row.published_year || 0) : null},
				${normalizeCatalogText(row.cover_url)},
				now()
			)
			on conflict (work_key) do update set
				title = case when excluded.title <> '' then excluded.title else book_work.title end,
				canonical_title = case when excluded.canonical_title <> '' then excluded.canonical_title else book_work.canonical_title end,
				primary_author = case when excluded.primary_author <> '' then excluded.primary_author else book_work.primary_author end,
				author_id = coalesce(excluded.author_id, book_work.author_id),
				description = case when book_work.description = '' then excluded.description else book_work.description end,
				series_id = coalesce(book_work.series_id, excluded.series_id),
				series_position = coalesce(book_work.series_position, excluded.series_position),
				original_publication_year = coalesce(book_work.original_publication_year, excluded.original_publication_year),
				preferred_cover_url = case when book_work.preferred_cover_url = '' then excluded.preferred_cover_url else book_work.preferred_cover_url end,
				updated_at = now()
			returning id
		`;
		const workId = Number(workRows[0]?.id || 0);
		if (workId <= 0) continue;
		const existingBookKeyRows = await sql<Array<{ id: number }>>`
			select id
			from book
			where canonical_work_key = ${workKey}
				and id <> ${Number(row.id || 0)}
			limit 1
		`;
		const compatibilityBookKey = existingBookKeyRows.length > 0 ? `${workKey}:duplicate:${Number(row.id || 0)}` : workKey;
		await sql`
			update book
			set
				work_id = ${workId},
				canonical_work_key = ${compatibilityBookKey},
				updated_at = now()
			where id = ${Number(row.id || 0)}
				and (work_id is distinct from ${workId} or canonical_work_key is distinct from ${compatibilityBookKey})
		`;
		const editions = await sql<Array<{ id: number; edition_key: string }>>`
			select id, edition_key
			from book_edition
			where book_id = ${Number(row.id || 0)}
		`;
		for (const edition of editions) {
			const existing = await sql<Array<{ id: number }>>`
				select id
				from book_edition
				where work_id = ${workId}
					and edition_key = ${edition.edition_key}
					and id <> ${Number(edition.id || 0)}
				limit 1
			`;
			const existingId = Number(existing[0]?.id || 0);
			if (existingId > 0) {
				await sql`update user_book set edition_id = ${existingId} where edition_id = ${Number(edition.id || 0)}`;
				await sql`delete from book_edition where id = ${Number(edition.id || 0)}`;
				editionsAttached += 1;
			} else {
				await sql`
					update book_edition
					set work_id = ${workId}, updated_at = now()
					where id = ${Number(edition.id || 0)}
						and work_id is distinct from ${workId}
				`;
				editionsAttached += 1;
			}
		}
		repaired += 1;
	}
	await sql`
		delete from book_work bw
		where not exists (select 1 from book b where b.work_id = bw.id)
			and not exists (select 1 from book_edition be where be.work_id = bw.id)
	`;
	return { checked: rows.length, repaired, editionsAttached };
}

export async function removeResolvedSeriesPlaceholders(sql: Sql) {
	await ensureSeriesSchema(sql);
	const rows = await sql<Array<{ series_id: number; book_order: string }>>`
		with real_entries as (
			select distinct series_id, book_order
			from series_book
			where book_id is not null
				and book_order is not null
		)
		delete from series_book placeholder
		using real_entries real_entry
		where placeholder.series_id = real_entry.series_id
			and placeholder.book_id is null
			and placeholder.book_order = real_entry.book_order
		returning placeholder.series_id, placeholder.book_order::text
	`;
	return rows.length;
}

async function countCatalogRelationshipConflicts(sql: Sql) {
	const rows = await sql<Array<{ conflict_count: number }>>`
		with duplicate_series_positions as (
			select s.id, sb.book_order
			from series s
			join series_book sb on sb.series_id = s.id
			where sb.book_order is not null
			group by s.id, sb.book_order
			having count(*) > 1
		),
		missing_work_keys as (
			select b.id
			from book b
			left join book_work bw on bw.id = b.work_id
			where b.work_id is null
				or trim(coalesce(bw.work_key, '')) = ''
				or trim(coalesce(b.canonical_work_key, '')) = ''
		),
		multi_title_works as (
			select b.work_id
			from book b
			where b.work_id is not null
			group by b.work_id
			having count(distinct b.canonical_work_key) > 1
		)
		select (
			(select count(*) from duplicate_series_positions)
			+ (select count(*) from missing_work_keys)
			+ (select count(*) from multi_title_works)
		)::int as conflict_count
	`;
	return Number(rows[0]?.conflict_count || 0);
}

export async function normalizeCanonicalWorkRelationships(sql: Sql, options: {
	candidateLimit?: number;
	duplicateLimit?: number;
	maxPasses?: number;
	apply?: boolean;
} = {}): Promise<CanonicalWorkNormalizationResult> {
	const candidateLimit = Math.max(1, Math.min(5000, Math.floor(Number(options.candidateLimit || 1000))));
	const duplicateLimit = Math.max(1, Math.min(100, Math.floor(Number(options.duplicateLimit || 100))));
	const maxPasses = Math.max(1, Math.min(10, Math.floor(Number(options.maxPasses || 5))));
	const shouldApply = options.apply !== false;
	const messages: string[] = [];

	const seriesResult = shouldApply
		? await attachKnownSeriesRelationships(sql, candidateLimit)
		: { checked: 0, attached: 0 };
	const removedPlaceholdersBefore = shouldApply ? await removeResolvedSeriesPlaceholders(sql) : 0;
	const titleResult = shouldApply
		? await normalizeCanonicalSeriesTitles(sql, candidateLimit)
		: { checked: 0, updated: 0, candidates: [] };
	const rekeyResult = shouldApply
		? await repairCanonicalWorkKeys(sql, candidateLimit)
		: { checked: 0, repaired: 0, editionsAttached: 0 };
	const removedPlaceholdersAfter = shouldApply ? await removeResolvedSeriesPlaceholders(sql) : 0;

	let duplicateGroupsChecked = 0;
	let worksMerged = 0;
	for (let pass = 0; pass < maxPasses; pass += 1) {
		const groups = await loadPotentialDuplicateWorks(sql, duplicateLimit);
		duplicateGroupsChecked += groups.length;
		const mergeable = groups.flatMap((group) => (
			isSafeAutomaticMerge(group)
				? group.duplicates.map((duplicate) => ({ group, duplicate }))
				: []
		));
		if (mergeable.length === 0) break;
		if (!shouldApply) {
			messages.push(`${mergeable.length} high-confidence duplicate Works would be merged.`);
			break;
		}
		for (const { group, duplicate } of mergeable) {
			const result = await mergeCatalogWorks(sql, {
				groupKey: group.groupKey,
				targetBookId: group.target.bookId,
				sourceBookId: duplicate.bookId,
				reason: `Automatic canonical Work normalization. ${group.reasons.join(" ")}`
			});
			messages.push(result.message);
			if (result.ok) worksMerged += 1;
		}
	}

	return {
		knownSeriesChecked: seriesResult.checked,
		knownSeriesAttached: seriesResult.attached,
		workKeysChecked: rekeyResult.checked,
		workKeysRepaired: rekeyResult.repaired,
		editionsAttached: rekeyResult.editionsAttached,
		titlesChecked: titleResult.checked,
		titlesUpdated: titleResult.updated,
		seriesPlaceholdersRemoved: removedPlaceholdersBefore + removedPlaceholdersAfter,
		duplicateGroupsChecked,
		worksMerged,
		metadataConflictsRemaining: shouldApply ? await countCatalogRelationshipConflicts(sql) : 0,
		messages
	};
}
