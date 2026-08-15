import type { getNeonSql } from "./neon";

type Sql = ReturnType<typeof getNeonSql>;

export type CatalogHealthSeverity = "critical" | "needs_attention" | "optional";

export type CatalogHealthIssue = {
	issueType: string;
	severity: CatalogHealthSeverity;
	scope: "work" | "edition";
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
	searchText: string;
};

export type CatalogHealthRecord = {
	recordKey: string;
	severity: CatalogHealthSeverity;
	workId: number;
	bookId: number;
	editionId: number;
	title: string;
	author: string;
	coverUrl: string;
	format: string;
	source: string;
	updatedAt: string;
	issues: CatalogHealthIssue[];
};

export type CatalogHealthResult = {
	issues: CatalogHealthIssue[];
	records: CatalogHealthRecord[];
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
	totalRecords: number;
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
		preferredEditionId: number;
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
		referenceCount: number;
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

const KNOWN_FORMAT_OPTIONS = [
	{ value: "physical", label: "Physical book" },
	{ value: "ebook", label: "Ebook" },
	{ value: "audiobook", label: "Audiobook" }
];

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

function slugifySeriesName(value: unknown) {
	return normalizeText(value, 160)
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
}

function normalizeEditionFormat(value: unknown) {
	const raw = normalizeText(value, 100).toLowerCase();
	if (raw === "physical" || raw === "physical book" || raw === "paperback" || raw === "hardcover" || raw === "library binding") return "physical";
	if (raw === "ebook" || raw === "e-book" || raw === "kindle" || raw === "digital") return "ebook";
	if (raw === "audiobook" || raw === "audio" || raw === "audible" || raw === "listening") return "audiobook";
	return "";
}

function validateCoverValue(value: unknown) {
	const cover = normalizeText(value, 1_000_000);
	if (!cover) return { ok: true, cover };
	if (/^data:image\/(jpeg|png|webp);base64,/i.test(cover)) {
		if (cover.length > 1_000_000) return { ok: false, cover: "", message: "Cover uploads must be under 750KB." };
		return { ok: true, cover };
	}
	if (/^https?:\/\//i.test(cover)) return { ok: true, cover: normalizeText(value, 2000) };
	return { ok: false, cover: "", message: "Cover must be a JPEG, PNG, WebP upload, or a valid image URL." };
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
	if (q && !`${issue.title} ${issue.author} ${issue.workId} ${issue.bookId} ${issue.editionId} ${issue.searchText}`.toLowerCase().includes(q)) return false;
	if (filters.issueType && filters.issueType !== "all" && issue.issueType !== filters.issueType) return false;
	if (filters.severity && filters.severity !== "all" && issue.severity !== filters.severity) return false;
	if (filters.format && filters.format !== "all" && normalizeText(issue.format || "unknown").toLowerCase() !== filters.format) return false;
	if (filters.provider && filters.provider !== "all" && normalizeText(issue.source || "unknown").toLowerCase() !== filters.provider) return false;
	return true;
}

function severityRank(severity: CatalogHealthSeverity) {
	if (severity === "critical") return 3;
	if (severity === "needs_attention") return 2;
	return 1;
}

function compareSeverity(a: CatalogHealthSeverity, b: CatalogHealthSeverity) {
	return severityRank(a) - severityRank(b);
}

function catalogRecordKey(issue: CatalogHealthIssue) {
	return issue.editionId > 0 ? `work:${issue.workId}:edition:${issue.editionId}` : `work:${issue.workId}`;
}

function catalogIssueDedupeKey(issueType: string, row: HealthRow, scope: CatalogHealthIssue["scope"]) {
	if (scope === "work") return `${issueType}:work:${row.work_id}`;
	return `${issueType}:work:${row.work_id}:book:${row.book_id}:edition:${row.edition_id || 0}`;
}

function aggregateCatalogHealthRecords(issues: CatalogHealthIssue[]) {
	const records = new Map<string, CatalogHealthRecord>();
	for (const issue of issues) {
		const key = catalogRecordKey(issue);
		const existing = records.get(key);
		if (!existing) {
			records.set(key, {
				recordKey: key,
				severity: issue.severity,
				workId: issue.workId,
				bookId: issue.bookId,
				editionId: issue.editionId,
				title: issue.title,
				author: issue.author,
				coverUrl: issue.coverUrl,
				format: issue.format,
				source: issue.source,
				updatedAt: issue.updatedAt,
				issues: [issue]
			});
			continue;
		}
		existing.issues.push(issue);
		if (compareSeverity(issue.severity, existing.severity) > 0) existing.severity = issue.severity;
		if (!existing.coverUrl && issue.coverUrl) existing.coverUrl = issue.coverUrl;
		if ((!existing.format || existing.format === "unknown") && issue.format) existing.format = issue.format;
		if ((!existing.source || existing.source === "Existing DogEared data") && issue.source) existing.source = issue.source;
		if (new Date(issue.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) existing.updatedAt = issue.updatedAt;
	}
	return Array.from(records.values()).sort((a, b) => {
		const severity = compareSeverity(b.severity, a.severity);
		if (severity !== 0) return severity;
		return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
	});
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
	description: string;
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
			coalesce(nullif(trim(bw.description), ''), nullif(trim(b.synopsis), ''), '') as description,
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
		order by greatest(b.updated_at, coalesce(be.updated_at, b.updated_at), coalesce(bw.updated_at, b.updated_at)) desc,
			coalesce(be.id, 0) asc
		limit 600
	`;
	const issues: CatalogHealthIssue[] = [];
	const seen = new Set<string>();
	const pushIssue = (row: HealthRow, issueType: string, severity: CatalogHealthSeverity, issue: string, scope: CatalogHealthIssue["scope"] = "edition") => {
		const normalizedType = normalizeHealthIssueType(issueType);
		const key = catalogIssueDedupeKey(normalizedType, row, scope);
		if (seen.has(key)) return;
		const source = extractProvider(readMetadataObject(row.metadata), row.google_books_id ? "Google Books" : row.open_library_edition_id ? "Open Library" : "Existing DogEared data");
		const entry: CatalogHealthIssue = {
			issueType: normalizedType,
			severity,
			scope,
			workId: Number(row.work_id || 0),
			bookId: Number(row.book_id || 0),
			editionId: Number(row.edition_id || 0),
			title: normalizeText(row.title, 240) || "Untitled",
			author: normalizeText(row.author, 160) || "Unknown",
			coverUrl: normalizeText(row.cover_url, 1000),
			format: normalizeText(row.format, 80) || "unknown",
			source,
			issue,
			updatedAt: row.updated_at,
			searchText: [
				row.isbn10,
				row.isbn13,
				row.google_books_id,
				row.open_library_work_id,
				row.open_library_edition_id
			].filter(Boolean).join(" ")
		};
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
		if (!normalizeText(row.format)) pushIssue(row, "missing_reading_format_metadata", "needs_attention", "Format missing");
		if (isAudio) {
			if (durationSeconds <= 0) pushIssue(row, "missing_audiobook_duration", row.audio_progress_entries > 0 ? "critical" : "needs_attention", "Duration needed");
		} else if (usefulPageCount <= 0) {
			pushIssue(row, "missing_page_count", row.percent_progress_entries > 0 ? "critical" : "needs_attention", "Page count needed");
		}
		if (isLocationBased && locationCount <= 0) pushIssue(row, "missing_location_count", "optional", "Missing location count");
		if (chapterCount <= 0 && /chapter/i.test(String(row.format || ""))) pushIssue(row, "missing_chapter_count", "optional", "Missing chapter count");
		if (!normalizeText(row.cover_url)) pushIssue(row, "missing_cover", "optional", "Missing cover");
		if (!normalizeText(row.author) || row.author === "Unknown") pushIssue(row, "missing_author", "needs_attention", "Missing author", "work");
		if (!normalizeText(row.description)) pushIssue(row, "missing_description", "optional", "Missing description", "work");
		if (!Number(row.published_year || 0)) pushIssue(row, "missing_publication_year", "needs_attention", "Missing publication year");
		if (!normalizeText(row.publisher)) pushIssue(row, "missing_publisher", "needs_attention", "Missing publisher");
		if (!normalizeText(row.isbn10) && !normalizeText(row.isbn13) && !normalizeText(row.google_books_id) && !normalizeText(row.open_library_work_id) && !normalizeText(row.open_library_edition_id)) {
			pushIssue(row, "missing_identifiers", "needs_attention", "Missing ISBN or external identifiers");
		}
		if (row.series_id && !normalizeText(row.series_position)) pushIssue(row, "missing_series_position", "needs_attention", "Series position needed", "work");
		if (/\(.*#?\d+.*\)$|\bbook\s+\d+\b/i.test(row.title) && !row.series_id) pushIssue(row, "missing_series_relationship", "needs_attention", "Series needs review", "work");
		if (/\b(audiobook|hardcover|paperback|kindle edition|ebook)\b/i.test(row.title)) pushIssue(row, "malformed_title", "needs_attention", "Potentially malformed Work title", "work");
		if (row.progress_entries > 0 && usefulPageCount <= 0 && !isAudio) pushIssue(row, "progress_not_normalizable", "critical", "Page count needed");
		if (row.audio_progress_entries > 0 && isAudio && durationSeconds <= 0) pushIssue(row, "progress_not_normalizable", "critical", "Duration needed");
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
			description: "",
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
		}, "potential_duplicate_work", "critical", "Potential duplicate Work", "work");
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
			description: "",
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
	const matchingRecordKeys = new Set(issues.filter((issue) => issueMatchesFilters(issue, filters)).map(catalogRecordKey));
	const filteredIssues = issues.filter((issue) => matchingRecordKeys.has(catalogRecordKey(issue)));
	const records = aggregateCatalogHealthRecords(filteredIssues);
	const limitedRecords = records.slice(offset, offset + limit);
	const limitedIssueKeys = new Set(limitedRecords.map((record) => record.recordKey));
	const limitedIssues = filteredIssues.filter((issue) => limitedIssueKeys.has(catalogRecordKey(issue)));
	const summary: CatalogHealthSummary = {
		totalIssues: filteredIssues.length,
		totalRecords: records.length,
		critical: records.filter((record) => record.severity === "critical").length,
		needsAttention: records.filter((record) => record.severity === "needs_attention").length,
		optional: records.filter((record) => record.severity === "optional").length,
		missingPageCounts: filteredIssues.filter((issue) => issue.issueType === "missing_page_count").length,
		missingAudiobookDurations: filteredIssues.filter((issue) => issue.issueType === "missing_audiobook_duration").length,
		potentialDuplicates: filteredIssues.filter((issue) => issue.issueType.includes("duplicate")).length,
		progressBlocking: filteredIssues.filter((issue) => issue.issueType === "progress_not_normalizable" || issue.severity === "critical").length
	};
	const facets: CatalogHealthFacets = {
		formats: Array.from(new Set(filteredIssues.map((issue) => normalizeText(issue.format || "unknown", 80).toLowerCase()).filter(Boolean))).sort(),
		providers: Array.from(new Set(filteredIssues.map((issue) => normalizeText(issue.source || "Existing DogEared data", 80).toLowerCase()).filter(Boolean))).sort()
	};
	return { issues: limitedIssues, records: limitedRecords, summary, pagination: { limit, offset, total: records.length }, facets };
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
			reference_count: number;
			metadata: Record<string, unknown>;
			updated_at: string;
		}>>`
			select
				be.id,
				be.book_id,
				be.edition_key,
				coalesce((be.metadata->>'title'), '') as title,
				coalesce(be.format, '') as format,
				coalesce(be.isbn10, '') as isbn10,
				coalesce(be.isbn13, '') as isbn13,
				coalesce(be.publisher, '') as publisher,
				coalesce(be.publication_date, '') as publication_date,
				be.publication_year,
				coalesce(be.page_count, 0)::int as page_count,
				coalesce(be.cover_url, '') as cover_url,
				coalesce(be.google_books_id, '') as google_books_id,
				coalesce(be.open_library_work_id, '') as open_library_work_id,
				coalesce(be.open_library_edition_id, '') as open_library_edition_id,
				coalesce(be.language, '') as language,
				(
					(select count(*)::int from user_book ub where ub.edition_id = be.id)
					+ case when be.book_id is not null then
						(select count(*)::int from user_book ub where ub.book_id = be.book_id)
						+ (select count(*)::int from user_reading_progress_event pe where pe.book_id = be.book_id)
						+ (select count(*)::int from reading_journal_entry rj where rj.book_id = be.book_id)
						+ (select count(*)::int from reading_journal_note rn where rn.book_id = be.book_id)
						+ (select count(*)::int from user_activity ua where ua.book_id = be.book_id)
					else 0 end
				)::int as reference_count,
				coalesce(be.metadata, '{}'::jsonb) as metadata,
				be.updated_at::text as updated_at
			from book_edition be
			where be.work_id = ${id}
			order by coalesce(be.book_id, 0) desc, be.id asc
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
	const workMetadata = readMetadataObject(work.metadata);
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
			preferredEditionId: normalizeInt(workMetadata.preferredEditionId || workMetadata.preferred_edition_id),
			metadata: workMetadata,
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
				referenceCount: Number(edition.reference_count || 0),
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

function manualMetadata(metadata: Record<string, unknown>, changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>, source = "Manual") {
	const fields = changes.map((change) => change.field);
	return {
		...metadata,
		manualOverrides: Array.from(new Set([...(Array.isArray(metadata.manualOverrides) ? metadata.manualOverrides.map(String) : []), ...fields])),
		provenance: {
			...readMetadataObject(metadata.provenance),
			source,
			manuallyCurated: true,
			updatedAt: new Date().toISOString()
		}
	};
}

async function resolveCatalogEditorSeriesId(sql: Sql, formData: FormData) {
	const selectedId = normalizeInt(formData.get("seriesId"));
	if (selectedId > 0) return selectedId;
	const requestedName = normalizeText(formData.get("seriesCreateName"), 160);
	if (!requestedName) return 0;
	const slug = slugifySeriesName(requestedName);
	if (!slug) return 0;
	const rows = await sql<Array<{ id: number }>>`
		insert into series (name, slug, metadata)
		values (${requestedName}, ${slug}, jsonb_build_object('source', 'admin-catalog-editor'))
		on conflict (slug) do update set
			name = case when trim(series.name) = '' then excluded.name else series.name end,
			metadata = series.metadata || jsonb_build_object('lastSelectedBy', 'admin-catalog-editor'),
			updated_at = now()
		returning id
	`;
	return normalizeInt(rows[0]?.id);
}

export async function saveCatalogEditorData(sql: Sql, adminUserId: string, formData: FormData) {
	await ensureAdminCatalogSchema(sql);
	const workId = normalizeInt(formData.get("workId"));
	const editionId = normalizeInt(formData.get("editionId"));
	const editionMode = normalizeText(formData.get("editionMode"), 20);
	const editionIntent = normalizeText(formData.get("editionIntent"), 20);
	if (!workId) return { ok: false, message: "Missing Work ID." };
	const current = await loadCatalogEditorData(sql, workId);
	if (!current) return { ok: false, message: "Work not found." };
	const submittedEdition = current.editions.find((item) => item.id === editionId) || null;
	if (editionIntent === "delete") {
		if (!submittedEdition) return { ok: false, message: "Edition not found." };
		if (current.editions.length <= 1) return { ok: false, message: "Keep at least one Edition attached to this Work." };
		if (submittedEdition.referenceCount > 0) return { ok: false, message: "This Edition is referenced by reader-owned history and cannot be deleted here." };
		const replacementPreferredEditionId = current.work.preferredEditionId === submittedEdition.id
			? current.editions.find((edition) => edition.id !== submittedEdition.id)?.id || 0
			: current.work.preferredEditionId;
		const deletionWorkChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
		addChange(deletionWorkChanges, "preferredEditionId", current.work.preferredEditionId, replacementPreferredEditionId);
		const deletionWorkMetadata = deletionWorkChanges.length > 0 ? manualMetadata({
			...current.work.metadata,
			preferredEditionId: replacementPreferredEditionId || undefined
		}, deletionWorkChanges, "Manual") : null;
		await sql.transaction((tx) => {
			const steps = [
				tx`delete from book_edition where id = ${submittedEdition.id} and work_id = ${workId}`,
				tx`
					insert into admin_catalog_audit_event (admin_user_id, entity_type, entity_id, changed_fields)
					values (${adminUserId}::uuid, 'edition', ${submittedEdition.id}, ${JSON.stringify([{ field: "edition", oldValue: submittedEdition.editionKey, newValue: "deleted" }])}::jsonb)
				`
			];
			if (deletionWorkMetadata) {
				steps.push(tx`
					update book_work
					set metadata = ${JSON.stringify(deletionWorkMetadata)}::jsonb, updated_at = now()
					where id = ${workId}
				`);
				steps.push(tx`
					insert into admin_catalog_audit_event (admin_user_id, entity_type, entity_id, changed_fields)
					values (${adminUserId}::uuid, 'work', ${workId}, ${JSON.stringify(deletionWorkChanges)}::jsonb)
				`);
			}
			return steps;
		});
		return { ok: true, message: "Edition removed.", deletedEditionId: submittedEdition.id };
	}
	const coverValidation = validateCoverValue(formData.get("coverUrl"));
	if (!coverValidation.ok) return { ok: false, message: coverValidation.message || "Cover could not be saved." };
	const preferredCoverValidation = validateCoverValue(formData.get("preferredCoverUrl"));
	if (!preferredCoverValidation.ok) return { ok: false, message: preferredCoverValidation.message || "Cover could not be saved." };
	const isAddingEdition = editionMode === "add";
	if (submittedEdition || isAddingEdition) {
		if (hasMalformedIsbn(formData.get("isbn10"), 10)) return { ok: false, message: "ISBN-10 must contain 10 ISBN characters." };
		if (hasMalformedIsbn(formData.get("isbn13"), 13)) return { ok: false, message: "ISBN-13 must contain 13 digits." };
		if (!isValidPublicationDate(formData.get("publicationDate"))) return { ok: false, message: "Publication date must be a valid date, year, or year-month." };
		const normalizedFormat = normalizeEditionFormat(formData.get("editionFormat"));
		if (isAddingEdition && !normalizedFormat) return { ok: false, message: "Choose a format before adding an Edition." };
		if (isAudiobookFormat(normalizedFormat) && !parseDurationToSeconds(formData.get("duration"))) return { ok: false, message: "Audiobook duration must be a positive duration." };
	}
	const resolvedSeriesId = await resolveCatalogEditorSeriesId(sql, formData);
	const coverSource = normalizeText(formData.get("coverSource"), 40);
	const coverProvenance = coverSource === "upload" ? "Admin upload" : coverSource === "url" ? "Admin URL" : "Manual";
	const requestedPreferredEditionId = normalizeInt(formData.get("preferredEditionId"));
	const nextPreferredEditionId = current.editions.some((edition) => edition.id === requestedPreferredEditionId) ? requestedPreferredEditionId : current.work.preferredEditionId;

	const workChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
	const nextWork = {
		title: normalizeText(formData.get("workTitle"), 500),
		canonicalTitle: normalizeText(formData.get("canonicalTitle"), 500),
		primaryAuthor: normalizeText(formData.get("primaryAuthor"), 300),
		description: normalizeText(formData.get("description"), 12000),
		subjects: splitList(formData.get("subjects")),
		genres: splitList(formData.get("genres")),
		seriesId: resolvedSeriesId,
		seriesPosition: resolvedSeriesId > 0 ? normalizeDecimalText(formData.get("seriesPosition")) : "",
		originalPublicationYear: normalizePositiveYear(formData.get("originalPublicationYear")),
		preferredCoverUrl: preferredCoverValidation.cover,
		preferredEditionId: nextPreferredEditionId
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
	addChange(workChanges, "preferredEditionId", current.work.preferredEditionId, nextWork.preferredEditionId);

	const edition = submittedEdition;
	const editionChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
	let nextEdition: Record<string, unknown> | null = null;
	if (edition || isAddingEdition) {
		const durationSeconds = parseDurationToSeconds(formData.get("duration"));
		if (hasMalformedIsbn(formData.get("isbn10"), 10)) return { ok: false, message: "ISBN-10 must contain 10 ISBN characters." };
		if (hasMalformedIsbn(formData.get("isbn13"), 13)) return { ok: false, message: "ISBN-13 must contain 13 digits." };
		if (!isValidPublicationDate(formData.get("publicationDate"))) return { ok: false, message: "Publication date must be a valid date, year, or year-month." };
		nextEdition = {
			format: normalizeEditionFormat(formData.get("editionFormat")),
			isbn10: normalizeIsbn(formData.get("isbn10"), 10),
			isbn13: normalizeIsbn(formData.get("isbn13"), 13),
			publisher: normalizeText(formData.get("publisher"), 300),
			publicationDate: normalizeText(formData.get("publicationDate"), 80),
			publicationYear: normalizePositiveYear(formData.get("publicationYear")),
			pageCount: normalizeInt(formData.get("pageCount")),
			coverUrl: coverValidation.cover,
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
		const existingEdition = edition || {
			format: "",
			isbn10: "",
			isbn13: "",
			publisher: "",
			publicationDate: "",
			publicationYear: 0,
			pageCount: 0,
			coverUrl: "",
			googleBooksId: "",
			openLibraryWorkId: "",
			openLibraryEditionId: "",
			language: "",
			durationSeconds: 0,
			locationCount: 0,
			chapterCount: 0,
			title: ""
		};
		addChange(editionChanges, "format", existingEdition.format, nextEdition.format);
		addChange(editionChanges, "isbn10", existingEdition.isbn10, nextEdition.isbn10);
		addChange(editionChanges, "isbn13", existingEdition.isbn13, nextEdition.isbn13);
		addChange(editionChanges, "publisher", existingEdition.publisher, nextEdition.publisher);
		addChange(editionChanges, "publicationDate", existingEdition.publicationDate, nextEdition.publicationDate);
		addChange(editionChanges, "publicationYear", existingEdition.publicationYear, nextEdition.publicationYear);
		addChange(editionChanges, "pageCount", existingEdition.pageCount, nextEdition.pageCount);
		addChange(editionChanges, "coverUrl", existingEdition.coverUrl, nextEdition.coverUrl);
		addChange(editionChanges, "googleBooksId", existingEdition.googleBooksId, nextEdition.googleBooksId);
		addChange(editionChanges, "openLibraryWorkId", existingEdition.openLibraryWorkId, nextEdition.openLibraryWorkId);
		addChange(editionChanges, "openLibraryEditionId", existingEdition.openLibraryEditionId, nextEdition.openLibraryEditionId);
		addChange(editionChanges, "language", existingEdition.language, nextEdition.language);
		addChange(editionChanges, "durationSeconds", existingEdition.durationSeconds, nextEdition.durationSeconds);
		addChange(editionChanges, "locationCount", existingEdition.locationCount, nextEdition.locationCount);
		addChange(editionChanges, "chapterCount", existingEdition.chapterCount, nextEdition.chapterCount);
		addChange(editionChanges, "title", existingEdition.title, nextEdition.title);
	}

	if (workChanges.length === 0 && editionChanges.length === 0) return { ok: true, message: "No catalog changes to save." };
	const nextWorkMetadata = workChanges.length > 0 ? manualMetadata({
		...current.work.metadata,
		preferredEditionId: nextWork.preferredEditionId || undefined
	}, workChanges, workChanges.some((change) => change.field === "preferredCoverUrl") ? coverProvenance : "Manual") : current.work.metadata;
	const nextEditionMetadata = nextEdition && editionChanges.length > 0
		? manualMetadata({
			...(edition?.metadata || {}),
			title: nextEdition.title,
			durationSeconds: nextEdition.durationSeconds,
			locationCount: nextEdition.locationCount,
			chapterCount: nextEdition.chapterCount
		}, editionChanges, editionChanges.some((change) => change.field === "coverUrl") ? coverProvenance : "Manual")
		: null;
	const newEditionKey = isAddingEdition ? `admin:${workId}:${Date.now()}` : "";
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
			if (nextWork.seriesId > 0) {
				steps.push(tx`
					delete from series_book
					where book_id in (select id from book where work_id = ${workId})
						and series_id <> ${nextWork.seriesId}
				`);
				if (current.work.bookId > 0) {
					steps.push(tx`
						insert into series_book (
							series_id,
							book_id,
							title_override,
							book_order,
							publication_order,
							chronological_order,
							metadata
						)
						values (
							${nextWork.seriesId},
							${current.work.bookId},
							'',
							${nextWork.seriesPosition || null}::numeric,
							${nextWork.seriesPosition || null}::numeric,
							${nextWork.seriesPosition || null}::numeric,
							jsonb_build_object('source', 'admin-catalog-editor')
						)
						on conflict (series_id, book_id) where book_id is not null do update set
							title_override = '',
							book_order = excluded.book_order,
							publication_order = excluded.publication_order,
							chronological_order = excluded.chronological_order,
							metadata = series_book.metadata || excluded.metadata,
							updated_at = now()
					`);
				}
			} else {
				steps.push(tx`
					delete from series_book
					where book_id in (select id from book where work_id = ${workId})
				`);
			}
		}
		if (edition && nextEdition && nextEditionMetadata && editionChanges.length > 0) {
			const coverChanged = editionChanges.some((change) => change.field === "coverUrl");
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
						cover_url = case when ${coverChanged}::boolean then ${nextEdition.coverUrl} else case when ${nextEdition.coverUrl}::text <> '' then ${nextEdition.coverUrl} else cover_url end end,
						google_books_id = case when ${nextEdition.googleBooksId}::text <> '' then ${nextEdition.googleBooksId} else google_books_id end,
						language = case when ${nextEdition.language}::text <> '' then ${nextEdition.language} else language end,
						published_year = coalesce(published_year, ${nextEdition.publicationYear || null}),
						updated_at = now()
					where id = ${edition.bookId}
				`);
			}
		}
		if (isAddingEdition && nextEdition && nextEditionMetadata && editionChanges.length > 0) {
			steps.push(tx`
				insert into book_edition (
					work_id,
					book_id,
					edition_key,
					format,
					isbn10,
					isbn13,
					publisher,
					publication_date,
					publication_year,
					page_count,
					cover_url,
					google_books_id,
					open_library_work_id,
					open_library_edition_id,
					language,
					metadata
				)
				values (
					${workId},
					null,
					${newEditionKey},
					${nextEdition.format},
					${nextEdition.isbn10},
					${nextEdition.isbn13},
					${nextEdition.publisher},
					${nextEdition.publicationDate},
					${nextEdition.publicationYear || null},
					${nextEdition.pageCount},
					${nextEdition.coverUrl},
					${nextEdition.googleBooksId},
					${nextEdition.openLibraryWorkId},
					${nextEdition.openLibraryEditionId},
					${nextEdition.language},
					${JSON.stringify(nextEditionMetadata)}::jsonb
				)
			`);
			steps.push(tx`
				insert into admin_catalog_audit_event (admin_user_id, entity_type, entity_id, changed_fields)
				values (${adminUserId}::uuid, 'work', ${workId}, ${JSON.stringify([{ field: "edition", oldValue: "", newValue: newEditionKey }, ...editionChanges])}::jsonb)
			`);
		}
		return steps;
	});
	const createdRows = newEditionKey
		? await sql<Array<{ id: number }>>`select id from book_edition where work_id = ${workId} and edition_key = ${newEditionKey} limit 1`
		: [];
	const savedCount = workChanges.length + editionChanges.length;
	return {
		ok: true,
		message: `Saved ${savedCount} catalog field change${savedCount === 1 ? "" : "s"}.`,
		editionId: Number(createdRows[0]?.id || edition?.id || 0)
	};
}
