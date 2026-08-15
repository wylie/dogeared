import { getNeonSql } from "./neon.ts";
import {
	canonicalCatalogEditionKey,
	canonicalCatalogWorkKey,
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn,
	normalizeCatalogText,
	type CatalogSourceInput
} from "./catalogKeys.ts";
import { ensureCanonicalWorkSchema, resolveRepresentativeBookId } from "./catalogWorks.ts";

export {
	canonicalCatalogWorkKey,
	canonicalCatalogEditionKey,
	canonicalCatalogDisplayWorkKey,
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	dedupeCatalogItemsByDisplayWork,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn,
	normalizeCatalogText,
	type CatalogSource,
	type CatalogSourceInput
} from "./catalogKeys.ts";

export {
	normalizeRedundantSeriesTitle,
	type CanonicalSeriesTitleInput,
	type CanonicalSeriesTitleResult
} from "./canonicalTitles.ts";

export type CatalogBookLookupInput = {
	canonicalWorkKey?: string;
	title?: string;
	author?: string;
	isbn10?: string;
	isbn13?: string;
	googleBooksId?: string;
	sources?: CatalogSourceInput[];
	seriesName?: string;
	seriesBookOrder?: number;
	pageCount?: number | null;
	publishedYear?: number | null;
};

export type CanonicalCatalogResolutionCandidate = {
	bookId: number;
	workId: number;
	authorId: number;
	title: string;
	author: string;
	description: string;
	coverUrl: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	publishedYear: number | null;
	pageCount: number;
	seriesName: string;
	seriesBookOrder: number;
	workKey: string;
	canonicalWorkKey: string;
	editionKeys: string[];
	sourceKeys: string[];
	openLibraryWorkIds: string[];
	openLibraryEditionIds: string[];
	editionGoogleBooksIds: string[];
	editionIsbn10s: string[];
	editionIsbn13s: string[];
	shelfCount: number;
	ratingCount: number;
	averageRating: number;
};

export type CanonicalCatalogResolution = CanonicalCatalogResolutionCandidate & {
	confidenceScore: number;
	reasons: string[];
	representativeBookId: number;
};

export type CanonicalCatalogSearchLookupInput = CatalogBookLookupInput & {
	cacheKey: string;
};

export type CanonicalCatalogSearchLookupResult = {
	resolutions: Map<string, CanonicalCatalogResolution>;
	metrics: {
		dbQueryCount: number;
		externalCandidateCount: number;
		dogEaredCandidateCount: number;
		candidateComparisons: number;
		cacheHits: number;
		cacheMisses: number;
		truncatedCandidateSet: boolean;
	};
	spans: Array<{ name: string; durationMs: number; startMs?: number }>;
};

type CatalogResolutionRow = {
	book_id: number;
	representative_book_id?: number | null;
	work_id: number | null;
	author_id: number | null;
	title: string;
	primary_author: string;
	description: string;
	cover_url: string;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	published_year: number | null;
	page_count: number | null;
	series_name: string;
	series_book_order: number | null;
	work_key: string;
	canonical_work_key: string;
	edition_keys: string[] | null;
	source_keys: string[] | null;
	open_library_work_ids: string[] | null;
	open_library_edition_ids: string[] | null;
	edition_google_books_ids: string[] | null;
	edition_isbn10s: string[] | null;
	edition_isbn13s: string[] | null;
	shelf_count: number;
	rating_count: number;
	average_rating: number | null;
};

function toPositiveNumber(value: unknown) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function textArray(value: unknown) {
	return Array.isArray(value) ? value.map((entry) => normalizeCatalogText(entry)).filter(Boolean) : [];
}

function compactCatalogText(value: unknown) {
	return String(value || "").replace(/[^a-z0-9]/g, "");
}

function sourceLookupKeys(sources: CatalogSourceInput[]) {
	const keys: string[] = [];
	for (const source of sources) {
		for (const sourceKey of getCatalogSourceKeys(source)) {
			keys.push(`${source.source}:${sourceKey}`);
		}
	}
	return Array.from(new Set(keys));
}

function inputIdentity(input: CatalogBookLookupInput) {
	const isbn13 = normalizeCatalogIsbn(input.isbn13);
	const isbn10 = normalizeCatalogIsbn(input.isbn10);
	const googleBooksId = normalizeCatalogText(input.googleBooksId);
	const explicitWorkKey = normalizeCatalogText(input.canonicalWorkKey);
	const canonicalWorkKey = explicitWorkKey || canonicalCatalogWorkKey({
		title: input.title,
		author: input.author,
		isbn10,
		isbn13
	});
	const titleAuthorKey = canonicalCatalogWorkKey({
		title: input.title,
		author: input.author,
		isbn10: "",
		isbn13: ""
	});
	const sources: CatalogSourceInput[] = [...(input.sources || [])];
	if (googleBooksId) sources.push({ source: "google_books", sourceWorkId: googleBooksId });
	const editionKey = canonicalCatalogEditionKey({
		isbn10,
		isbn13,
		googleBooksId,
		sources
	});
	const titleKey = canonicalizeCatalogTitle(input.title);
	const authorKey = canonicalizeCatalogAuthor(input.author);
	const seriesKey = canonicalizeCatalogTitle(input.seriesName);
	return {
		isbn13,
		isbn10,
		googleBooksId,
		canonicalWorkKey,
		titleAuthorKey,
		editionKey,
		titleKey,
		authorKey,
		seriesKey,
		seriesBookOrder: toPositiveNumber(input.seriesBookOrder),
		pageCount: toPositiveNumber(input.pageCount),
		publishedYear: toPositiveNumber(input.publishedYear),
		sourceKeys: sourceLookupKeys(sources),
		openLibraryWorkIds: sources
			.filter((source) => source.source === "open_library")
			.map((source) => normalizeCatalogText(source.sourceWorkId))
			.filter(Boolean),
		openLibraryEditionIds: sources
			.filter((source) => source.source === "open_library")
			.map((source) => normalizeCatalogText(source.sourceEditionId))
			.filter(Boolean)
	};
}

function rowToCandidate(row: CatalogResolutionRow): CanonicalCatalogResolutionCandidate {
	return {
		bookId: toPositiveNumber(row.book_id),
		workId: toPositiveNumber(row.work_id),
		authorId: toPositiveNumber(row.author_id),
		title: normalizeCatalogText(row.title),
		author: normalizeCatalogText(row.primary_author),
		description: normalizeCatalogText(row.description),
		coverUrl: normalizeCatalogText(row.cover_url),
		isbn10: normalizeCatalogIsbn(row.isbn10),
		isbn13: normalizeCatalogIsbn(row.isbn13),
		googleBooksId: normalizeCatalogText(row.google_books_id),
		publishedYear: toPositiveNumber(row.published_year) || null,
		pageCount: toPositiveNumber(row.page_count),
		seriesName: normalizeCatalogText(row.series_name),
		seriesBookOrder: toPositiveNumber(row.series_book_order),
		workKey: normalizeCatalogText(row.work_key),
		canonicalWorkKey: normalizeCatalogText(row.canonical_work_key),
		editionKeys: textArray(row.edition_keys),
		sourceKeys: textArray(row.source_keys),
		openLibraryWorkIds: textArray(row.open_library_work_ids),
		openLibraryEditionIds: textArray(row.open_library_edition_ids),
		editionGoogleBooksIds: textArray(row.edition_google_books_ids),
		editionIsbn10s: textArray(row.edition_isbn10s).map((value) => normalizeCatalogIsbn(value)).filter(Boolean),
		editionIsbn13s: textArray(row.edition_isbn13s).map((value) => normalizeCatalogIsbn(value)).filter(Boolean),
		shelfCount: toPositiveNumber(row.shelf_count),
		ratingCount: toPositiveNumber(row.rating_count),
		averageRating: Number(row.average_rating || 0) || 0
	};
}

function uniqueNonEmpty(values: unknown[]) {
	return Array.from(new Set(values.map((value) => normalizeCatalogText(value)).filter(Boolean)));
}

function uniqueNonEmptyIsbns(values: unknown[]) {
	return Array.from(new Set(values.map((value) => normalizeCatalogIsbn(value)).filter(Boolean)));
}

function hasSharedValue(values: string[], target: string) {
	return !!target && values.some((value) => normalizeCatalogText(value) === target);
}

function hasSharedCatalogIsbn(values: string[], target: string) {
	return !!target && values.some((value) => normalizeCatalogIsbn(value) === target);
}

function hasOverlap(left: string[], right: string[]) {
	const normalized = new Set(left.map((value) => normalizeCatalogText(value)).filter(Boolean));
	return right.some((value) => normalized.has(normalizeCatalogText(value)));
}

export function scoreCanonicalCatalogCandidate(
	input: CatalogBookLookupInput,
	candidate: CanonicalCatalogResolutionCandidate
) {
	const identity = inputIdentity(input);
	let score = 0;
	const reasons: string[] = [];
	const candidateTitle = canonicalizeCatalogTitle(candidate.title);
	const candidateAuthor = canonicalizeCatalogAuthor(candidate.author);
	const candidateSeries = canonicalizeCatalogTitle(candidate.seriesName);
	const sameTitle = !!identity.titleKey && !!candidateTitle && identity.titleKey === candidateTitle;
	const sameAuthor = !!identity.authorKey && !!candidateAuthor && identity.authorKey === candidateAuthor;
	const sameSeriesPosition = !!identity.seriesKey
		&& identity.seriesBookOrder > 0
		&& candidate.seriesBookOrder > 0
		&& identity.seriesKey === candidateSeries
		&& identity.seriesBookOrder === candidate.seriesBookOrder;

	if (hasOverlap(candidate.sourceKeys, identity.sourceKeys)) {
		score = Math.max(score, 100);
		reasons.push("Shared external source mapping.");
	}
	if (
		hasOverlap(candidate.openLibraryWorkIds, identity.openLibraryWorkIds)
		|| hasOverlap(candidate.openLibraryEditionIds, identity.openLibraryEditionIds)
	) {
		score = Math.max(score, 98);
		reasons.push("Shared Open Library identifier.");
	}
	if (
		(identity.googleBooksId && candidate.googleBooksId === identity.googleBooksId)
		|| hasSharedValue(candidate.editionGoogleBooksIds, identity.googleBooksId)
	) {
		score = Math.max(score, 98);
		reasons.push("Shared Google Books identifier.");
	}
	if (
		(identity.isbn13 && (candidate.isbn13 === identity.isbn13 || hasSharedCatalogIsbn(candidate.editionIsbn13s, identity.isbn13)))
		|| (identity.isbn10 && (candidate.isbn10 === identity.isbn10 || hasSharedCatalogIsbn(candidate.editionIsbn10s, identity.isbn10)))
	) {
		score = Math.max(score, sameTitle || sameAuthor ? 98 : 92);
		reasons.push("Shared ISBN evidence.");
	}
	if (identity.editionKey && candidate.editionKeys.includes(identity.editionKey)) {
		score = Math.max(score, 96);
		reasons.push("Shared Edition key.");
	}
	if (
		(identity.canonicalWorkKey && candidate.workKey === identity.canonicalWorkKey)
		|| (identity.titleAuthorKey && candidate.workKey === identity.titleAuthorKey)
		|| (identity.canonicalWorkKey && candidate.canonicalWorkKey === identity.canonicalWorkKey)
		|| (identity.titleAuthorKey && candidate.canonicalWorkKey === identity.titleAuthorKey)
	) {
		score = Math.max(score, 95);
		reasons.push("Shared canonical Work key.");
	}
	if (sameSeriesPosition && sameAuthor) {
		score = Math.max(score, sameTitle ? 98 : 94);
		reasons.push("Same structured series position and author.");
	}
	if (sameTitle && sameAuthor) {
		score = Math.max(score, sameSeriesPosition ? 98 : 90);
		reasons.push("Same canonical title and author.");
	}
	if (sameTitle && sameSeriesPosition) {
		score = Math.max(score, 92);
		reasons.push("Same canonical title and series position.");
	}
	if (sameTitle && !sameAuthor && identity.authorKey && candidateAuthor && compactCatalogText(identity.authorKey) === compactCatalogText(candidateAuthor)) {
		score = Math.max(score, 88);
		reasons.push("Same canonical title and compact author match.");
	}

	if (score > 0 && identity.pageCount > 0 && candidate.pageCount > 0) {
		const delta = Math.abs(identity.pageCount - candidate.pageCount);
		if (delta <= 12 || delta / Math.max(identity.pageCount, candidate.pageCount) <= 0.06) {
			score = Math.min(100, score + 2);
			reasons.push("Compatible page count.");
		}
	}
	if (score > 0 && identity.publishedYear > 0 && candidate.publishedYear && Math.abs(identity.publishedYear - candidate.publishedYear) <= 1) {
		score = Math.min(100, score + 1);
		reasons.push("Compatible publication year.");
	}

	return {
		score: Math.min(100, score),
		reasons: Array.from(new Set(reasons))
	};
}

export async function resolveCanonicalCatalogWork(
	sql: ReturnType<typeof getNeonSql>,
	input: CatalogBookLookupInput,
	options: { minConfidence?: number; skipSchemaBackfill?: boolean } = {}
): Promise<CanonicalCatalogResolution | null> {
	await ensureCanonicalWorkSchema(sql, { backfill: options.skipSchemaBackfill !== true });
	const identity = inputIdentity(input);
	const titleLike = identity.titleKey ? `%${identity.titleKey.split(" ").filter(Boolean).slice(0, 5).join("%")}%` : "";
	const authorLike = identity.authorKey ? `%${identity.authorKey.split(" ").filter(Boolean).slice(0, 4).join("%")}%` : "";
	const seriesLike = identity.seriesKey ? `%${identity.seriesKey.split(" ").filter(Boolean).slice(0, 5).join("%")}%` : "";
	const sourceKeys = identity.sourceKeys;
	const editionKeys = identity.editionKey ? [identity.editionKey] : [];
	const openLibraryWorkIds = identity.openLibraryWorkIds;
	const openLibraryEditionIds = identity.openLibraryEditionIds;

	const rows = await sql<CatalogResolutionRow[]>`
		select
			b.id as book_id,
			b.work_id,
			b.author_id,
			coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
			coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
			coalesce(nullif(trim(b.synopsis), ''), '') as description,
			coalesce(nullif(trim(b.cover_url), ''), nullif(trim(ed.cover_url), ''), nullif(trim(bw.preferred_cover_url), ''), '') as cover_url,
			coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
			b.published_year,
			coalesce(nullif(b.page_count, 0), 0)::int as page_count,
			coalesce(nullif(trim(s.name), ''), '') as series_name,
			coalesce(sb.book_order, bw.series_position, 0)::numeric as series_book_order,
			coalesce(nullif(trim(bw.work_key), ''), '') as work_key,
			coalesce(nullif(trim(b.canonical_work_key), ''), '') as canonical_work_key,
			coalesce(ed.edition_keys, '{}'::text[]) as edition_keys,
			coalesce(src.source_keys, '{}'::text[]) as source_keys,
			coalesce(ed.open_library_work_ids, '{}'::text[]) as open_library_work_ids,
			coalesce(ed.open_library_edition_ids, '{}'::text[]) as open_library_edition_ids,
			coalesce(ed.google_books_ids, '{}'::text[]) as edition_google_books_ids,
			coalesce(ed.isbn10s, '{}'::text[]) as edition_isbn10s,
			coalesce(ed.isbn13s, '{}'::text[]) as edition_isbn13s,
			coalesce(sc.shelf_count, 0)::int as shelf_count,
			coalesce(sc.rating_count, 0)::int as rating_count,
			sc.average_rating as average_rating
		from book b
		left join book_work bw on bw.id = b.work_id
		left join series_book sb on sb.book_id = b.id
		left join series s on s.id = coalesce(sb.series_id, bw.series_id)
		left join lateral (
			select
				array_agg(distinct be.edition_key) filter (where trim(coalesce(be.edition_key, '')) <> '') as edition_keys,
				array_agg(distinct be.open_library_work_id) filter (where trim(coalesce(be.open_library_work_id, '')) <> '') as open_library_work_ids,
				array_agg(distinct be.open_library_edition_id) filter (where trim(coalesce(be.open_library_edition_id, '')) <> '') as open_library_edition_ids,
				array_agg(distinct be.google_books_id) filter (where trim(coalesce(be.google_books_id, '')) <> '') as google_books_ids,
				array_agg(distinct be.isbn10) filter (where trim(coalesce(be.isbn10, '')) <> '') as isbn10s,
				array_agg(distinct be.isbn13) filter (where trim(coalesce(be.isbn13, '')) <> '') as isbn13s,
				(
					select cover_candidate.cover_url
					from book_edition cover_candidate
					where (cover_candidate.book_id = b.id or (b.work_id is not null and cover_candidate.work_id = b.work_id))
						and nullif(trim(cover_candidate.cover_url), '') is not null
					order by
						case when cover_candidate.book_id = b.id then 0 else 1 end,
						cover_candidate.updated_at desc,
						cover_candidate.id desc
					limit 1
				) as cover_url
			from book_edition be
			where be.book_id = b.id
				or (b.work_id is not null and be.work_id = b.work_id)
		) ed on true
		left join lateral (
			select array_agg(distinct bs.source || ':' || bs.source_key) filter (where trim(coalesce(bs.source_key, '')) <> '') as source_keys
			from book_source bs
			where bs.book_id = b.id
		) src on true
		left join lateral (
			select
				count(*)::int as shelf_count,
				count(*) filter (where rating is not null)::int as rating_count,
				avg(rating) filter (where rating is not null) as average_rating
			from user_book ub
			where ub.book_id = b.id
		) sc on true
		where (
			(${identity.googleBooksId} <> '' and (b.google_books_id = ${identity.googleBooksId} or ${identity.googleBooksId} = any(coalesce(ed.google_books_ids, '{}'::text[]))))
			or (${identity.isbn13} <> '' and (b.isbn13 = ${identity.isbn13} or ${identity.isbn13} = any(coalesce(ed.isbn13s, '{}'::text[]))))
			or (${identity.isbn10} <> '' and (b.isbn10 = ${identity.isbn10} or ${identity.isbn10} = any(coalesce(ed.isbn10s, '{}'::text[]))))
			or (${identity.canonicalWorkKey} <> '' and (b.canonical_work_key = ${identity.canonicalWorkKey} or bw.work_key = ${identity.canonicalWorkKey}))
			or (${identity.titleAuthorKey} <> '' and (b.canonical_work_key = ${identity.titleAuthorKey} or bw.work_key = ${identity.titleAuthorKey}))
			or (array_length(${sourceKeys}::text[], 1) is not null and coalesce(src.source_keys, '{}'::text[]) && ${sourceKeys}::text[])
			or (array_length(${editionKeys}::text[], 1) is not null and coalesce(ed.edition_keys, '{}'::text[]) && ${editionKeys}::text[])
			or (array_length(${openLibraryWorkIds}::text[], 1) is not null and coalesce(ed.open_library_work_ids, '{}'::text[]) && ${openLibraryWorkIds}::text[])
			or (array_length(${openLibraryEditionIds}::text[], 1) is not null and coalesce(ed.open_library_edition_ids, '{}'::text[]) && ${openLibraryEditionIds}::text[])
			or (${titleLike} <> '' and lower(coalesce(b.title, '')) like ${titleLike} and (${authorLike} = '' or lower(coalesce(b.primary_author, '')) like ${authorLike}))
			or (${titleLike} <> '' and lower(coalesce(bw.canonical_title, bw.title, '')) like ${titleLike} and (${authorLike} = '' or lower(coalesce(bw.primary_author, '')) like ${authorLike}))
			or (${seriesLike} <> '' and ${identity.seriesBookOrder} > 0 and lower(coalesce(s.name, '')) like ${seriesLike} and coalesce(sb.book_order, bw.series_position, 0) = ${identity.seriesBookOrder})
		)
		order by
			case
				when ${identity.canonicalWorkKey} <> '' and bw.work_key = ${identity.canonicalWorkKey} then 1
				when ${identity.titleAuthorKey} <> '' and bw.work_key = ${identity.titleAuthorKey} then 2
				when ${identity.googleBooksId} <> '' and b.google_books_id = ${identity.googleBooksId} then 3
				when ${identity.isbn13} <> '' and b.isbn13 = ${identity.isbn13} then 4
				when ${identity.isbn10} <> '' and b.isbn10 = ${identity.isbn10} then 5
				when ${identity.canonicalWorkKey} <> '' and b.canonical_work_key = ${identity.canonicalWorkKey} then 6
				when ${identity.titleAuthorKey} <> '' and b.canonical_work_key = ${identity.titleAuthorKey} then 7
				else 9
			end asc,
			coalesce(sc.shelf_count, 0) desc,
			coalesce(sc.rating_count, 0) desc,
			b.updated_at desc,
			b.id desc
		limit 80
	`;

	const scored = rows
		.map(rowToCandidate)
		.map((candidate) => {
			const scoredCandidate = scoreCanonicalCatalogCandidate(input, candidate);
			return { candidate, ...scoredCandidate };
		})
		.filter((candidate) => candidate.score >= (options.minConfidence ?? 85))
		.sort((a, b) => (
			b.score - a.score
			|| b.candidate.shelfCount - a.candidate.shelfCount
			|| b.candidate.ratingCount - a.candidate.ratingCount
			|| a.candidate.bookId - b.candidate.bookId
		));
	const best = scored[0];
	if (!best) return null;
	const representativeBookId = await resolveRepresentativeBookId(sql, best.candidate.bookId, {
		skipSchemaBackfill: options.skipSchemaBackfill === true
	});
	return {
		...best.candidate,
		confidenceScore: best.score,
		reasons: best.reasons,
		representativeBookId,
		bookId: representativeBookId || best.candidate.bookId
	};
}

export async function resolveBestCatalogBookId(
	sql: ReturnType<typeof getNeonSql>,
	input: CatalogBookLookupInput
) {
	const resolution = await resolveCanonicalCatalogWork(sql, input);
	return Number(resolution?.bookId || 0);
}

export async function resolveCanonicalCatalogWorksForSearch(
	sql: ReturnType<typeof getNeonSql>,
	inputs: CanonicalCatalogSearchLookupInput[],
	options: { minConfidence?: number; maxDatabaseCandidates?: number; skipSchemaBackfill?: boolean } = {}
): Promise<CanonicalCatalogSearchLookupResult> {
	const resolverStartedAt = performance.now();
	const spans: Array<{ name: string; durationMs: number; startMs?: number }> = [];
	const span = async <T>(name: string, work: () => Promise<T>) => {
		const startedAt = performance.now();
		try {
			return await work();
		} finally {
			spans.push({
				name,
				startMs: Math.round((startedAt - resolverStartedAt) * 10) / 10,
				durationMs: Math.round((performance.now() - startedAt) * 10) / 10
			});
		}
	};
	const spanSync = <T>(name: string, work: () => T) => {
		const startedAt = performance.now();
		try {
			return work();
		} finally {
			spans.push({
				name,
				startMs: Math.round((startedAt - resolverStartedAt) * 10) / 10,
				durationMs: Math.round((performance.now() - startedAt) * 10) / 10
			});
		}
	};
	const metrics = {
		dbQueryCount: 0,
		externalCandidateCount: inputs.length,
		dogEaredCandidateCount: 0,
		candidateComparisons: 0,
		cacheHits: 0,
		cacheMisses: 0,
		truncatedCandidateSet: false
	};
	const uniqueInputs = spanSync("candidate preparation", () => {
		const byKey = new Map<string, CanonicalCatalogSearchLookupInput>();
		for (const input of inputs) {
			const key = normalizeCatalogText(input.cacheKey);
			if (!key) continue;
			if (byKey.has(key)) {
				metrics.cacheHits += 1;
				continue;
			}
			metrics.cacheMisses += 1;
			byKey.set(key, input);
		}
		return Array.from(byKey.values());
	});
	const identities = uniqueInputs.map((input) => ({ input, identity: inputIdentity(input) }));
	const bookIds = new Set<number>();
	const addBookIds = (rows: Array<{ book_id: number }>) => {
		for (const row of rows) {
			const bookId = toPositiveNumber(row.book_id);
			if (bookId > 0) bookIds.add(bookId);
		}
	};
	await ensureCanonicalWorkSchema(sql, { backfill: options.skipSchemaBackfill !== true });

	const googleBooksIds = uniqueNonEmpty(identities.map(({ identity }) => identity.googleBooksId));
	const sourceKeys = uniqueNonEmpty(identities.flatMap(({ identity }) => identity.sourceKeys));
	if (googleBooksIds.length > 0 || sourceKeys.length > 0) {
		addBookIds(await span("identifier matching", async () => {
			metrics.dbQueryCount += 1;
			return sql<Array<{ book_id: number }>>`
				select b.id as book_id
				from book b
				where array_length(${googleBooksIds}::text[], 1) is not null
					and b.google_books_id = any(${googleBooksIds}::text[])
				union
				select bs.book_id
				from book_source bs
				where array_length(${sourceKeys}::text[], 1) is not null
					and (
						(bs.source || ':' || bs.source_key) = any(${sourceKeys}::text[])
						or (bs.source || ':' || bs.source_work_id) = any(${sourceKeys}::text[])
						or (bs.source || ':' || bs.source_edition_id) = any(${sourceKeys}::text[])
					)
			`;
		}));
	}

	const isbn13s = uniqueNonEmptyIsbns(identities.map(({ identity }) => identity.isbn13));
	const isbn10s = uniqueNonEmptyIsbns(identities.map(({ identity }) => identity.isbn10));
	if (isbn13s.length > 0 || isbn10s.length > 0) {
		addBookIds(await span("ISBN matching", async () => {
			metrics.dbQueryCount += 1;
			return sql<Array<{ book_id: number }>>`
				select b.id as book_id
				from book b
				where (array_length(${isbn13s}::text[], 1) is not null and b.isbn13 = any(${isbn13s}::text[]))
					or (array_length(${isbn10s}::text[], 1) is not null and b.isbn10 = any(${isbn10s}::text[]))
				union
				select coalesce(be.book_id, rb.id) as book_id
				from book_edition be
				left join lateral (
					select b.id
					from book b
					where b.work_id = be.work_id
					order by b.id asc
					limit 1
				) rb on true
				where (array_length(${isbn13s}::text[], 1) is not null and be.isbn13 = any(${isbn13s}::text[]))
					or (array_length(${isbn10s}::text[], 1) is not null and be.isbn10 = any(${isbn10s}::text[]))
			`;
		}));
	}

	const editionKeys = uniqueNonEmpty(identities.map(({ identity }) => identity.editionKey));
	const openLibraryWorkIds = uniqueNonEmpty(identities.flatMap(({ identity }) => identity.openLibraryWorkIds));
	const openLibraryEditionIds = uniqueNonEmpty(identities.flatMap(({ identity }) => identity.openLibraryEditionIds));
	if (editionKeys.length > 0 || openLibraryWorkIds.length > 0 || openLibraryEditionIds.length > 0 || googleBooksIds.length > 0) {
		addBookIds(await span("edition lookup", async () => {
			metrics.dbQueryCount += 1;
			return sql<Array<{ book_id: number }>>`
				select coalesce(be.book_id, rb.id) as book_id
				from book_edition be
				left join lateral (
					select b.id
					from book b
					where b.work_id = be.work_id
					order by b.id asc
					limit 1
				) rb on true
				where (array_length(${editionKeys}::text[], 1) is not null and be.edition_key = any(${editionKeys}::text[]))
					or (array_length(${googleBooksIds}::text[], 1) is not null and be.google_books_id = any(${googleBooksIds}::text[]))
					or (array_length(${openLibraryWorkIds}::text[], 1) is not null and be.open_library_work_id = any(${openLibraryWorkIds}::text[]))
					or (array_length(${openLibraryEditionIds}::text[], 1) is not null and be.open_library_edition_id = any(${openLibraryEditionIds}::text[]))
			`;
		}));
	}

	const workKeys = uniqueNonEmpty(identities.flatMap(({ identity }) => [identity.canonicalWorkKey, identity.titleAuthorKey]));
	if (workKeys.length > 0) {
		addBookIds(await span("normalized title matching", async () => {
			metrics.dbQueryCount += 1;
			return sql<Array<{ book_id: number }>>`
				select b.id as book_id
				from book b
				left join book_work bw on bw.id = b.work_id
				where b.canonical_work_key = any(${workKeys}::text[])
					or bw.work_key = any(${workKeys}::text[])
			`;
		}));
	}

	const seriesKeys = uniqueNonEmpty(identities.map(({ input, identity }) => {
		const rawSeries = normalizeCatalogText(input.seriesName).toLowerCase();
		const rawAuthor = normalizeCatalogText(input.author).toLowerCase();
		if (!rawSeries || !rawAuthor || identity.seriesBookOrder <= 0) return "";
		return `${rawSeries}|${identity.seriesBookOrder}|${rawAuthor}`;
	}));
	if (seriesKeys.length > 0) {
		addBookIds(await span("series matching", async () => {
			metrics.dbQueryCount += 1;
			return sql<Array<{ book_id: number }>>`
				select b.id as book_id
				from book b
				left join book_work bw on bw.id = b.work_id
				left join series_book sb on sb.book_id = b.id
				left join series s on s.id = coalesce(sb.series_id, bw.series_id)
				where (
					lower(coalesce(s.name, ''))
					|| '|'
					|| trim((coalesce(sb.book_order, bw.series_position, 0))::text)
					|| '|'
					|| lower(coalesce(nullif(trim(b.primary_author), ''), nullif(trim(bw.primary_author), ''), ''))
				) = any(${seriesKeys}::text[])
			`;
		}));
	}

	const maxDatabaseCandidates = Math.max(20, Math.min(400, Math.floor(Number(options.maxDatabaseCandidates || 160))));
	const candidateIds = Array.from(bookIds).slice(0, maxDatabaseCandidates);
	metrics.truncatedCandidateSet = bookIds.size > candidateIds.length;
	const candidates = candidateIds.length > 0 ? await span("existing Work lookup", async () => {
		metrics.dbQueryCount += 1;
		return sql<CatalogResolutionRow[]>`
			select
				b.id as book_id,
				coalesce(rep.representative_book_id, b.id) as representative_book_id,
				b.work_id,
				b.author_id,
				coalesce(nullif(trim(b.title), ''), 'Untitled') as title,
				coalesce(nullif(trim(b.primary_author), ''), '') as primary_author,
				coalesce(nullif(trim(b.synopsis), ''), '') as description,
				coalesce(nullif(trim(b.cover_url), ''), nullif(trim(ed.cover_url), ''), nullif(trim(bw.preferred_cover_url), ''), '') as cover_url,
				coalesce(nullif(trim(b.isbn10), ''), '') as isbn10,
				coalesce(nullif(trim(b.isbn13), ''), '') as isbn13,
				coalesce(nullif(trim(b.google_books_id), ''), '') as google_books_id,
				b.published_year,
				coalesce(nullif(b.page_count, 0), 0)::int as page_count,
				coalesce(nullif(trim(s.name), ''), '') as series_name,
				coalesce(sb.book_order, bw.series_position, 0)::numeric as series_book_order,
				coalesce(nullif(trim(bw.work_key), ''), '') as work_key,
				coalesce(nullif(trim(b.canonical_work_key), ''), '') as canonical_work_key,
				coalesce(ed.edition_keys, '{}'::text[]) as edition_keys,
				coalesce(src.source_keys, '{}'::text[]) as source_keys,
				coalesce(ed.open_library_work_ids, '{}'::text[]) as open_library_work_ids,
				coalesce(ed.open_library_edition_ids, '{}'::text[]) as open_library_edition_ids,
				coalesce(ed.google_books_ids, '{}'::text[]) as edition_google_books_ids,
				coalesce(ed.isbn10s, '{}'::text[]) as edition_isbn10s,
				coalesce(ed.isbn13s, '{}'::text[]) as edition_isbn13s,
				coalesce(sc.shelf_count, 0)::int as shelf_count,
				coalesce(sc.rating_count, 0)::int as rating_count,
				sc.average_rating as average_rating
			from book b
			left join book_work bw on bw.id = b.work_id
			left join series_book sb on sb.book_id = b.id
			left join series s on s.id = coalesce(sb.series_id, bw.series_id)
			left join lateral (
				select
					array_agg(distinct be.edition_key) filter (where trim(coalesce(be.edition_key, '')) <> '') as edition_keys,
					array_agg(distinct be.open_library_work_id) filter (where trim(coalesce(be.open_library_work_id, '')) <> '') as open_library_work_ids,
					array_agg(distinct be.open_library_edition_id) filter (where trim(coalesce(be.open_library_edition_id, '')) <> '') as open_library_edition_ids,
					array_agg(distinct be.google_books_id) filter (where trim(coalesce(be.google_books_id, '')) <> '') as google_books_ids,
					array_agg(distinct be.isbn10) filter (where trim(coalesce(be.isbn10, '')) <> '') as isbn10s,
					array_agg(distinct be.isbn13) filter (where trim(coalesce(be.isbn13, '')) <> '') as isbn13s,
					(
						select cover_candidate.cover_url
						from book_edition cover_candidate
						where (cover_candidate.book_id = b.id or (b.work_id is not null and cover_candidate.work_id = b.work_id))
							and nullif(trim(cover_candidate.cover_url), '') is not null
						order by
							case when cover_candidate.book_id = b.id then 0 else 1 end,
							cover_candidate.updated_at desc,
							cover_candidate.id desc
						limit 1
					) as cover_url
				from book_edition be
				where be.book_id = b.id
					or (b.work_id is not null and be.work_id = b.work_id)
			) ed on true
			left join lateral (
				select array_agg(distinct bs.source || ':' || bs.source_key) filter (where trim(coalesce(bs.source_key, '')) <> '') as source_keys
				from book_source bs
				where bs.book_id = b.id
			) src on true
			left join lateral (
				select
					count(*)::int as shelf_count,
					count(*) filter (where rating is not null)::int as rating_count,
					avg(rating) filter (where rating is not null) as average_rating
				from user_book ub
				where ub.book_id = b.id
			) sc on true
			left join lateral (
				select rb.id as representative_book_id
				from book rb
				left join lateral (
					select
						count(*)::int as shelf_count,
						count(*) filter (where rating is not null)::int as rating_count
					from user_book ub
					where ub.book_id = rb.id
				) rsc on true
				where b.work_id is not null and rb.work_id = b.work_id
				order by
					coalesce(rsc.shelf_count, 0) desc,
					coalesce(rsc.rating_count, 0) desc,
					(nullif(trim(coalesce(rb.cover_url, '')), '') is not null) desc,
					(nullif(trim(coalesce(rb.synopsis, '')), '') is not null) desc,
					rb.id asc
				limit 1
			) rep on true
			where b.id = any(${candidateIds}::bigint[])
			limit ${maxDatabaseCandidates}
		`;
	}) : [];
	const catalogCandidates = candidates.map((row) => {
		const candidate = rowToCandidate(row);
		const representativeBookId = toPositiveNumber(row.representative_book_id) || candidate.bookId;
		return {
			...candidate,
			representativeBookId,
			bookId: representativeBookId || candidate.bookId
		};
	});
	metrics.dogEaredCandidateCount = catalogCandidates.length;

	const resolutions = spanSync("candidate scoring", () => {
		const out = new Map<string, CanonicalCatalogResolution>();
		for (const { input } of identities) {
			const scored = catalogCandidates
				.map((candidate) => {
					metrics.candidateComparisons += 1;
					const score = scoreCanonicalCatalogCandidate(input, candidate);
					return { candidate, ...score };
				})
				.filter((candidate) => candidate.score >= (options.minConfidence ?? 85))
				.sort((a, b) => (
					b.score - a.score
					|| b.candidate.shelfCount - a.candidate.shelfCount
					|| b.candidate.ratingCount - a.candidate.ratingCount
					|| a.candidate.bookId - b.candidate.bookId
				));
			const best = scored[0];
			if (!best) continue;
			out.set(input.cacheKey, {
				...best.candidate,
				confidenceScore: best.score,
				reasons: best.reasons,
				representativeBookId: best.candidate.representativeBookId || best.candidate.bookId
			});
		}
		return out;
	});

	spanSync("dedupe", () => resolutions.size);

	return { resolutions, metrics, spans };
}

export async function upsertBookSources(
	sql: ReturnType<typeof getNeonSql>,
	bookId: number,
	sources: CatalogSourceInput[]
) {
	for (const source of sources) {
		const sourceKey = getCatalogSourceKey(source);
		if (!sourceKey) continue;
		await sql`
			insert into book_source (
				book_id,
				source,
				source_key,
				source_work_id,
				source_edition_id,
				source_url,
				last_synced_at
			)
			values (
				${bookId},
				${source.source},
				${sourceKey},
				${normalizeCatalogText(source.sourceWorkId)},
				${normalizeCatalogText(source.sourceEditionId)},
				${normalizeCatalogText(source.sourceUrl)},
				now()
			)
			on conflict (source, source_key) do update set
				book_id = excluded.book_id,
				source_work_id = case when excluded.source_work_id <> '' then excluded.source_work_id else book_source.source_work_id end,
				source_edition_id = case when excluded.source_edition_id <> '' then excluded.source_edition_id else book_source.source_edition_id end,
				source_url = case when excluded.source_url <> '' then excluded.source_url else book_source.source_url end,
				last_synced_at = now()
		`;
	}
}
