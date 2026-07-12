import { neon } from "@neondatabase/serverless";
import { canonicalizeCatalogAuthor, canonicalizeCatalogTitle, normalizeCatalogIsbn } from "../src/lib/catalogKeys.ts";
import { normalizeRedundantEditionTitle, normalizeRedundantSeriesTitle } from "../src/lib/canonicalTitles.ts";
import {
	rebuildCanonicalAuthorRelationships,
	rebuildCanonicalSearchIdentity,
	rebuildCanonicalSeriesEntries
} from "../src/lib/workNormalization.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const args = new Set(process.argv.slice(2));
const isNpmDryRun = String(process.env.npm_config_dry_run || "").toLowerCase() === "true";
const isDryRun = args.has("--dry-run") || isNpmDryRun;
const reportLimitArg = process.argv
	.slice(2)
	.find((arg) => arg.startsWith("--report-limit=") || arg.startsWith("--limit="));
const reportLimit = reportLimitArg
	? Math.max(0, Number(reportLimitArg.split("=")[1]) || 0)
	: 25;

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(databaseUrl);

function text(value) {
	return String(value ?? "").trim();
}

function number(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function textArray(value) {
	return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function unique(values) {
	return Array.from(new Set(values.map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function canonicalWorkTitle(row) {
	const rawTitle = text(row.canonical_title) || text(row.title) || "Untitled";
	const seriesTitle = normalizeRedundantSeriesTitle({
		title: rawTitle,
		seriesName: text(row.series_name),
		bookOrder: number(row.series_position)
	});
	const editionTitle = normalizeRedundantEditionTitle({ title: seriesTitle.title || rawTitle });
	return editionTitle.title || seriesTitle.title || rawTitle;
}

function addSignal(map, key, workId) {
	const normalized = text(key);
	if (!normalized) return;
	const set = map.get(normalized) || new Set();
	set.add(workId);
	map.set(normalized, set);
}

function formatList(values, fallback = "none") {
	const list = unique(values);
	return list.length > 0 ? list.join(", ") : fallback;
}

function relationshipSummary(work) {
	return {
		representativeBooks: work.bookIds.length,
		editions: work.editionIds.length,
		shelves: work.shelfCount,
		readers: work.readerCount,
		reviews: work.reviewCount,
		activity: work.activityCount,
		progressEvents: work.progressCount,
		journalEntries: work.journalEntryCount,
		journalNotes: work.journalNoteCount,
		recommendations: work.recommendationCount,
		customShelfEntries: work.customShelfCount,
		seriesEntries: work.seriesEntryCount,
		collectionEntries: work.collectionCount,
		foreignKeyReferences: work.bookIds.length + work.editionIds.length
	};
}

function hasReaderOwnedRelationships(work) {
	return work.shelfCount > 0
		|| work.readerCount > 0
		|| work.reviewCount > 0
		|| work.activityCount > 0
		|| work.progressCount > 0
		|| work.journalEntryCount > 0
		|| work.journalNoteCount > 0
		|| work.recommendationCount > 0
		|| work.customShelfCount > 0;
}

function isDeletionEligible(work) {
	return work.bookIds.length === 0
		&& work.editionIds.length === 0
		&& work.shelfCount === 0
		&& work.readerCount === 0
		&& work.reviewCount === 0
		&& work.activityCount === 0
		&& work.progressCount === 0
		&& work.journalEntryCount === 0
		&& work.journalNoteCount === 0
		&& work.recommendationCount === 0
		&& work.customShelfCount === 0
		&& work.seriesEntryCount === 0
		&& work.collectionCount === 0;
}

function workSignal(work) {
	return work.bookIds.length * 20
		+ work.editionIds.length * 12
		+ work.shelfCount * 10
		+ work.readerCount * 8
		+ work.reviewCount * 6
		+ work.activityCount * 3
		+ work.externalIds.length
		+ work.isbns.length;
}

function chooseCanonicalWork(works) {
	return [...works].sort((a, b) => workSignal(b) - workSignal(a) || a.workId - b.workId)[0];
}

function buildDuplicateGroups(works) {
	const byTitleAuthor = new Map();
	const bySeriesPositionAuthor = new Map();
	const byIsbn = new Map();
	const byExternalId = new Map();
	const byCanonicalBookKey = new Map();
	const byEditionKey = new Map();

	for (const work of works) {
		if (work.canonicalTitleKey && work.authorKey) {
			addSignal(byTitleAuthor, `${work.canonicalTitleKey}|${work.authorKey}`, work.workId);
		}
		if (work.seriesKey && work.seriesPosition > 0 && work.authorKey) {
			addSignal(bySeriesPositionAuthor, `${work.seriesKey}|${work.seriesPosition}|${work.authorKey}`, work.workId);
		}
		for (const isbn of work.isbns) addSignal(byIsbn, isbn, work.workId);
		for (const externalId of work.externalIds) addSignal(byExternalId, externalId, work.workId);
		for (const key of work.canonicalBookKeys) addSignal(byCanonicalBookKey, key, work.workId);
		for (const key of work.editionKeys) addSignal(byEditionKey, key, work.workId);
	}

	const groups = new Map();
	const addGroupReason = (workIds, reason) => {
		if (workIds.size < 2) return;
		const key = Array.from(workIds).map(String).sort((a, b) => Number(a) - Number(b)).join("|");
		const group = groups.get(key) || { workIds: Array.from(workIds).map(Number), reasons: [] };
		if (!group.reasons.includes(reason)) group.reasons.push(reason);
		groups.set(key, group);
	};

	for (const [key, workIds] of byTitleAuthor.entries()) addGroupReason(workIds, `Same canonical title and author (${key}).`);
	for (const [key, workIds] of bySeriesPositionAuthor.entries()) addGroupReason(workIds, `Same structured series position and author (${key}).`);
	for (const [key, workIds] of byIsbn.entries()) addGroupReason(workIds, `Shared ISBN (${key}).`);
	for (const [key, workIds] of byExternalId.entries()) addGroupReason(workIds, `Shared external provider ID (${key}).`);
	for (const [key, workIds] of byCanonicalBookKey.entries()) addGroupReason(workIds, `Shared compatibility canonical Work key (${key}).`);
	for (const [key, workIds] of byEditionKey.entries()) addGroupReason(workIds, `Shared Edition key (${key}).`);

	return Array.from(groups.values())
		.map((group) => ({
			...group,
			works: group.workIds.map((id) => works.find((work) => work.workId === id)).filter(Boolean)
		}))
		.filter((group) => group.works.length > 1)
		.sort((a, b) => b.reasons.length - a.reasons.length || Math.min(...a.workIds) - Math.min(...b.workIds));
}

async function loadWorks() {
	const rows = await sql`
		select
			bw.id as work_id,
			coalesce(nullif(trim(bw.title), ''), '') as title,
			coalesce(nullif(trim(bw.canonical_title), ''), '') as canonical_title,
			coalesce(nullif(trim(bw.primary_author), ''), '') as primary_author,
			bw.series_id,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			bw.series_position,
			coalesce(books.book_ids, array[]::bigint[]) as book_ids,
			coalesce(books.canonical_work_keys, array[]::text[]) as canonical_work_keys,
			coalesce(books.isbn10s, array[]::text[]) as book_isbn10s,
			coalesce(books.isbn13s, array[]::text[]) as book_isbn13s,
			coalesce(books.google_books_ids, array[]::text[]) as book_google_books_ids,
			coalesce(books.source_ids, array[]::text[]) as source_ids,
			coalesce(editions.edition_ids, array[]::bigint[]) as edition_ids,
			coalesce(editions.edition_keys, array[]::text[]) as edition_keys,
			coalesce(editions.isbn10s, array[]::text[]) as edition_isbn10s,
			coalesce(editions.isbn13s, array[]::text[]) as edition_isbn13s,
			coalesce(editions.external_ids, array[]::text[]) as edition_external_ids,
			coalesce(metrics.shelf_count, 0)::int as shelf_count,
			coalesce(metrics.reader_count, 0)::int as reader_count,
			coalesce(metrics.review_count, 0)::int as review_count,
			coalesce(metrics.activity_count, 0)::int as activity_count,
			coalesce(metrics.progress_count, 0)::int as progress_count,
			coalesce(metrics.journal_entry_count, 0)::int as journal_entry_count,
			coalesce(metrics.journal_note_count, 0)::int as journal_note_count,
			coalesce(metrics.recommendation_count, 0)::int as recommendation_count,
			coalesce(metrics.custom_shelf_count, 0)::int as custom_shelf_count,
			coalesce(metrics.series_entry_count, 0)::int as series_entry_count,
			coalesce(metrics.collection_count, 0)::int as collection_count
		from book_work bw
		left join series s on s.id = bw.series_id
		left join lateral (
			select
				array_agg(distinct b.id order by b.id) as book_ids,
				array_agg(distinct b.canonical_work_key) filter (where trim(coalesce(b.canonical_work_key, '')) <> '') as canonical_work_keys,
				array_agg(distinct b.isbn10) filter (where trim(coalesce(b.isbn10, '')) <> '') as isbn10s,
				array_agg(distinct b.isbn13) filter (where trim(coalesce(b.isbn13, '')) <> '') as isbn13s,
				array_agg(distinct b.google_books_id) filter (where trim(coalesce(b.google_books_id, '')) <> '') as google_books_ids,
				array_agg(distinct bs.source || ':' || bs.source_key) filter (where trim(coalesce(bs.source_key, '')) <> '') as source_ids
			from book b
			left join book_source bs on bs.book_id = b.id
			where b.work_id = bw.id
		) books on true
		left join lateral (
			select
				array_agg(distinct be.id order by be.id) as edition_ids,
				array_agg(distinct be.edition_key) filter (where trim(coalesce(be.edition_key, '')) <> '') as edition_keys,
				array_agg(distinct be.isbn10) filter (where trim(coalesce(be.isbn10, '')) <> '') as isbn10s,
				array_agg(distinct be.isbn13) filter (where trim(coalesce(be.isbn13, '')) <> '') as isbn13s,
				coalesce(array_agg(distinct 'google_books:' || be.google_books_id) filter (where trim(coalesce(be.google_books_id, '')) <> ''), array[]::text[]) ||
					coalesce(array_agg(distinct 'open_library_work:' || be.open_library_work_id) filter (where trim(coalesce(be.open_library_work_id, '')) <> ''), array[]::text[]) ||
					coalesce(array_agg(distinct 'open_library_edition:' || be.open_library_edition_id) filter (where trim(coalesce(be.open_library_edition_id, '')) <> ''), array[]::text[]) as external_ids
			from book_edition be
			where be.work_id = bw.id
		) editions on true
		left join lateral (
			select
				(select count(*)::int from user_book ub join book b on b.id = ub.book_id where b.work_id = bw.id) as shelf_count,
				(select count(distinct ub.user_id)::int from user_book ub join book b on b.id = ub.book_id where b.work_id = bw.id) as reader_count,
				(select count(*)::int from user_book ub join book b on b.id = ub.book_id where b.work_id = bw.id and (ub.rating is not null or trim(coalesce(ub.review_title, '')) <> '' or trim(coalesce(ub.finished_reflection, '')) <> '')) as review_count,
				(select count(*)::int from user_activity ua join book b on b.id = ua.book_id where b.work_id = bw.id) as activity_count,
				(select count(*)::int from user_reading_progress_event pe join book b on b.id = pe.book_id where b.work_id = bw.id) as progress_count,
				(select count(*)::int from reading_journal_entry je join book b on b.id = je.book_id where b.work_id = bw.id) as journal_entry_count,
				(select count(*)::int from reading_journal_note jn join book b on b.id = jn.book_id where b.work_id = bw.id) as journal_note_count,
				(select count(*)::int from user_recommendation_feedback rf join book b on b.id = rf.book_id where b.work_id = bw.id) as recommendation_count,
				(select count(*)::int from user_custom_shelf_book csb join book b on b.id = csb.book_id where b.work_id = bw.id) as custom_shelf_count,
				(select count(*)::int from series_book sb join book b on b.id = sb.book_id where b.work_id = bw.id) as series_entry_count,
				(select count(*)::int from collection_book cb join book b on b.id = cb.book_id where b.work_id = bw.id) as collection_count
		) metrics on true
		order by bw.id asc
	`;

	return rows.map((row) => {
		const canonicalTitle = canonicalWorkTitle(row);
		const author = text(row.primary_author);
		const seriesName = text(row.series_name);
		const seriesPosition = number(row.series_position);
		const isbns = unique([
			...textArray(row.book_isbn10s).map(normalizeCatalogIsbn),
			...textArray(row.book_isbn13s).map(normalizeCatalogIsbn),
			...textArray(row.edition_isbn10s).map(normalizeCatalogIsbn),
			...textArray(row.edition_isbn13s).map(normalizeCatalogIsbn)
		]);
		const externalIds = unique([
			...textArray(row.source_ids),
			...textArray(row.edition_external_ids),
			...textArray(row.book_google_books_ids).map((value) => value ? `google_books:${value}` : "")
		]);
		return {
			workId: number(row.work_id),
			title: text(row.title),
			canonicalTitle,
			canonicalTitleKey: canonicalizeCatalogTitle(canonicalTitle),
			author,
			authorKey: canonicalizeCatalogAuthor(author),
			seriesId: number(row.series_id),
			seriesName,
			seriesKey: canonicalizeCatalogTitle(seriesName),
			seriesPosition,
			bookIds: textArray(row.book_ids).map(number).filter(Boolean),
			canonicalBookKeys: textArray(row.canonical_work_keys),
			editionIds: textArray(row.edition_ids).map(number).filter(Boolean),
			editionKeys: textArray(row.edition_keys),
			isbns,
			externalIds,
			shelfCount: number(row.shelf_count),
			readerCount: number(row.reader_count),
			reviewCount: number(row.review_count),
			activityCount: number(row.activity_count),
			progressCount: number(row.progress_count),
			journalEntryCount: number(row.journal_entry_count),
			journalNoteCount: number(row.journal_note_count),
			recommendationCount: number(row.recommendation_count),
			customShelfCount: number(row.custom_shelf_count),
			seriesEntryCount: number(row.series_entry_count),
			collectionCount: number(row.collection_count)
		};
	});
}

function buildCleanupPlan(groups) {
	const plan = [];
	const skipped = [];
	for (const group of groups) {
		const canonical = chooseCanonicalWork(group.works);
		for (const work of group.works) {
			if (work.workId === canonical.workId) continue;
			const summary = relationshipSummary(work);
			const readerOwned = hasReaderOwnedRelationships(work);
			const canMoveLingeringReferences = !readerOwned && canonical.workId > 0;
			const eligibleNow = isDeletionEligible(work);
			const cleanupReason = group.reasons.join(" ");
			if (eligibleNow || canMoveLingeringReferences) {
				plan.push({
					workId: work.workId,
					canonicalWorkId: canonical.workId,
					reason: eligibleNow
						? `Empty placeholder Work. ${cleanupReason}`
						: `Placeholder-like Work with movable non-reader references. ${cleanupReason}`,
					relationships: summary,
					deletionEligible: eligibleNow
				});
			} else {
				skipped.push({
					workId: work.workId,
					canonicalWorkId: canonical.workId,
					reason: `Skipped because reader-owned relationships or non-movable references exist. ${cleanupReason}`,
					relationships: summary,
					deletionEligible: false
				});
			}
		}
	}
	return { plan, skipped };
}

async function moveWorkReferences(sourceWorkId, targetWorkId) {
	let moved = 0;
	const matchedEditions = await sql`
		select se.id as source_edition_id, te.id as target_edition_id
		from book_edition se
		join book_edition te on te.work_id = ${targetWorkId}
			and te.edition_key = se.edition_key
			and te.id <> se.id
		where se.work_id = ${sourceWorkId}
	`;
	for (const edition of matchedEditions) {
		const sourceEditionId = number(edition.source_edition_id);
		const targetEditionId = number(edition.target_edition_id);
		await sql`update user_book set edition_id = ${targetEditionId} where edition_id = ${sourceEditionId}`;
		await sql`delete from book_edition where id = ${sourceEditionId}`;
		moved += 1;
	}
	const editionRows = await sql`
		update book_edition
		set work_id = ${targetWorkId}, updated_at = now()
		where work_id = ${sourceWorkId}
		returning id
	`;
	const bookRows = await sql`
		update book
		set work_id = ${targetWorkId}, updated_at = now()
		where work_id = ${sourceWorkId}
		returning id
	`;
	return moved + editionRows.length + bookRows.length;
}

async function deleteIfEligible(item) {
	const moved = await moveWorkReferences(item.workId, item.canonicalWorkId);
	const refreshed = (await loadWorks()).find((work) => work.workId === item.workId);
	if (!refreshed || !isDeletionEligible(refreshed)) {
		return {
			...item,
			relationshipsMoved: moved,
			deleted: false,
			error: refreshed ? "Work still has relationships after reference move." : "Work disappeared before cleanup."
		};
	}
	const deletedRows = await sql`delete from book_work where id = ${item.workId} returning id`;
	return {
		...item,
		relationshipsMoved: moved,
		deleted: deletedRows.length > 0,
		error: deletedRows.length > 0 ? "" : "Delete returned no rows."
	};
}

function renderPlanItem(item) {
	return [
		`Work ID: ${item.workId}`,
		`Canonical Work ID: ${item.canonicalWorkId}`,
		`Reason: ${item.reason}`,
		`Relationships found: ${JSON.stringify(item.relationships)}`,
		`Deletion eligibility: ${item.deletionEligible ? "eligible now" : "requires movable reference cleanup"}`
	].join("\n");
}

const beforeWorks = await loadWorks();
const beforeGroups = buildDuplicateGroups(beforeWorks);
const { plan, skipped } = buildCleanupPlan(beforeGroups);

const results = [];
if (!isDryRun) {
	for (const item of plan) {
		results.push(await deleteIfEligible(item));
	}
	await rebuildCanonicalSearchIdentity(sql);
	await rebuildCanonicalSeriesEntries(sql);
	await rebuildCanonicalAuthorRelationships(sql);
}

const afterWorks = isDryRun ? beforeWorks : await loadWorks();
const afterGroups = isDryRun ? beforeGroups : buildDuplicateGroups(afterWorks);
const removedCount = results.filter((result) => result.deleted).length;
const relationshipsMoved = results.reduce((sum, result) => sum + number(result.relationshipsMoved), 0);
const remainingGroups = afterGroups.slice(0, reportLimit);
const cleanupCandidates = plan.slice(0, reportLimit);
const skippedDuplicates = skipped.slice(0, reportLimit);

const lines = [
	"DogEared Canonical Catalog Cleanup",
	`Mode: ${isDryRun ? "dry-run" : "apply"}`,
	"",
	"Migration Report",
	"================",
	`Works before: ${beforeWorks.length.toLocaleString()}`,
	`Works after: ${afterWorks.length.toLocaleString()}`,
	`Placeholder Works removed: ${removedCount.toLocaleString()}`,
	`Relationships moved: ${relationshipsMoved.toLocaleString()}`,
	`Search index rebuilt: ${isDryRun ? "not run in dry-run" : "yes"}`,
	`Duplicate groups before: ${beforeGroups.length.toLocaleString()}`,
	`Duplicate groups remaining: ${afterGroups.length.toLocaleString()}`,
	"",
	"Cleanup Candidates",
	"=================="
];

if (plan.length === 0) {
	lines.push("No placeholder Work cleanup candidates found.");
} else {
	for (const item of cleanupCandidates) {
		lines.push("");
		lines.push(renderPlanItem(item));
		const result = results.find((entry) => entry.workId === item.workId);
		if (result) lines.push(`Cleanup result: ${result.deleted ? "deleted" : `not deleted (${result.error})`}`);
	}
	if (plan.length > cleanupCandidates.length) lines.push(`\n${plan.length - cleanupCandidates.length} additional cleanup candidates omitted from this report.`);
}

if (skipped.length > 0) {
	lines.push("");
	lines.push("Skipped Duplicates");
	lines.push("==================");
	for (const item of skippedDuplicates) {
		lines.push("");
		lines.push(renderPlanItem(item));
	}
	if (skipped.length > skippedDuplicates.length) lines.push(`\n${skipped.length - skippedDuplicates.length} additional skipped duplicate Work records omitted from this report.`);
}

if (afterGroups.length > 0) {
	lines.push("");
	lines.push("Remaining Duplicate Groups");
	lines.push("==========================");
	for (const group of remainingGroups) {
		lines.push("");
		lines.push(`Work IDs: ${formatList(group.workIds.map(String))}`);
		lines.push(`Why still duplicate: ${group.reasons.join(" ")}`);
		for (const work of group.works) {
			const summary = relationshipSummary(work);
			lines.push(`- Work #${work.workId}: ${work.canonicalTitle}; relationships=${JSON.stringify(summary)}`);
		}
	}
	if (afterGroups.length > remainingGroups.length) lines.push(`\n${afterGroups.length - remainingGroups.length} additional remaining duplicate groups omitted from this report.`);
}

if (isDryRun) {
	lines.push("");
	lines.push("Dry run only. Re-run without --dry-run to move safe references, delete eligible placeholder Works, and rebuild catalog relationships.");
}

console.log(lines.join("\n"));
