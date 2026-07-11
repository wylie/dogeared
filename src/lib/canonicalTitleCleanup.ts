import type { getNeonSql } from "./neon.ts";
import { canonicalCatalogWorkKey } from "./catalogKeys.ts";
import { normalizeRedundantSeriesTitle } from "./canonicalTitles.ts";

type Sql = ReturnType<typeof getNeonSql>;

type CandidateRow = {
	book_id: number;
	work_id: number | null;
	title: string;
	primary_author: string;
	series_name: string;
	book_order: number;
	updated_at: string;
};

type WorkCandidateRow = {
	work_id: number;
	title: string;
	canonical_title: string;
	primary_author: string;
	series_name: string;
	book_order: number;
};

export type CanonicalTitleCleanupCandidate = {
	bookId: number;
	workId: number;
	title: string;
	normalizedTitle: string;
	removedSuffix: string;
	primaryAuthor: string;
	workKey: string;
	seriesName: string;
	bookOrder: number;
	updatedAt: string;
};

function normalizeLimit(limit: number) {
	const parsed = Number(limit || 0);
	if (!Number.isFinite(parsed) || parsed <= 0) return 50;
	return Math.min(500, Math.floor(parsed));
}

function toCandidate(row: CandidateRow): CanonicalTitleCleanupCandidate | null {
	const normalized = normalizeRedundantSeriesTitle({
		title: row.title,
		seriesName: row.series_name,
		bookOrder: row.book_order
	});
	if (!normalized.changed) return null;
	return {
		bookId: Number(row.book_id || 0),
		workId: Number(row.work_id || 0),
		title: String(row.title || "").trim(),
		normalizedTitle: normalized.title,
		removedSuffix: normalized.removedSuffix,
		primaryAuthor: String(row.primary_author || "").trim(),
		workKey: canonicalCatalogWorkKey({ title: row.title, author: row.primary_author }),
		seriesName: String(row.series_name || "").trim(),
		bookOrder: Number(row.book_order || 0),
		updatedAt: String(row.updated_at || "")
	};
}

export async function loadCanonicalTitleCleanupCandidates(sql: Sql, limit = 50) {
	const normalizedLimit = normalizeLimit(limit);
	const rows = await sql<CandidateRow[]>`
		select distinct on (b.id)
			b.id as book_id,
			b.work_id,
			coalesce(nullif(trim(b.title), ''), '') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			coalesce(sb.book_order, 0)::numeric as book_order,
			b.updated_at::text as updated_at
		from book b
		join series_book sb on sb.book_id = b.id
		join series s on s.id = sb.series_id
		where coalesce(sb.book_order, 0) > 0
			and trim(coalesce(s.name, '')) <> ''
			and b.title ~ '\\([^)]*\\)\\s*$'
		order by b.id, sb.updated_at desc nulls last, s.id asc
		limit ${normalizedLimit * 4}
	`;
	return rows.map(toCandidate).filter((candidate): candidate is CanonicalTitleCleanupCandidate => !!candidate).slice(0, normalizedLimit);
}

export async function normalizeCanonicalSeriesTitles(sql: Sql, limit = 500) {
	const candidates = await loadCanonicalTitleCleanupCandidates(sql, limit);
	let updated = 0;
	for (const candidate of candidates) {
		const rows = await sql<Array<{ id: number }>>`
			update book
			set
				title = ${candidate.normalizedTitle},
				updated_at = now()
			where id = ${candidate.bookId}
				and title = ${candidate.title}
			returning id
		`;
		if (rows.length === 0) continue;
		updated += 1;
		if (candidate.workId > 0 || candidate.workKey) {
			await sql`
				update book_work
				set
					title = case when title = ${candidate.title} then ${candidate.normalizedTitle} else title end,
					canonical_title = case
						when canonical_title = ${candidate.title} or trim(coalesce(canonical_title, '')) = '' then ${candidate.normalizedTitle}
						else canonical_title
					end,
					updated_at = now()
				where (id = ${candidate.workId} or (${candidate.workKey} <> '' and work_key = ${candidate.workKey}))
					and (
						title = ${candidate.title}
						or canonical_title = ${candidate.title}
						or trim(coalesce(canonical_title, '')) = ''
					)
			`;
		}
	}
	const remainingLimit = Math.max(0, normalizeLimit(limit) - candidates.length);
	let checkedWorkTitles = 0;
	if (remainingLimit > 0) {
		const workRows = await sql<WorkCandidateRow[]>`
			select distinct on (bw.id)
				bw.id as work_id,
				coalesce(nullif(trim(bw.title), ''), '') as title,
				coalesce(nullif(trim(bw.canonical_title), ''), '') as canonical_title,
				coalesce(nullif(trim(bw.primary_author), ''), '') as primary_author,
				coalesce(nullif(trim(s.name), ''), '') as series_name,
				coalesce(bw.series_position, 0)::numeric as book_order
			from book_work bw
			join series s on s.id = bw.series_id
			where coalesce(bw.series_position, 0) > 0
				and trim(coalesce(s.name, '')) <> ''
				and (
					bw.title ~ '\\([^)]*\\)\\s*$'
					or bw.canonical_title ~ '\\([^)]*\\)\\s*$'
				)
			order by bw.id, bw.updated_at desc nulls last
			limit ${remainingLimit}
		`;
		for (const row of workRows) {
			const normalizedTitle = normalizeRedundantSeriesTitle({
				title: row.title,
				seriesName: row.series_name,
				bookOrder: row.book_order
			});
			const normalizedCanonicalTitle = normalizeRedundantSeriesTitle({
				title: row.canonical_title,
				seriesName: row.series_name,
				bookOrder: row.book_order
			});
			if (!normalizedTitle.changed && !normalizedCanonicalTitle.changed) continue;
			checkedWorkTitles += 1;
			const rows = await sql<Array<{ id: number }>>`
				update book_work
				set
					title = case when ${normalizedTitle.changed} then ${normalizedTitle.title} else title end,
					canonical_title = case when ${normalizedCanonicalTitle.changed} then ${normalizedCanonicalTitle.title} else canonical_title end,
					updated_at = now()
				where id = ${Number(row.work_id || 0)}
				returning id
			`;
			if (rows.length > 0) updated += 1;
		}
	}
	return {
		checked: candidates.length + checkedWorkTitles,
		updated,
		candidates
	};
}
