import type { getNeonSql } from "./neon";

type Sql = ReturnType<typeof getNeonSql>;

export type JournalVisibility = "private" | "friends" | "public" | "shared";
export type ReadingPositionType = "" | "page" | "percent" | "chapter" | "location";

export type ReadingJournalEntry = {
	id?: number;
	userId: string;
	bookId: number | null;
	entryTitle?: string;
	body?: string;
	entryAt?: string;
	progressSnapshot?: number | null;
	pageNumber?: number | null;
	chapterLocation?: string;
	readingPositionType?: ReadingPositionType;
	readingPositionValue?: string;
	mood?: string;
	startedThoughts: string;
	midBookNotes: string;
	finishedThoughts: string;
	favoriteQuote: string;
	wouldReread: boolean | null;
	recommendedTo: string;
	personalTags: string[];
	visibility: JournalVisibility;
	createdAt: string;
	updatedAt: string;
};

export type ReadingJournalInput = {
	id?: unknown;
	bookId: unknown;
	entryTitle?: unknown;
	body?: unknown;
	entryAt?: unknown;
	progressSnapshot?: unknown;
	pageNumber?: unknown;
	chapterLocation?: unknown;
	readingPositionType?: unknown;
	readingPositionValue?: unknown;
	mood?: unknown;
	startedThoughts?: unknown;
	midBookNotes?: unknown;
	finishedThoughts?: unknown;
	favoriteQuote?: unknown;
	wouldReread?: unknown;
	recommendedTo?: unknown;
	personalTags?: unknown;
	visibility?: unknown;
};

export type JournalSearchResult = ReadingJournalEntry & {
	title: string;
	author: string;
	coverUrl: string;
	rating: number;
	status: string;
};

export type JournalSearchOptions = {
	offset?: number;
	bookId?: number;
	date?: string;
};

type RawJournalRow = {
	id?: number | null;
	user_id: string;
	book_id: number | null;
	entry_title?: string | null;
	body?: string | null;
	entry_at?: string | null;
	progress_snapshot?: number | null;
	page_number?: number | null;
	chapter_location?: string | null;
	reading_position_type?: string | null;
	reading_position_value?: string | null;
	mood?: string | null;
	started_thoughts: string | null;
	mid_book_notes: string | null;
	finished_thoughts: string | null;
	favorite_quote: string | null;
	would_reread: boolean | null;
	recommended_to: string | null;
	personal_tags: string[] | string | null;
	visibility: string | null;
	created_at: string | null;
	updated_at: string | null;
	title?: string | null;
	primary_author?: string | null;
	cover_url?: string | null;
	rating?: number | null;
	status?: string | null;
};

export function normalizeJournalVisibility(value: unknown): JournalVisibility {
	const visibility = String(value || "").trim().toLowerCase();
	if (visibility === "friends" || visibility === "public" || visibility === "shared") return visibility;
	return "private";
}

export function normalizeReadingPositionType(value: unknown): ReadingPositionType {
	const type = String(value || "").trim().toLowerCase();
	if (type === "page" || type === "percent" || type === "chapter" || type === "location") return type;
	return "";
}

export function formatReadingPosition(type: unknown, value: unknown) {
	const positionType = normalizeReadingPositionType(type);
	const positionValue = normalizeJournalText(value, 160);
	if (!positionType || !positionValue) return "";
	if (positionType === "page") return `Page ${positionValue}`;
	if (positionType === "percent") return positionValue.endsWith("%") ? positionValue : `${positionValue}%`;
	if (positionType === "chapter") return /^chapter\b/i.test(positionValue) ? positionValue : `Chapter ${positionValue}`;
	return positionValue;
}

export function normalizeJournalText(value: unknown, maxLength = 4000) {
	return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

export function parseJournalTags(value: unknown, maxTags = 16) {
	const raw = Array.isArray(value)
		? value.flatMap((item) => String(item || "").split(","))
		: String(value || "").split(",");
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const item of raw) {
		const tag = String(item || "").replace(/\s+/g, " ").trim().slice(0, 40);
		if (!tag) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		tags.push(tag);
		if (tags.length >= maxTags) break;
	}
	return tags;
}

export function normalizeJournalInput(input: ReadingJournalInput) {
	const bookId = Math.max(0, Number(input.bookId || 0) || 0);
	const legacyPageNumber = Math.max(0, Math.floor(Number(input.pageNumber || 0) || 0));
	const legacyProgressSnapshot = Math.max(0, Math.floor(Number(input.progressSnapshot || 0) || 0));
	const legacyChapterLocation = normalizeJournalText(input.chapterLocation, 160);
	let readingPositionType = normalizeReadingPositionType(input.readingPositionType);
	let readingPositionValue = normalizeJournalText(input.readingPositionValue, 160);
	if (!readingPositionType || !readingPositionValue) {
		if (legacyPageNumber > 0) {
			readingPositionType = "page";
			readingPositionValue = String(legacyPageNumber);
		} else if (legacyProgressSnapshot > 0) {
			readingPositionType = "percent";
			readingPositionValue = String(legacyProgressSnapshot);
		} else if (legacyChapterLocation) {
			readingPositionType = /^chapter\b/i.test(legacyChapterLocation) ? "chapter" : "location";
			readingPositionValue = legacyChapterLocation.replace(/^chapter\s*/i, "").trim() || legacyChapterLocation;
		}
	}
	if (!readingPositionType || !readingPositionValue) {
		readingPositionType = "";
		readingPositionValue = "";
	}
	const numericPosition = Math.max(0, Math.floor(Number(String(readingPositionValue || "").replace(/[^0-9.]/g, "")) || 0));
	const pageNumber = readingPositionType === "page" && numericPosition > 0 ? numericPosition : 0;
	const progressSnapshot = readingPositionType === "percent" && numericPosition > 0 ? Math.min(100, numericPosition) : 0;
	const chapterLocation = readingPositionType === "chapter" || readingPositionType === "location"
		? readingPositionValue
		: "";
	const wouldRereadRaw = input.wouldReread;
	const wouldReread = wouldRereadRaw === true || wouldRereadRaw === "true" || wouldRereadRaw === "on"
		? true
		: (wouldRereadRaw === false || wouldRereadRaw === "false" ? false : null);
	return {
		id: Math.max(0, Number(input.id || 0) || 0),
		bookId,
		entryTitle: normalizeJournalText(input.entryTitle, 160),
		body: normalizeJournalText(input.body, 8000),
		entryAt: normalizeJournalDateTime(input.entryAt),
		progressSnapshot: progressSnapshot > 0 ? progressSnapshot : null,
		pageNumber: pageNumber > 0 ? pageNumber : null,
		chapterLocation,
		readingPositionType,
		readingPositionValue,
		mood: normalizeJournalText(input.mood, 80),
		startedThoughts: normalizeJournalText(input.startedThoughts),
		midBookNotes: normalizeJournalText(input.midBookNotes),
		finishedThoughts: normalizeJournalText(input.finishedThoughts),
		favoriteQuote: normalizeJournalText(input.favoriteQuote, 1200),
		wouldReread,
		recommendedTo: normalizeJournalText(input.recommendedTo, 1000),
		personalTags: parseJournalTags(input.personalTags),
		visibility: normalizeJournalVisibility(input.visibility)
	};
}

export function normalizeJournalDateTime(value: unknown) {
	const raw = String(value || "").trim();
	if (!raw) return new Date().toISOString();
	const parsed = new Date(raw);
	return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export function journalHasContent(input: Partial<ReadingJournalEntry> | ReturnType<typeof normalizeJournalInput>) {
	return Boolean(
		normalizeJournalText(input.startedThoughts).length > 0
		|| normalizeJournalText(input.body).length > 0
		|| normalizeJournalText(input.midBookNotes).length > 0
		|| normalizeJournalText(input.finishedThoughts).length > 0
		|| normalizeJournalText(input.favoriteQuote).length > 0
		|| normalizeJournalText(input.recommendedTo).length > 0
		|| (Array.isArray(input.personalTags) && input.personalTags.length > 0)
		|| typeof input.wouldReread === "boolean"
	);
}

export function journalCharacterCount(input: Partial<ReadingJournalEntry> | ReturnType<typeof normalizeJournalInput>) {
	const tags = Array.isArray(input.personalTags) ? input.personalTags.join(", ") : "";
	return [
		input.body,
		input.startedThoughts,
		input.midBookNotes,
		input.finishedThoughts,
		input.favoriteQuote,
		input.recommendedTo,
		tags
	].reduce((sum, value) => sum + String(value || "").length, 0);
}

export function canAccessJournalEntry(entry: Pick<ReadingJournalEntry, "userId" | "visibility">, viewerUserId: unknown) {
	const viewer = String(viewerUserId || "").trim();
	if (!viewer) return false;
	if (viewer === String(entry.userId || "").trim()) return true;
	return false;
}

function parseTagsFromDb(value: RawJournalRow["personal_tags"]) {
	if (Array.isArray(value)) return parseJournalTags(value);
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) return parseJournalTags(parsed);
		} catch {
			return parseJournalTags(value);
		}
	}
	return [];
}

function mapJournalRow(row: RawJournalRow): ReadingJournalEntry {
	const legacyPageNumber = row.page_number ? Math.max(0, Number(row.page_number || 0) || 0) : 0;
	const legacyProgressSnapshot = row.progress_snapshot ? Math.max(0, Number(row.progress_snapshot || 0) || 0) : 0;
	const legacyChapterLocation = String(row.chapter_location || "");
	let readingPositionType = normalizeReadingPositionType(row.reading_position_type);
	let readingPositionValue = String(row.reading_position_value || "").trim();
	if (!readingPositionType || !readingPositionValue) {
		if (legacyPageNumber > 0) {
			readingPositionType = "page";
			readingPositionValue = String(legacyPageNumber);
		} else if (legacyProgressSnapshot > 0) {
			readingPositionType = "percent";
			readingPositionValue = String(legacyProgressSnapshot);
		} else if (legacyChapterLocation) {
			readingPositionType = /^chapter\b/i.test(legacyChapterLocation) ? "chapter" : "location";
			readingPositionValue = legacyChapterLocation.replace(/^chapter\s*/i, "").trim() || legacyChapterLocation;
		}
	}
	return {
		userId: String(row.user_id || ""),
		id: Math.max(0, Number(row.id || 0) || 0),
		bookId: row.book_id ? Math.max(0, Number(row.book_id || 0) || 0) : null,
		entryTitle: String(row.entry_title || ""),
		body: String(row.body || ""),
		entryAt: String(row.entry_at || ""),
		progressSnapshot: legacyProgressSnapshot || null,
		pageNumber: legacyPageNumber || null,
		chapterLocation: legacyChapterLocation,
		readingPositionType,
		readingPositionValue,
		mood: String(row.mood || ""),
		startedThoughts: String(row.started_thoughts || ""),
		midBookNotes: String(row.mid_book_notes || ""),
		finishedThoughts: String(row.finished_thoughts || ""),
		favoriteQuote: String(row.favorite_quote || ""),
		wouldReread: typeof row.would_reread === "boolean" ? row.would_reread : null,
		recommendedTo: String(row.recommended_to || ""),
		personalTags: parseTagsFromDb(row.personal_tags),
		visibility: normalizeJournalVisibility(row.visibility),
		createdAt: String(row.created_at || ""),
		updatedAt: String(row.updated_at || "")
	};
}

function mapSearchRow(row: RawJournalRow): JournalSearchResult {
	return {
		...mapJournalRow(row),
		title: String(row.title || "").trim(),
		author: String(row.primary_author || "").trim(),
		coverUrl: String(row.cover_url || "").trim(),
		rating: Math.max(0, Number(row.rating || 0) || 0),
		status: String(row.status || "").trim()
	};
}

export async function ensureReadingJournalSchema(sql: Sql) {
	await sql`
		create table if not exists reading_journal_note (
			id bigserial primary key,
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint references book(id) on delete set null,
			entry_title text not null default '',
			body text not null default '',
			entry_at timestamptz not null default now(),
			progress_snapshot int,
			page_number int,
			chapter_location text not null default '',
			reading_position_type text not null default '' check (reading_position_type in ('', 'page', 'percent', 'chapter', 'location')),
			reading_position_value text not null default '',
			mood text not null default '',
			personal_tags text[] not null default '{}',
			visibility text not null default 'private' check (visibility in ('private', 'friends', 'public', 'shared')),
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await Promise.all([
		sql`alter table reading_journal_note add column if not exists reading_position_type text not null default ''`,
		sql`alter table reading_journal_note add column if not exists reading_position_value text not null default ''`
	]);
	await Promise.all([
		sql`create index if not exists idx_reading_journal_note_user_entry on reading_journal_note(user_id, entry_at desc, updated_at desc)`,
		sql`create index if not exists idx_reading_journal_note_book on reading_journal_note(user_id, book_id, entry_at desc)`,
		sql`create index if not exists idx_reading_journal_note_visibility on reading_journal_note(visibility)`
	]);
	await sql`
		create table if not exists reading_journal_entry (
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			started_thoughts text not null default '',
			mid_book_notes text not null default '',
			finished_thoughts text not null default '',
			favorite_quote text not null default '',
			would_reread boolean,
			recommended_to text not null default '',
			personal_tags text[] not null default '{}',
			visibility text not null default 'private' check (visibility in ('private', 'friends', 'public', 'shared')),
			metadata jsonb not null default '{}'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (user_id, book_id)
		)
	`;
	await Promise.all([
		sql`create index if not exists idx_reading_journal_user_updated on reading_journal_entry(user_id, updated_at desc)`,
		sql`create index if not exists idx_reading_journal_book on reading_journal_entry(book_id)`,
		sql`create index if not exists idx_reading_journal_visibility on reading_journal_entry(visibility)`
	]);
	await sql`
		insert into reading_journal_note (
			user_id,
			book_id,
			entry_title,
			body,
			entry_at,
			personal_tags,
			visibility,
			created_at,
			updated_at,
			metadata
		)
		select
			j.user_id,
			j.book_id,
			'',
			trim(concat_ws(E'\n\n',
				nullif(concat('Started thoughts', E'\n', nullif(j.started_thoughts, '')), concat('Started thoughts', E'\n')),
				nullif(concat('Mid-book notes', E'\n', nullif(j.mid_book_notes, '')), concat('Mid-book notes', E'\n')),
				nullif(concat('Finished thoughts', E'\n', nullif(j.finished_thoughts, '')), concat('Finished thoughts', E'\n')),
				nullif(concat('Favorite quote', E'\n', nullif(j.favorite_quote, '')), concat('Favorite quote', E'\n')),
				nullif(concat('Recommended to', E'\n', nullif(j.recommended_to, '')), concat('Recommended to', E'\n'))
			)),
			j.updated_at,
			j.personal_tags,
			j.visibility,
			j.created_at,
			j.updated_at,
			jsonb_build_object('legacyReadingJournalEntry', true)
		from reading_journal_entry j
		where not exists (
			select 1
			from reading_journal_note n
			where n.user_id = j.user_id
				and n.book_id = j.book_id
				and n.metadata->>'legacyReadingJournalEntry' = 'true'
		)
			and (
				j.started_thoughts <> ''
				or j.mid_book_notes <> ''
				or j.finished_thoughts <> ''
				or j.favorite_quote <> ''
				or j.recommended_to <> ''
				or cardinality(j.personal_tags) > 0
				or j.would_reread is not null
			)
	`;
}

export async function userOwnsBook(sql: Sql, userId: string, bookId: number) {
	if (!userId || !bookId) return false;
	const rows = await sql<Array<{ exists: boolean }>>`
		select exists (
			select 1
			from user_book
			where user_id = ${userId}::uuid
				and book_id = ${bookId}
		) as exists
	`;
	return !!rows[0]?.exists;
}

export async function loadJournalForBook(sql: Sql, userId: string, bookId: number) {
	await ensureReadingJournalSchema(sql);
	if (!userId || !bookId) return null;
	const rows = await sql<RawJournalRow[]>`
		select
			user_id::text as user_id,
			book_id,
			started_thoughts,
			mid_book_notes,
			finished_thoughts,
			favorite_quote,
			would_reread,
			recommended_to,
			personal_tags,
			visibility,
			created_at::text as created_at,
			updated_at::text as updated_at
		from reading_journal_entry
		where user_id = ${userId}::uuid
			and book_id = ${bookId}
		limit 1
	`;
	return rows[0] ? mapJournalRow(rows[0]) : null;
}

export async function upsertJournalEntry(sql: Sql, userId: string, input: ReadingJournalInput) {
	await ensureReadingJournalSchema(sql);
	const normalized = normalizeJournalInput(input);
	if (!userId || !normalized.bookId) throw new Error("Missing book.");
	if (!await userOwnsBook(sql, userId, normalized.bookId)) {
		throw new Error("Add this book to your shelf before journaling about it.");
	}
	const rows = await sql<RawJournalRow[]>`
		insert into reading_journal_entry (
			user_id,
			book_id,
			started_thoughts,
			mid_book_notes,
			finished_thoughts,
			favorite_quote,
			would_reread,
			recommended_to,
			personal_tags,
			visibility,
			updated_at
		)
		values (
			${userId}::uuid,
			${normalized.bookId},
			${normalized.startedThoughts},
			${normalized.midBookNotes},
			${normalized.finishedThoughts},
			${normalized.favoriteQuote},
			${normalized.wouldReread},
			${normalized.recommendedTo},
			${normalized.personalTags},
			${normalized.visibility},
			now()
		)
		on conflict (user_id, book_id) do update set
			started_thoughts = excluded.started_thoughts,
			mid_book_notes = excluded.mid_book_notes,
			finished_thoughts = excluded.finished_thoughts,
			favorite_quote = excluded.favorite_quote,
			would_reread = excluded.would_reread,
			recommended_to = excluded.recommended_to,
			personal_tags = excluded.personal_tags,
			visibility = excluded.visibility,
			updated_at = now()
		returning
			user_id::text as user_id,
			book_id,
			started_thoughts,
			mid_book_notes,
			finished_thoughts,
			favorite_quote,
			would_reread,
			recommended_to,
			personal_tags,
			visibility,
			created_at::text as created_at,
			updated_at::text as updated_at
	`;
	return mapJournalRow(rows[0]);
}

export async function deleteJournalEntry(sql: Sql, userId: string, bookId: number) {
	await ensureReadingJournalSchema(sql);
	if (!userId || !bookId) return false;
	const rows = await sql<Array<{ book_id: number }>>`
		delete from reading_journal_entry
		where user_id = ${userId}::uuid
			and book_id = ${bookId}
		returning book_id
	`;
	return rows.length > 0;
}

export async function saveJournalNote(sql: Sql, userId: string, input: ReadingJournalInput) {
	await ensureReadingJournalSchema(sql);
	const normalized = normalizeJournalInput(input);
	if (!userId) throw new Error("You must be logged in to save your journal.");
	if (!normalized.body) throw new Error("Journal body is required.");
	if (normalized.bookId > 0 && !await userOwnsBook(sql, userId, normalized.bookId)) {
		throw new Error("Add this book to your shelf before journaling about it.");
	}
	const rows = normalized.id > 0
		? await sql<RawJournalRow[]>`
			update reading_journal_note
			set
				book_id = ${normalized.bookId > 0 ? normalized.bookId : null},
				entry_title = ${normalized.entryTitle},
				body = ${normalized.body},
				entry_at = ${normalized.entryAt}::timestamptz,
				progress_snapshot = ${normalized.progressSnapshot},
				page_number = ${normalized.pageNumber},
				chapter_location = ${normalized.chapterLocation},
				reading_position_type = ${normalized.readingPositionType},
				reading_position_value = ${normalized.readingPositionValue},
				mood = ${normalized.mood},
				personal_tags = ${normalized.personalTags},
				visibility = 'private',
				updated_at = now()
			where id = ${normalized.id}
				and user_id = ${userId}::uuid
			returning
				id,
				user_id::text as user_id,
				book_id,
				entry_title,
				body,
				entry_at::text as entry_at,
				progress_snapshot,
				page_number,
				chapter_location,
				reading_position_type,
				reading_position_value,
				mood,
				personal_tags,
				visibility,
				created_at::text as created_at,
				updated_at::text as updated_at
		`
		: await sql<RawJournalRow[]>`
			insert into reading_journal_note (
				user_id,
				book_id,
				entry_title,
				body,
				entry_at,
				progress_snapshot,
				page_number,
				chapter_location,
				reading_position_type,
				reading_position_value,
				mood,
				personal_tags,
				visibility,
				updated_at
			)
			values (
				${userId}::uuid,
				${normalized.bookId > 0 ? normalized.bookId : null},
				${normalized.entryTitle},
				${normalized.body},
				${normalized.entryAt}::timestamptz,
				${normalized.progressSnapshot},
				${normalized.pageNumber},
				${normalized.chapterLocation},
				${normalized.readingPositionType},
				${normalized.readingPositionValue},
				${normalized.mood},
				${normalized.personalTags},
				'private',
				now()
			)
			returning
				id,
				user_id::text as user_id,
				book_id,
				entry_title,
				body,
				entry_at::text as entry_at,
				progress_snapshot,
				page_number,
				chapter_location,
				reading_position_type,
				reading_position_value,
				mood,
				personal_tags,
				visibility,
				created_at::text as created_at,
				updated_at::text as updated_at
		`;
	if (!rows[0]) throw new Error("Journal entry not found.");
	return mapJournalRow(rows[0]);
}

export async function deleteJournalNote(sql: Sql, userId: string, entryId: number) {
	await ensureReadingJournalSchema(sql);
	if (!userId || !entryId) return false;
	const rows = await sql<Array<{ id: number }>>`
		delete from reading_journal_note
		where id = ${entryId}
			and user_id = ${userId}::uuid
		returning id
	`;
	return rows.length > 0;
}

export async function searchJournalEntries(
	sql: Sql,
	userId: string,
	query: string,
	limit = 24,
	bookId = 0,
	options: JournalSearchOptions = {}
) {
	await ensureReadingJournalSchema(sql);
	if (!userId) return [] as JournalSearchResult[];
	const normalizedQuery = String(query || "").replace(/\s+/g, " ").trim();
	const pattern = `%${normalizedQuery}%`;
	const normalizedBookId = Math.max(0, Number(options.bookId || bookId || 0) || 0);
	const offset = Math.max(0, Math.floor(Number(options.offset || 0) || 0));
	const dateFilter = String(options.date || "").trim().slice(0, 10);
	const rows = await sql<RawJournalRow[]>`
		select
			j.id,
			j.user_id::text as user_id,
			j.book_id,
			j.entry_title,
			j.body,
			j.entry_at::text as entry_at,
			j.progress_snapshot,
			j.page_number,
			j.chapter_location,
			j.reading_position_type,
			j.reading_position_value,
			j.mood,
			'' as started_thoughts,
			'' as mid_book_notes,
			'' as finished_thoughts,
			'' as favorite_quote,
			null::boolean as would_reread,
			'' as recommended_to,
			j.personal_tags,
			j.visibility,
			j.created_at::text as created_at,
			j.updated_at::text as updated_at,
			b.title,
			b.primary_author,
			b.cover_url,
			ub.rating,
			ub.status
		from reading_journal_note j
		left join book b on b.id = j.book_id
		left join user_book ub on ub.user_id = j.user_id and ub.book_id = j.book_id
		where j.user_id = ${userId}::uuid
			and (${normalizedBookId} = 0 or j.book_id = ${normalizedBookId})
			and (${dateFilter} = '' or j.entry_at::date = ${dateFilter || null}::date)
			and (
				${normalizedQuery} = ''
				or coalesce(b.title, '') ilike ${pattern}
				or coalesce(b.primary_author, '') ilike ${pattern}
				or j.entry_title ilike ${pattern}
				or j.body ilike ${pattern}
				or j.chapter_location ilike ${pattern}
				or j.reading_position_value ilike ${pattern}
				or j.mood ilike ${pattern}
				or exists (
					select 1
					from unnest(j.personal_tags) tag
					where tag ilike ${pattern}
				)
			)
		order by j.entry_at desc, j.updated_at desc, coalesce(b.title, '') asc
		limit ${Math.max(1, Math.min(100, Math.floor(limit)))}
		offset ${offset}
	`;
	return rows.map(mapSearchRow);
}

export async function loadRecentJournalEntries(sql: Sql, userId: string, limit = 5) {
	return searchJournalEntries(sql, userId, "", limit);
}

export async function loadJournalEntriesForBook(sql: Sql, userId: string, bookId: number, limit = 5) {
	return searchJournalEntries(sql, userId, "", limit, bookId);
}
