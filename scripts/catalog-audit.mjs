import { neon } from "@neondatabase/serverless";
import { canonicalizeCatalogAuthor, canonicalizeCatalogTitle, normalizeCatalogIsbn } from "../src/lib/catalogKeys.ts";
import { normalizeRedundantEditionTitle, normalizeRedundantSeriesTitle } from "../src/lib/canonicalTitles.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(0, Math.min(1000, Number(limitArg?.split("=")[1] || 0) || 0));

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

function jsonArray(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => item && typeof item === "object");
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

function compact(value) {
	return text(value).replace(/\s+/g, " ");
}

function plural(count, singular, pluralLabel = `${singular}s`) {
	return `${Number(count || 0).toLocaleString()} ${Number(count || 0) === 1 ? singular : pluralLabel}`;
}

function formatList(values, fallback = "none") {
	const list = unique(values);
	return list.length > 0 ? list.join(", ") : fallback;
}

function addSignal(map, key, workId) {
	const normalized = text(key);
	if (!normalized) return;
	const set = map.get(normalized) || new Set();
	set.add(workId);
	map.set(normalized, set);
}

function groupKeyFor(workIds) {
	return Array.from(workIds).map(String).sort((a, b) => Number(a) - Number(b)).join("|");
}

function buildPotentialDuplicateGroups(works) {
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
		const key = groupKeyFor(workIds);
		const group = groups.get(key) || { workIds: Array.from(workIds).map(Number), reasons: [] };
		if (!group.reasons.includes(reason)) group.reasons.push(reason);
		groups.set(key, group);
	};

	for (const [key, workIds] of byTitleAuthor.entries()) {
		addGroupReason(workIds, `Same canonical title and author (${key}).`);
	}
	for (const [key, workIds] of bySeriesPositionAuthor.entries()) {
		addGroupReason(workIds, `Same structured series position and author (${key}).`);
	}
	for (const [key, workIds] of byIsbn.entries()) {
		addGroupReason(workIds, `Shared ISBN (${key}).`);
	}
	for (const [key, workIds] of byExternalId.entries()) {
		addGroupReason(workIds, `Shared external provider ID (${key}).`);
	}
	for (const [key, workIds] of byCanonicalBookKey.entries()) {
		addGroupReason(workIds, `Shared compatibility canonical Work key (${key}).`);
	}
	for (const [key, workIds] of byEditionKey.entries()) {
		addGroupReason(workIds, `Shared Edition key (${key}).`);
	}

	return Array.from(groups.values())
		.map((group) => ({
			...group,
			works: group.workIds.map((id) => works.find((work) => work.workId === id)).filter(Boolean)
		}))
		.filter((group) => group.works.length > 1)
		.sort((a, b) => (
			b.reasons.length - a.reasons.length
			|| b.works.reduce((sum, work) => sum + work.readerCount + work.shelfCount, 0) - a.works.reduce((sum, work) => sum + work.readerCount + work.shelfCount, 0)
			|| Math.min(...a.workIds) - Math.min(...b.workIds)
		));
}

function duplicateEditionCount(works) {
	const byEditionSignal = new Map();
	for (const work of works) {
		for (const edition of work.editions) {
			const signals = [
				edition.editionKey ? `edition:${edition.editionKey}` : "",
				edition.isbn13 ? `isbn:${edition.isbn13}` : "",
				edition.isbn10 ? `isbn:${edition.isbn10}` : "",
				edition.googleBooksId ? `google_books:${edition.googleBooksId}` : "",
				edition.openLibraryWorkId ? `open_library_work:${edition.openLibraryWorkId}` : "",
				edition.openLibraryEditionId ? `open_library_edition:${edition.openLibraryEditionId}` : ""
			].filter(Boolean);
			for (const signal of signals) {
				const workIds = byEditionSignal.get(signal) || new Set();
				workIds.add(work.workId);
				byEditionSignal.set(signal, workIds);
			}
		}
	}
	return Array.from(byEditionSignal.values()).filter((workIds) => workIds.size > 1).length;
}

function section(title) {
	return `\n${title}\n${"=".repeat(title.length)}`;
}

function renderWorkLine(work) {
	const editionIds = work.editions.map((edition) => edition.id).filter(Boolean);
	const externalIds = work.externalIds;
	return [
		`Work #${work.workId}: ${work.canonicalTitle}`,
		`  Author: ${work.author || "Unknown"}`,
		`  Series: ${work.seriesName || "none"}${work.seriesPosition > 0 ? ` • Book ${work.seriesPosition}` : ""}`,
		`  Representative books: ${formatList(work.bookIds.map(String))}`,
		`  Edition IDs: ${formatList(editionIds.map(String))}`,
		`  ISBNs: ${formatList(work.isbns)}`,
		`  External IDs: ${formatList(externalIds)}`,
		`  Shelves: ${work.shelfCount} • Readers: ${work.readerCount} • Reviews: ${work.reviewCount} • Activity: ${work.activityCount} • Recommendations: ${work.recommendationCount}`
	].join("\n");
}

const rows = await sql`
	select
		bw.id as work_id,
		coalesce(nullif(trim(bw.title), ''), '') as title,
		coalesce(nullif(trim(bw.canonical_title), ''), '') as canonical_title,
		coalesce(nullif(trim(bw.primary_author), ''), '') as primary_author,
		bw.author_id,
		bw.series_id,
		coalesce(nullif(trim(s.name), ''), '') as series_name,
		bw.series_position,
		coalesce(nullif(trim(bw.preferred_cover_url), ''), '') as preferred_cover_url,
		coalesce(books.book_ids, array[]::bigint[]) as book_ids,
		coalesce(books.canonical_work_keys, array[]::text[]) as canonical_work_keys,
		coalesce(books.cover_urls, array[]::text[]) as book_cover_urls,
		coalesce(books.isbn10s, array[]::text[]) as book_isbn10s,
		coalesce(books.isbn13s, array[]::text[]) as book_isbn13s,
		coalesce(books.google_books_ids, array[]::text[]) as book_google_books_ids,
		coalesce(books.source_ids, array[]::text[]) as source_ids,
		coalesce(editions.editions, '[]'::jsonb) as editions,
		coalesce(editions.edition_keys, array[]::text[]) as edition_keys,
		coalesce(editions.isbn10s, array[]::text[]) as edition_isbn10s,
		coalesce(editions.isbn13s, array[]::text[]) as edition_isbn13s,
		coalesce(editions.external_ids, array[]::text[]) as edition_external_ids,
		coalesce(metrics.shelf_count, 0)::int as shelf_count,
		coalesce(metrics.reader_count, 0)::int as reader_count,
		coalesce(metrics.review_count, 0)::int as review_count,
		coalesce(metrics.activity_count, 0)::int as activity_count,
		coalesce(metrics.recommendation_count, 0)::int as recommendation_count
	from book_work bw
	left join series s on s.id = bw.series_id
	left join lateral (
		select
			array_agg(distinct b.id order by b.id) as book_ids,
			array_agg(distinct b.canonical_work_key) filter (where trim(coalesce(b.canonical_work_key, '')) <> '') as canonical_work_keys,
			array_agg(distinct b.cover_url) filter (where trim(coalesce(b.cover_url, '')) <> '') as cover_urls,
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
			jsonb_agg(jsonb_build_object(
				'id', be.id,
				'bookId', be.book_id,
				'editionKey', be.edition_key,
				'isbn10', be.isbn10,
				'isbn13', be.isbn13,
				'coverUrl', be.cover_url,
				'googleBooksId', be.google_books_id,
				'openLibraryWorkId', be.open_library_work_id,
				'openLibraryEditionId', be.open_library_edition_id
			) order by be.id) as editions,
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
			count(ub.*)::int as shelf_count,
			count(distinct ub.user_id)::int as reader_count,
			count(*) filter (
				where ub.rating is not null
					or trim(coalesce(ub.review_title, '')) <> ''
					or trim(coalesce(ub.finished_reflection, '')) <> ''
			)::int as review_count,
			(select count(*)::int from user_activity ua join book b on b.id = ua.book_id where b.work_id = bw.id) as activity_count,
			(select count(*)::int from user_recommendation_feedback rf join book b on b.id = rf.book_id where b.work_id = bw.id) as recommendation_count
		from user_book ub
		join book b on b.id = ub.book_id
		where b.work_id = bw.id
	) metrics on true
	order by bw.id asc
`;

const works = rows.map((row) => {
	const canonicalTitle = canonicalWorkTitle(row);
	const author = text(row.primary_author);
	const seriesName = text(row.series_name);
	const seriesPosition = number(row.series_position);
	const editions = jsonArray(row.editions).map((edition) => ({
		id: number(edition.id),
		bookId: number(edition.bookId),
		editionKey: text(edition.editionKey),
		isbn10: normalizeCatalogIsbn(edition.isbn10),
		isbn13: normalizeCatalogIsbn(edition.isbn13),
		coverUrl: text(edition.coverUrl),
		googleBooksId: text(edition.googleBooksId),
		openLibraryWorkId: text(edition.openLibraryWorkId),
		openLibraryEditionId: text(edition.openLibraryEditionId)
	}));
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
		authorId: number(row.author_id),
		seriesId: number(row.series_id),
		seriesName,
		seriesKey: canonicalizeCatalogTitle(seriesName),
		seriesPosition,
		preferredCoverUrl: text(row.preferred_cover_url),
		bookIds: textArray(row.book_ids).map(number).filter(Boolean),
		canonicalBookKeys: textArray(row.canonical_work_keys),
		bookCoverUrls: textArray(row.book_cover_urls),
		editions,
		editionKeys: textArray(row.edition_keys),
		isbns,
		externalIds,
		shelfCount: number(row.shelf_count),
		readerCount: number(row.reader_count),
		reviewCount: number(row.review_count),
		activityCount: number(row.activity_count),
		recommendationCount: number(row.recommendation_count)
	};
});

const duplicateGroups = buildPotentialDuplicateGroups(works);
const duplicateEditions = duplicateEditionCount(works);
const worksMissingSeries = works.filter((work) => work.seriesId <= 0 && work.seriesPosition <= 0).length;
const worksMissingCovers = works.filter((work) => !work.preferredCoverUrl && work.bookCoverUrls.length === 0 && !work.editions.some((edition) => edition.coverUrl)).length;
const worksMissingAuthors = works.filter((work) => !work.author && work.authorId <= 0).length;

const lines = [
	"DogEared Catalog Audit",
	`Generated: ${new Date().toISOString()}`,
	"Mode: read-only",
	section("Summary"),
	`Total Works: ${works.length.toLocaleString()}`,
	`Total Editions: ${works.reduce((sum, work) => sum + work.editions.length, 0).toLocaleString()}`,
	`Duplicate Work groups: ${duplicateGroups.length.toLocaleString()}`,
	`Duplicate Editions: ${duplicateEditions.toLocaleString()}`,
	`Works missing Series: ${worksMissingSeries.toLocaleString()}`,
	`Works missing Covers: ${worksMissingCovers.toLocaleString()}`,
	`Works missing Authors: ${worksMissingAuthors.toLocaleString()}`
];

const visibleGroups = limit > 0 ? duplicateGroups.slice(0, limit) : duplicateGroups;
lines.push(section("Potential Duplicate Works"));
if (visibleGroups.length === 0) {
	lines.push("No potential duplicate Work groups found.");
} else {
	for (const [index, group] of visibleGroups.entries()) {
		const sortedWorks = [...group.works].sort((a, b) => a.workId - b.workId);
		const primary = sortedWorks[0];
		lines.push("");
		lines.push(`Group ${index + 1}: ${primary.canonicalTitle}`);
		lines.push("-".repeat(`Group ${index + 1}: ${primary.canonicalTitle}`.length));
		lines.push(`Canonical Title: ${primary.canonicalTitle}`);
		lines.push(`Series: ${formatList(sortedWorks.map((work) => work.seriesName), "none")}`);
		lines.push(`Series Position: ${formatList(sortedWorks.map((work) => work.seriesPosition > 0 ? String(work.seriesPosition) : ""), "none")}`);
		lines.push(`Work IDs: ${formatList(sortedWorks.map((work) => String(work.workId)))}`);
		lines.push(`Edition IDs: ${formatList(sortedWorks.flatMap((work) => work.editions.map((edition) => String(edition.id))))}`);
		lines.push(`ISBNs: ${formatList(sortedWorks.flatMap((work) => work.isbns))}`);
		lines.push(`External IDs: ${formatList(sortedWorks.flatMap((work) => work.externalIds))}`);
		lines.push("Why considered duplicates:");
		for (const reason of group.reasons) lines.push(`  - ${reason}`);
		lines.push("Records:");
		for (const work of sortedWorks) lines.push(renderWorkLine(work));
	}
	if (limit > 0 && duplicateGroups.length > visibleGroups.length) {
		lines.push("");
		lines.push(`Showing ${plural(visibleGroups.length, "group")} of ${plural(duplicateGroups.length, "group")}. Re-run with --limit=0 for all groups.`);
	}
}

console.log(lines.join("\n"));
