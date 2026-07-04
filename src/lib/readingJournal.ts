import type { getNeonSql } from "./neon";

type Sql = ReturnType<typeof getNeonSql>;

export type JournalVisibility = "private" | "friends" | "public" | "shared";

export type ReadingJournalEntry = {
	userId: string;
	bookId: number;
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
	bookId: unknown;
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

type RawJournalRow = {
	user_id: string;
	book_id: number;
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
	const wouldRereadRaw = input.wouldReread;
	const wouldReread = wouldRereadRaw === true || wouldRereadRaw === "true" || wouldRereadRaw === "on"
		? true
		: (wouldRereadRaw === false || wouldRereadRaw === "false" ? false : null);
	return {
		bookId,
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

export function journalHasContent(input: Partial<ReadingJournalEntry> | ReturnType<typeof normalizeJournalInput>) {
	return Boolean(
		normalizeJournalText(input.startedThoughts).length > 0
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
	return {
		userId: String(row.user_id || ""),
		bookId: Math.max(0, Number(row.book_id || 0) || 0),
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

export async function searchJournalEntries(sql: Sql, userId: string, query: string, limit = 24) {
	await ensureReadingJournalSchema(sql);
	if (!userId) return [] as JournalSearchResult[];
	const normalizedQuery = String(query || "").replace(/\s+/g, " ").trim();
	const pattern = `%${normalizedQuery}%`;
	const rows = await sql<RawJournalRow[]>`
		select
			j.user_id::text as user_id,
			j.book_id,
			j.started_thoughts,
			j.mid_book_notes,
			j.finished_thoughts,
			j.favorite_quote,
			j.would_reread,
			j.recommended_to,
			j.personal_tags,
			j.visibility,
			j.created_at::text as created_at,
			j.updated_at::text as updated_at,
			b.title,
			b.primary_author,
			b.cover_url,
			ub.rating,
			ub.status
		from reading_journal_entry j
		join book b on b.id = j.book_id
		left join user_book ub on ub.user_id = j.user_id and ub.book_id = j.book_id
		where j.user_id = ${userId}::uuid
			and (
				${normalizedQuery} = ''
				or b.title ilike ${pattern}
				or b.primary_author ilike ${pattern}
				or j.started_thoughts ilike ${pattern}
				or j.mid_book_notes ilike ${pattern}
				or j.finished_thoughts ilike ${pattern}
				or j.favorite_quote ilike ${pattern}
				or j.recommended_to ilike ${pattern}
				or exists (
					select 1
					from unnest(j.personal_tags) tag
					where tag ilike ${pattern}
				)
			)
		order by j.updated_at desc, b.title asc
		limit ${Math.max(1, Math.min(100, Math.floor(limit)))}
	`;
	return rows.map(mapSearchRow);
}

export async function loadRecentJournalEntries(sql: Sql, userId: string, limit = 5) {
	return searchJournalEntries(sql, userId, "", limit);
}
