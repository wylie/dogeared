import type { getNeonSql } from "./neon";

type Sql = ReturnType<typeof getNeonSql>;

export type CatalogHealthSeverity = "critical" | "needs_attention" | "optional";

export type CatalogHealthIssue = {
	issueType: string;
	severity: CatalogHealthSeverity;
	workId: number;
	bookId: number;
	editionId: number;
	title: string;
	author: string;
	coverUrl: string;
	format: string;
	source: string;
	issue: string;
	updatedAt: string;
};

export type CatalogHealthResult = {
	issues: CatalogHealthIssue[];
	summary: CatalogHealthSummary;
	pagination: CatalogHealthPagination;
	facets: CatalogHealthFacets;
};

export type CatalogHealthFilters = {
	q?: string;
	issueType?: string;
	severity?: string;
	format?: string;
	provider?: string;
	limit?: number;
	offset?: number;
};

export type CatalogHealthSummary = {
	totalIssues: number;
	critical: number;
	needsAttention: number;
	optional: number;
	missingPageCounts: number;
	missingAudiobookDurations: number;
	potentialDuplicates: number;
	progressBlocking: number;
};

export type CatalogHealthPagination = {
	limit: number;
	offset: number;
	total: number;
};

export type CatalogHealthFacets = {
	formats: string[];
	providers: string[];
};

export type CatalogEditorData = {
	work: {
		id: number;
		bookId: number;
		title: string;
		canonicalTitle: string;
		primaryAuthor: string;
		description: string;
		subjects: string[];
		genres: string[];
		seriesId: number;
		seriesName: string;
		seriesPosition: string;
		originalPublicationYear: number;
		preferredCoverUrl: string;
		metadata: Record<string, unknown>;
		updatedAt: string;
	};
	editions: Array<{
		id: number;
		bookId: number;
		editionKey: string;
		title: string;
		format: string;
		isbn10: string;
		isbn13: string;
		publisher: string;
		publicationDate: string;
		publicationYear: number;
		pageCount: number;
		coverUrl: string;
		googleBooksId: string;
		openLibraryWorkId: string;
		openLibraryEditionId: string;
		language: string;
		durationSeconds: number;
		locationCount: number;
		chapterCount: number;
		metadata: Record<string, unknown>;
		updatedAt: string;
	}>;
	seriesOptions: Array<{ id: number; name: string }>;
	impact: {
		readers: number;
		shelfEntries: number;
		progressEvents: number;
		journalEntries: number;
		editionCount: number;
	};
	auditEvents: Array<{
		id: number;
		entityType: string;
		entityId: number;
		adminUsername: string;
		changedFields: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
		createdAt: string;
	}>;
};

const KNOWN_FORMAT_OPTIONS = ["", "hardcover", "paperback", "ebook", "kindle", "audiobook", "audio", "library binding"];

export function catalogEditorFormatOptions() {
	return KNOWN_FORMAT_OPTIONS;
}

function normalizeText(value: unknown, maxLength = 5000) {
	return String(value || "").trim().slice(0, maxLength);
}

function normalizeInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function normalizePositiveYear(value: unknown) {
	const year = normalizeInt(value);
	const currentYear = new Date().getUTCFullYear() + 3;
	return year >= 1400 && year <= currentYear ? year : 0;
}

function normalizeDecimalText(value: unknown) {
	const raw = normalizeText(value, 40);
	if (!raw) return "";
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return "";
	return raw;
}

function splitList(value: unknown) {
	return normalizeText(value)
		.split(/[,\n]/)
		.map((item) => item.trim())
		.filter(Boolean)
		.slice(0, 80);
}

function normalizeIsbn(value: unknown, length: 10 | 13) {
	const raw = normalizeText(value, 40).replace(/[^0-9Xx]/g, "").toUpperCase();
	if (!raw) return "";
	return raw.length === length ? raw : "";
}

function hasMalformedIsbn(value: unknown, length: 10 | 13) {
	const raw = normalizeText(value, 40);
	if (!raw) return false;
	return normalizeIsbn(raw, length).length !== length;
}

function isValidPublicationDate(value: unknown) {
	const raw = normalizeText(value, 80);
	if (!raw) return true;
	if (/^\d{4}$/.test(raw)) return normalizePositiveYear(raw) > 0;
	if (/^\d{4}-\d{2}$/.test(raw)) return Number.isFinite(new Date(`${raw}-01T00:00:00Z`).getTime());
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Number.isFinite(new Date(`${raw}T00:00:00Z`).getTime());
	return Number.isFinite(new Date(raw).getTime());
}

export function isAudiobookFormat(value: unknown) {
	return /\b(audio|audiobook|audible|listening)\b/i.test(normalizeText(value, 80));
}

export function isDigitalLocationFormat(value: unknown) {
	return /\b(kindle|ebook|e-book|digital)\b/i.test(normalizeText(value, 80));
}

export function parseDurationToSeconds(value: unknown) {
	const raw = normalizeText(value, 80).toLowerCase();
	if (!raw) return 0;
	if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 60));
	let seconds = 0;
	const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
	const minuteMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
	const secondMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
	if (hourMatch) seconds += Number(hourMatch[1]) * 3600;
	if (minuteMatch) seconds += Number(minuteMatch[1]) * 60;
	if (secondMatch) seconds += Number(secondMatch[1]);
	if (seconds > 0 && Number.isFinite(seconds)) return Math.round(seconds);
	const colon = raw.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
	if (!colon) return 0;
	const a = Number(colon[1]);
	const b = Number(colon[2]);
	const c = Number(colon[3] || 0);
	return colon[3] ? (a * 3600) + (b * 60) + c : (a * 60) + b;
}

export function formatDuration(seconds: unknown) {
	const total = normalizeInt(seconds);
	if (total <= 0) return "";
	const hours = Math.floor(total / 3600);
	const minutes = Math.round((total % 3600) / 60);
	if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
	if (hours > 0) return `${hours} hr`;
	return `${minutes} min`;
}

function readMetadataObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function metadataInt(metadata: Record<string, unknown>, key: string) {
	return normalizeInt(metadata[key]);
}

function extractProvider(metadata: Record<string, unknown>, fallback: string) {
	const provenance = readMetadataObject(metadata.provenance);
	const source = normalizeText(provenance.source || metadata.source || fallback, 80);
	return source || fallback || "Existing DogEared data";
}

function normalizeHealthIssueType(value: string) {
	return value.replace(/[^a-z0-9_:-]+/gi, "_").toLowerCase();
}

function issueMatchesFilters(issue: CatalogHealthIssue, filters: CatalogHealthFilters) {
	const q = normalizeText(filters.q, 160).toLowerCase();
	if (q && !`${issue.title} ${issue.author} ${issue.workId} ${issue.bookId} ${issue.editionId}`.toLowerCase().includes(q)) return false;
	if (filters.issueType && filters.issueType !== "all" && issue.issueType !== filters.issueType) return false;
	if (filters.severity && filters.severity !== "all" && issue.severity !== filters.severity) return false;
	if (filters.format && filters.format !== "all" && normalizeText(issue.format || "unknown").toLowerCase() !== filters.format) return false;
	if (filters.provider && filters.provider !== "all" && normalizeText(issue.source || "unknown").toLowerCase() !== filters.provider) return false;
	return true;
}

export async function ensureAdminCatalogSchema(sql: Sql) {
	await sql`
		create table if not exists admin_catalog_audit_event (
			id bigserial primary key,
			admin_user_id uuid references app_user(id) on delete set null,
			entity_type text not null check (entity_type in ('work', 'edition')),
			entity_id bigint not null,
			changed_fields jsonb not null default '[]'::jsonb,
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_admin_catalog_audit_entity on admin_catalog_audit_event(entity_type, entity_id, created_at desc)`;
	await sql`alter table book_edition add column if not exists metadata jsonb not null default '{}'::jsonb`;
	await sql`alter table book_work add column if not exists metadata jsonb not null default '{}'::jsonb`;
	await sql`create index if not exists idx_book_edition_format on book_edition(lower(format))`;
	await sql`create index if not exists idx_book_edition_metadata_gin on book_edition using gin(metadata)`;
}

type HealthRow = {
	work_id: number;
	book_id: number;
	edition_id: number | null;
	title: string;
	author: string;
	cover_url: string;
	format: string;
	book_page_count: number;
	edition_page_count: number;
	publisher: string;
	published_year: number | null;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	open_library_work_id: string;
	open_library_edition_id: string;
	series_id: number | null;
	series_position: string | null;
	metadata: Record<string, unknown>;
	updated_at: string;
	progress_entries: number;
	percent_progress_entries: number;
	audio_progress_entries: number;
};

export async function loadCatalogMetadataHealth(sql: Sql, filters: CatalogHealthFilters = {}) {
	const limit = Math.max(10, Math.min(200, normalizeInt(filters.limit || 100)));
	const offset = normalizeInt(filters.offset || 0);
	const rows = await sql<HealthRow[]>`
		select
			coalesce(bw.id, b.work_id, b.id)::bigint as work_id,
			b.id::bigint as book_id,
			be.id::bigint as edition_id,
			coalesce(nullif(trim(bw.title), ''), b.title) as title,
			coalesce(nullif(trim(bw.primary_author), ''), nullif(trim(b.primary_author), ''), 'Unknown') as author,
			coalesce(nullif(trim(be.cover_url), ''), nullif(trim(bw.preferred_cover_url), ''), nullif(trim(b.cover_url), ''), '') as cover_url,
			coalesce(nullif(trim(be.format), ''), '') as format,
			coalesce(b.page_count, 0)::int as book_page_count,
			coalesce(be.page_count, 0)::int as edition_page_count,
			coalesce(nullif(trim(be.publisher), ''), nullif(trim(b.publisher), ''), '') as publisher,
			coalesce(be.publication_year, b.published_year) as published_year,
			coalesce(nullif(trim(be.isbn10), ''), nullif(trim(b.isbn10), ''), '') as isbn10,
			coalesce(nullif(trim(be.isbn13), ''), nullif(trim(b.isbn13), ''), '') as isbn13,
			coalesce(nullif(trim(be.google_books_id), ''), nullif(trim(b.google_books_id), ''), '') as google_books_id,
			coalesce(nullif(trim(be.open_library_work_id), ''), '') as open_library_work_id,
			coalesce(nullif(trim(be.open_library_edition_id), ''), '') as open_library_edition_id,
			coalesce(sb.series_id, bw.series_id) as series_id,
			coalesce(sb.book_order::text, bw.series_position::text, '') as series_position,
			coalesce(be.metadata, '{}'::jsonb) as metadata,
			greatest(b.updated_at, coalesce(be.updated_at, b.updated_at), coalesce(bw.updated_at, b.updated_at))::text as updated_at,
			coalesce(progress.progress_entries, 0)::int as progress_entries,
			coalesce(progress.percent_progress_entries, 0)::int as percent_progress_entries,
			coalesce(progress.audio_progress_entries, 0)::int as audio_progress_entries
		from book b
		left join book_work bw on bw.id = b.work_id
		left join book_edition be on be.work_id = coalesce(bw.id, b.work_id) and (be.book_id = b.id or be.book_id is null)
		left join series_book sb on sb.book_id = b.id
		left join lateral (
			select
				count(*)::int as progress_entries,
				count(*) filter (where ub.preferred_progress_type = 'percent')::int as percent_progress_entries,
				count(*) filter (where ub.preferred_progress_type = 'audio')::int as audio_progress_entries
			from user_book ub
			where ub.book_id = b.id
		) progress on true
		where b.updated_at > now() - interval '5 years'
		order by greatest(b.updated_at, coalesce(be.updated_at, b.updated_at), coalesce(bw.updated_at, b.updated_at)) desc
		limit 600
	`;
	const issues: CatalogHealthIssue[] = [];
	const seen = new Set<string>();
	const pushIssue = (row: HealthRow, issueType: string, severity: CatalogHealthSeverity, issue: string) => {
		const normalizedType = normalizeHealthIssueType(issueType);
		const key = `${normalizedType}:${row.work_id}:${row.book_id}:${row.edition_id || 0}`;
		if (seen.has(key)) return;
		const source = extractProvider(readMetadataObject(row.metadata), row.google_books_id ? "Google Books" : row.open_library_edition_id ? "Open Library" : "Existing DogEared data");
		const entry: CatalogHealthIssue = {
			issueType: normalizedType,
			severity,
			workId: Number(row.work_id || 0),
			bookId: Number(row.book_id || 0),
			editionId: Number(row.edition_id || 0),
			title: normalizeText(row.title, 240) || "Untitled",
			author: normalizeText(row.author, 160) || "Unknown",
			coverUrl: normalizeText(row.cover_url, 1000),
			format: normalizeText(row.format, 80) || "unknown",
			source,
			issue,
			updatedAt: row.updated_at
		};
		if (!issueMatchesFilters(entry, filters)) return;
		seen.add(key);
		issues.push(entry);
	};
	for (const row of rows) {
		const metadata = readMetadataObject(row.metadata);
		const durationSeconds = metadataInt(metadata, "durationSeconds") || metadataInt(metadata, "duration_seconds");
		const locationCount = metadataInt(metadata, "locationCount") || metadataInt(metadata, "location_count");
		const chapterCount = metadataInt(metadata, "chapterCount") || metadataInt(metadata, "chapter_count");
		const isAudio = isAudiobookFormat(row.format);
		const isLocationBased = isDigitalLocationFormat(row.format);
		const usefulPageCount = Math.max(Number(row.edition_page_count || 0), Number(row.book_page_count || 0));
		if (!normalizeText(row.format)) pushIssue(row, "missing_reading_format_metadata", "needs_attention", "Missing Edition format metadata");
		if (isAudio) {
			if (durationSeconds <= 0) pushIssue(row, "missing_audiobook_duration", row.audio_progress_entries > 0 ? "critical" : "needs_attention", "Missing audiobook duration");
		} else if (usefulPageCount <= 0) {
			pushIssue(row, "missing_page_count", row.percent_progress_entries > 0 ? "critical" : "needs_attention", "Missing page count");
		}
		if (isLocationBased && locationCount <= 0) pushIssue(row, "missing_location_count", "optional", "Missing location count");
		if (chapterCount <= 0 && /chapter/i.test(String(row.format || ""))) pushIssue(row, "missing_chapter_count", "optional", "Missing chapter count");
		if (!normalizeText(row.cover_url)) pushIssue(row, "missing_cover", "optional", "Missing cover");
		if (!normalizeText(row.author) || row.author === "Unknown") pushIssue(row, "missing_author", "needs_attention", "Missing author");
		if (!Number(row.published_year || 0)) pushIssue(row, "missing_publication_year", "needs_attention", "Missing publication year");
		if (!normalizeText(row.publisher)) pushIssue(row, "missing_publisher", "needs_attention", "Missing publisher");
		if (!normalizeText(row.isbn10) && !normalizeText(row.isbn13) && !normalizeText(row.google_books_id) && !normalizeText(row.open_library_work_id) && !normalizeText(row.open_library_edition_id)) {
			pushIssue(row, "missing_identifiers", "needs_attention", "Missing ISBN or external identifiers");
		}
		if (row.series_id && !normalizeText(row.series_position)) pushIssue(row, "missing_series_position", "needs_attention", "Missing Series position");
		if (/\(.*#?\d+.*\)$|\bbook\s+\d+\b/i.test(row.title) && !row.series_id) pushIssue(row, "missing_series_relationship", "needs_attention", "Possible missing Series relationship");
		if (/\b(audiobook|hardcover|paperback|kindle edition|ebook)\b/i.test(row.title)) pushIssue(row, "malformed_title", "needs_attention", "Potentially malformed Work title");
		if (row.progress_entries > 0 && usefulPageCount <= 0 && !isAudio) pushIssue(row, "progress_not_normalizable", "critical", "Progress entries cannot be normalized without page count");
		if (row.audio_progress_entries > 0 && isAudio && durationSeconds <= 0) pushIssue(row, "progress_not_normalizable", "critical", "Audiobook progress cannot be normalized without duration");
	}
	const duplicateRows = await sql<Array<{ work_id: number; book_id: number; title: string; author: string; updated_at: string }>>`
		with groups as (
			select lower(trim(coalesce(bw.canonical_title, bw.title, b.title))) as title_key,
				lower(trim(coalesce(bw.primary_author, b.primary_author, ''))) as author_key,
				count(distinct coalesce(bw.id, b.work_id, b.id))::int as work_count
			from book b
			left join book_work bw on bw.id = b.work_id
			group by 1, 2
			having count(distinct coalesce(bw.id, b.work_id, b.id)) > 1
		)
		select coalesce(bw.id, b.work_id, b.id)::bigint as work_id,
			b.id::bigint as book_id,
			b.title,
			coalesce(nullif(trim(b.primary_author), ''), 'Unknown') as author,
			b.updated_at::text as updated_at
		from book b
		left join book_work bw on bw.id = b.work_id
		join groups g on g.title_key = lower(trim(coalesce(bw.canonical_title, bw.title, b.title)))
			and g.author_key = lower(trim(coalesce(bw.primary_author, b.primary_author, '')))
		order by b.updated_at desc
		limit 25
	`;
	for (const row of duplicateRows) {
		pushIssue({
			work_id: row.work_id,
			book_id: row.book_id,
			edition_id: null,
			title: row.title,
			author: row.author,
			cover_url: "",
			format: "",
			book_page_count: 0,
			edition_page_count: 0,
			publisher: "",
			published_year: null,
			isbn10: "",
			isbn13: "",
			google_books_id: "",
			open_library_work_id: "",
			open_library_edition_id: "",
			series_id: null,
			series_position: "",
			metadata: {},
			updated_at: row.updated_at,
			progress_entries: 0,
			percent_progress_entries: 0,
			audio_progress_entries: 0
		}, "potential_duplicate_work", "critical", "Potential duplicate Work");
	}
	const duplicateEditionRows = await sql<Array<{
		work_id: number;
		book_id: number;
		edition_id: number;
		title: string;
		author: string;
		format: string;
		updated_at: string;
	}>>`
		with duplicate_keys as (
			select lower(trim(coalesce(edition_key, ''))) as edition_key
			from book_edition
			where trim(coalesce(edition_key, '')) <> ''
			group by lower(trim(coalesce(edition_key, '')))
			having count(distinct work_id) > 1
		)
		select
			be.work_id::bigint as work_id,
			coalesce(be.book_id, b.id, 0)::bigint as book_id,
			be.id::bigint as edition_id,
			coalesce(nullif(trim(bw.title), ''), nullif(trim(b.title), ''), 'Untitled') as title,
			coalesce(nullif(trim(bw.primary_author), ''), nullif(trim(b.primary_author), ''), 'Unknown') as author,
			coalesce(nullif(trim(be.format), ''), '') as format,
			be.updated_at::text as updated_at
		from book_edition be
		join duplicate_keys dk on dk.edition_key = lower(trim(coalesce(be.edition_key, '')))
		left join book_work bw on bw.id = be.work_id
		left join book b on b.id = be.book_id
		order by be.updated_at desc
		limit 25
	`;
	for (const row of duplicateEditionRows) {
		pushIssue({
			work_id: row.work_id,
			book_id: row.book_id,
			edition_id: row.edition_id,
			title: row.title,
			author: row.author,
			cover_url: "",
			format: row.format,
			book_page_count: 0,
			edition_page_count: 0,
			publisher: "",
			published_year: null,
			isbn10: "",
			isbn13: "",
			google_books_id: "",
			open_library_work_id: "",
			open_library_edition_id: "",
			series_id: null,
			series_position: "",
			metadata: {},
			updated_at: row.updated_at,
			progress_entries: 0,
			percent_progress_entries: 0,
			audio_progress_entries: 0
		}, "potential_duplicate_edition", "critical", "Potential duplicate Edition");
	}
	const limitedIssues = issues.slice(offset, offset + limit);
	const summary: CatalogHealthSummary = {
		totalIssues: issues.length,
		critical: issues.filter((issue) => issue.severity === "critical").length,
		needsAttention: issues.filter((issue) => issue.severity === "needs_attention").length,
		optional: issues.filter((issue) => issue.severity === "optional").length,
		missingPageCounts: issues.filter((issue) => issue.issueType === "missing_page_count").length,
		missingAudiobookDurations: issues.filter((issue) => issue.issueType === "missing_audiobook_duration").length,
		potentialDuplicates: issues.filter((issue) => issue.issueType.includes("duplicate")).length,
		progressBlocking: issues.filter((issue) => issue.issueType === "progress_not_normalizable" || issue.severity === "critical").length
	};
	const facets: CatalogHealthFacets = {
		formats: Array.from(new Set(issues.map((issue) => normalizeText(issue.format || "unknown", 80).toLowerCase()).filter(Boolean))).sort(),
		providers: Array.from(new Set(issues.map((issue) => normalizeText(issue.source || "Existing DogEared data", 80).toLowerCase()).filter(Boolean))).sort()
	};
	return { issues: limitedIssues, summary, pagination: { limit, offset, total: issues.length }, facets };
}

export async function countCatalogHealthIssuesForWork(sql: Sql, workId: unknown) {
	const id = normalizeInt(workId);
	if (!id) return 0;
	const result = await loadCatalogMetadataHealth(sql, { q: String(id), limit: 200 });
	return result.issues.filter((issue) => issue.workId === id).length;
}

export async function loadCatalogEditorData(sql: Sql, workId: unknown): Promise<CatalogEditorData | null> {
	const id = normalizeInt(workId);
	if (!id) return null;
	await ensureAdminCatalogSchema(sql);
	const workRows = await sql<Array<{
		id: number;
		book_id: number;
		title: string;
		canonical_title: string;
		primary_author: string;
		description: string;
		subjects: string[];
		genres: string[];
		series_id: number | null;
		series_name: string | null;
		series_position: string | null;
		original_publication_year: number | null;
		preferred_cover_url: string;
		metadata: Record<string, unknown>;
		updated_at: string;
	}>>`
		select
			bw.id,
			coalesce(rep.book_id, 0)::bigint as book_id,
			bw.title,
			coalesce(bw.canonical_title, '') as canonical_title,
			coalesce(bw.primary_author, '') as primary_author,
			coalesce(bw.description, '') as description,
			coalesce(bw.subjects, '{}') as subjects,
			coalesce(bw.genres, '{}') as genres,
			bw.series_id,
			coalesce(s.name, '') as series_name,
			bw.series_position::text as series_position,
			bw.original_publication_year,
			coalesce(bw.preferred_cover_url, '') as preferred_cover_url,
			coalesce(bw.metadata, '{}'::jsonb) as metadata,
			bw.updated_at::text as updated_at
		from book_work bw
		left join lateral (
			select b.id::bigint as book_id
			from book b
			where b.work_id = bw.id
			order by b.updated_at desc, b.id asc
			limit 1
		) rep on true
		left join series s on s.id = bw.series_id
		where bw.id = ${id}
		limit 1
	`;
	const work = workRows[0];
	if (!work?.id) return null;
	const [editionRows, seriesRows, impactRows, auditRows] = await Promise.all([
		sql<Array<{
			id: number;
			book_id: number | null;
			edition_key: string;
			title: string;
			format: string;
			isbn10: string;
			isbn13: string;
			publisher: string;
			publication_date: string;
			publication_year: number | null;
			page_count: number;
			cover_url: string;
			google_books_id: string;
			open_library_work_id: string;
			open_library_edition_id: string;
			language: string;
			metadata: Record<string, unknown>;
			updated_at: string;
		}>>`
			select
				id,
				book_id,
				edition_key,
				coalesce((metadata->>'title'), '') as title,
				coalesce(format, '') as format,
				coalesce(isbn10, '') as isbn10,
				coalesce(isbn13, '') as isbn13,
				coalesce(publisher, '') as publisher,
				coalesce(publication_date, '') as publication_date,
				publication_year,
				coalesce(page_count, 0)::int as page_count,
				coalesce(cover_url, '') as cover_url,
				coalesce(google_books_id, '') as google_books_id,
				coalesce(open_library_work_id, '') as open_library_work_id,
				coalesce(open_library_edition_id, '') as open_library_edition_id,
				coalesce(language, '') as language,
				coalesce(metadata, '{}'::jsonb) as metadata,
				updated_at::text as updated_at
			from book_edition
			where work_id = ${id}
			order by coalesce(book_id, 0) desc, id asc
		`,
		sql<Array<{ id: number; name: string }>>`select id, name from series order by lower(name) asc limit 500`,
		sql<Array<{ readers: number; shelf_entries: number; progress_events: number; journal_entries: number; edition_count: number }>>`
			select
				(select count(distinct ub.user_id)::int from user_book ub join book b on b.id = ub.book_id where b.work_id = ${id}) as readers,
				(select count(*)::int from user_book ub join book b on b.id = ub.book_id where b.work_id = ${id}) as shelf_entries,
				(select count(*)::int from user_reading_progress_event pe join book b on b.id = pe.book_id where b.work_id = ${id}) as progress_events,
				(select count(*)::int from reading_journal_entry rj join book b on b.id = rj.book_id where b.work_id = ${id}) as journal_entries,
				(select count(*)::int from book_edition where work_id = ${id}) as edition_count
		`,
		sql<Array<{ id: number; entity_type: string; entity_id: number; username: string | null; changed_fields: Array<{ field: string; oldValue: unknown; newValue: unknown }>; created_at: string }>>`
			select
				ace.id,
				ace.entity_type,
				ace.entity_id,
				u.username,
				ace.changed_fields,
				ace.created_at::text as created_at
			from admin_catalog_audit_event ace
			left join app_user u on u.id = ace.admin_user_id
			where (ace.entity_type = 'work' and ace.entity_id = ${id})
				or (ace.entity_type = 'edition' and ace.entity_id in (select id from book_edition where work_id = ${id}))
			order by ace.created_at desc
			limit 25
		`
	]);
	return {
		work: {
			id: Number(work.id || 0),
			bookId: Number(work.book_id || 0),
			title: work.title || "",
			canonicalTitle: work.canonical_title || "",
			primaryAuthor: work.primary_author || "",
			description: work.description || "",
			subjects: Array.isArray(work.subjects) ? work.subjects : [],
			genres: Array.isArray(work.genres) ? work.genres : [],
			seriesId: Number(work.series_id || 0),
			seriesName: work.series_name || "",
			seriesPosition: work.series_position || "",
			originalPublicationYear: Number(work.original_publication_year || 0),
			preferredCoverUrl: work.preferred_cover_url || "",
			metadata: readMetadataObject(work.metadata),
			updatedAt: work.updated_at || ""
		},
		editions: editionRows.map((edition) => {
			const metadata = readMetadataObject(edition.metadata);
			return {
				id: Number(edition.id || 0),
				bookId: Number(edition.book_id || 0),
				editionKey: edition.edition_key || "",
				title: edition.title || "",
				format: edition.format || "",
				isbn10: edition.isbn10 || "",
				isbn13: edition.isbn13 || "",
				publisher: edition.publisher || "",
				publicationDate: edition.publication_date || "",
				publicationYear: Number(edition.publication_year || 0),
				pageCount: Number(edition.page_count || 0),
				coverUrl: edition.cover_url || "",
				googleBooksId: edition.google_books_id || "",
				openLibraryWorkId: edition.open_library_work_id || "",
				openLibraryEditionId: edition.open_library_edition_id || "",
				language: edition.language || "",
				durationSeconds: metadataInt(metadata, "durationSeconds") || metadataInt(metadata, "duration_seconds"),
				locationCount: metadataInt(metadata, "locationCount") || metadataInt(metadata, "location_count"),
				chapterCount: metadataInt(metadata, "chapterCount") || metadataInt(metadata, "chapter_count"),
				metadata,
				updatedAt: edition.updated_at || ""
			};
		}),
		seriesOptions: seriesRows.map((row) => ({ id: Number(row.id || 0), name: row.name || "" })),
		impact: {
			readers: Number(impactRows[0]?.readers || 0),
			shelfEntries: Number(impactRows[0]?.shelf_entries || 0),
			progressEvents: Number(impactRows[0]?.progress_events || 0),
			journalEntries: Number(impactRows[0]?.journal_entries || 0),
			editionCount: Number(impactRows[0]?.edition_count || 0)
		},
		auditEvents: auditRows.map((row) => ({
			id: Number(row.id || 0),
			entityType: row.entity_type || "",
			entityId: Number(row.entity_id || 0),
			adminUsername: row.username || "admin",
			changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
			createdAt: row.created_at || ""
		}))
	};
}

function addChange(changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>, field: string, oldValue: unknown, newValue: unknown) {
	if (JSON.stringify(oldValue ?? "") === JSON.stringify(newValue ?? "")) return;
	changes.push({ field, oldValue: oldValue ?? "", newValue: newValue ?? "" });
}

function manualMetadata(metadata: Record<string, unknown>, changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>) {
	const fields = changes.map((change) => change.field);
	return {
		...metadata,
		manualOverrides: Array.from(new Set([...(Array.isArray(metadata.manualOverrides) ? metadata.manualOverrides.map(String) : []), ...fields])),
		provenance: {
			...readMetadataObject(metadata.provenance),
			source: "Manual",
			updatedAt: new Date().toISOString()
		}
	};
}

export async function saveCatalogEditorData(sql: Sql, adminUserId: string, formData: FormData) {
	await ensureAdminCatalogSchema(sql);
	const workId = normalizeInt(formData.get("workId"));
	const editionId = normalizeInt(formData.get("editionId"));
	if (!workId) return { ok: false, message: "Missing Work ID." };
	const current = await loadCatalogEditorData(sql, workId);
	if (!current) return { ok: false, message: "Work not found." };

	const workChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
	const nextWork = {
		title: normalizeText(formData.get("workTitle"), 500),
		canonicalTitle: normalizeText(formData.get("canonicalTitle"), 500),
		primaryAuthor: normalizeText(formData.get("primaryAuthor"), 300),
		description: normalizeText(formData.get("description"), 12000),
		subjects: splitList(formData.get("subjects")),
		genres: splitList(formData.get("genres")),
		seriesId: normalizeInt(formData.get("seriesId")),
		seriesPosition: normalizeDecimalText(formData.get("seriesPosition")),
		originalPublicationYear: normalizePositiveYear(formData.get("originalPublicationYear")),
		preferredCoverUrl: normalizeText(formData.get("preferredCoverUrl"), 1000)
	};
	if (!nextWork.title) return { ok: false, message: "Work title is required." };
	addChange(workChanges, "title", current.work.title, nextWork.title);
	addChange(workChanges, "canonicalTitle", current.work.canonicalTitle, nextWork.canonicalTitle);
	addChange(workChanges, "primaryAuthor", current.work.primaryAuthor, nextWork.primaryAuthor);
	addChange(workChanges, "description", current.work.description, nextWork.description);
	addChange(workChanges, "subjects", current.work.subjects, nextWork.subjects);
	addChange(workChanges, "genres", current.work.genres, nextWork.genres);
	addChange(workChanges, "seriesId", current.work.seriesId, nextWork.seriesId);
	addChange(workChanges, "seriesPosition", current.work.seriesPosition, nextWork.seriesPosition);
	addChange(workChanges, "originalPublicationYear", current.work.originalPublicationYear, nextWork.originalPublicationYear);
	addChange(workChanges, "preferredCoverUrl", current.work.preferredCoverUrl, nextWork.preferredCoverUrl);

	const edition = current.editions.find((item) => item.id === editionId) || null;
	const editionChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
	let nextEdition: Record<string, unknown> | null = null;
	if (edition) {
		const durationSeconds = parseDurationToSeconds(formData.get("duration"));
		if (hasMalformedIsbn(formData.get("isbn10"), 10)) return { ok: false, message: "ISBN-10 must contain 10 ISBN characters." };
		if (hasMalformedIsbn(formData.get("isbn13"), 13)) return { ok: false, message: "ISBN-13 must contain 13 digits." };
		if (!isValidPublicationDate(formData.get("publicationDate"))) return { ok: false, message: "Publication date must be a valid date, year, or year-month." };
		nextEdition = {
			format: normalizeText(formData.get("editionFormat"), 100).toLowerCase(),
			isbn10: normalizeIsbn(formData.get("isbn10"), 10),
			isbn13: normalizeIsbn(formData.get("isbn13"), 13),
			publisher: normalizeText(formData.get("publisher"), 300),
			publicationDate: normalizeText(formData.get("publicationDate"), 80),
			publicationYear: normalizePositiveYear(formData.get("publicationYear")),
			pageCount: normalizeInt(formData.get("pageCount")),
			coverUrl: normalizeText(formData.get("coverUrl"), 1000),
			googleBooksId: normalizeText(formData.get("googleBooksId"), 200),
			openLibraryWorkId: normalizeText(formData.get("openLibraryWorkId"), 200),
			openLibraryEditionId: normalizeText(formData.get("openLibraryEditionId"), 200),
			language: normalizeText(formData.get("language"), 80),
			durationSeconds,
			locationCount: normalizeInt(formData.get("locationCount")),
			chapterCount: normalizeInt(formData.get("chapterCount")),
			title: normalizeText(formData.get("editionTitle"), 500)
		};
		if (isAudiobookFormat(nextEdition.format) && !durationSeconds) return { ok: false, message: "Audiobook duration must be a positive duration." };
		addChange(editionChanges, "format", edition.format, nextEdition.format);
		addChange(editionChanges, "isbn10", edition.isbn10, nextEdition.isbn10);
		addChange(editionChanges, "isbn13", edition.isbn13, nextEdition.isbn13);
		addChange(editionChanges, "publisher", edition.publisher, nextEdition.publisher);
		addChange(editionChanges, "publicationDate", edition.publicationDate, nextEdition.publicationDate);
		addChange(editionChanges, "publicationYear", edition.publicationYear, nextEdition.publicationYear);
		addChange(editionChanges, "pageCount", edition.pageCount, nextEdition.pageCount);
		addChange(editionChanges, "coverUrl", edition.coverUrl, nextEdition.coverUrl);
		addChange(editionChanges, "googleBooksId", edition.googleBooksId, nextEdition.googleBooksId);
		addChange(editionChanges, "openLibraryWorkId", edition.openLibraryWorkId, nextEdition.openLibraryWorkId);
		addChange(editionChanges, "openLibraryEditionId", edition.openLibraryEditionId, nextEdition.openLibraryEditionId);
		addChange(editionChanges, "language", edition.language, nextEdition.language);
		addChange(editionChanges, "durationSeconds", edition.durationSeconds, nextEdition.durationSeconds);
		addChange(editionChanges, "locationCount", edition.locationCount, nextEdition.locationCount);
		addChange(editionChanges, "chapterCount", edition.chapterCount, nextEdition.chapterCount);
		addChange(editionChanges, "title", edition.title, nextEdition.title);
	}

	if (workChanges.length === 0 && editionChanges.length === 0) return { ok: true, message: "No catalog changes to save." };
	const nextWorkMetadata = workChanges.length > 0 ? manualMetadata(current.work.metadata, workChanges) : current.work.metadata;
	const nextEditionMetadata = edition && nextEdition && editionChanges.length > 0
		? manualMetadata({
			...edition.metadata,
			title: nextEdition.title,
			durationSeconds: nextEdition.durationSeconds,
			locationCount: nextEdition.locationCount,
			chapterCount: nextEdition.chapterCount
		}, editionChanges)
		: null;
	await sql.transaction((tx) => {
		const steps = [];
		if (workChanges.length > 0) {
			steps.push(tx`
				update book_work
				set
					title = ${nextWork.title},
					canonical_title = ${nextWork.canonicalTitle},
					primary_author = ${nextWork.primaryAuthor},
					description = ${nextWork.description},
					subjects = ${nextWork.subjects},
					genres = ${nextWork.genres},
					series_id = ${nextWork.seriesId > 0 ? nextWork.seriesId : null},
					series_position = ${nextWork.seriesPosition || null}::numeric,
					original_publication_year = ${nextWork.originalPublicationYear || null},
					preferred_cover_url = ${nextWork.preferredCoverUrl},
					metadata = ${JSON.stringify(nextWorkMetadata)}::jsonb,
					updated_at = now()
				where id = ${workId}
			`);
			steps.push(tx`
				insert into admin_catalog_audit_event (admin_user_id, entity_type, entity_id, changed_fields)
				values (${adminUserId}::uuid, 'work', ${workId}, ${JSON.stringify(workChanges)}::jsonb)
			`);
		}
		if (edition && nextEdition && nextEditionMetadata && editionChanges.length > 0) {
			steps.push(tx`
				update book_edition
				set
					format = ${nextEdition.format},
					isbn10 = ${nextEdition.isbn10},
					isbn13 = ${nextEdition.isbn13},
					publisher = ${nextEdition.publisher},
					publication_date = ${nextEdition.publicationDate},
					publication_year = ${nextEdition.publicationYear || null},
					page_count = ${nextEdition.pageCount},
					cover_url = ${nextEdition.coverUrl},
					google_books_id = ${nextEdition.googleBooksId},
					open_library_work_id = ${nextEdition.openLibraryWorkId},
					open_library_edition_id = ${nextEdition.openLibraryEditionId},
					language = ${nextEdition.language},
					metadata = ${JSON.stringify(nextEditionMetadata)}::jsonb,
					updated_at = now()
				where id = ${edition.id}
			`);
			steps.push(tx`
				insert into admin_catalog_audit_event (admin_user_id, entity_type, entity_id, changed_fields)
				values (${adminUserId}::uuid, 'edition', ${edition.id}, ${JSON.stringify(editionChanges)}::jsonb)
			`);
			if (edition.bookId > 0) {
				steps.push(tx`
					update book
					set
						isbn10 = case when ${nextEdition.isbn10}::text <> '' then ${nextEdition.isbn10} else isbn10 end,
						isbn13 = case when ${nextEdition.isbn13}::text <> '' then ${nextEdition.isbn13} else isbn13 end,
						publisher = case when ${nextEdition.publisher}::text <> '' then ${nextEdition.publisher} else publisher end,
						page_count = greatest(coalesce(page_count, 0), ${nextEdition.pageCount}::int),
						cover_url = case when ${nextEdition.coverUrl}::text <> '' then ${nextEdition.coverUrl} else cover_url end,
						google_books_id = case when ${nextEdition.googleBooksId}::text <> '' then ${nextEdition.googleBooksId} else google_books_id end,
						language = case when ${nextEdition.language}::text <> '' then ${nextEdition.language} else language end,
						published_year = coalesce(published_year, ${nextEdition.publicationYear || null}),
						updated_at = now()
					where id = ${edition.bookId}
				`);
			}
		}
		return steps;
	});
	return { ok: true, message: `Saved ${workChanges.length + editionChanges.length} catalog field change${workChanges.length + editionChanges.length === 1 ? "" : "s"}.` };
}
