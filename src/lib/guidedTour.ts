import type { getNeonSql } from "./neon";
import { ensureReadingJournalSchema } from "./readingJournal.ts";

type Sql = ReturnType<typeof getNeonSql>;

export const GUIDED_TIP_IDS = [
	"home-welcome",
	"search-add-book",
	"book-detail-shelves",
	"first-book-added",
	"currently-reading-progress",
	"first-progress-update",
	"reading-journal-private",
	"first-finished-book",
	"reviews-vs-journal",
	"settings-learning"
] as const;

export type GuidedTipId = typeof GUIDED_TIP_IDS[number];

export type GuidedTourSettings = {
	showHelpfulTips: boolean;
	dismissedTips: GuidedTipId[];
	completedTips: GuidedTipId[];
};

export const DEFAULT_GUIDED_TOUR_SETTINGS: GuidedTourSettings = {
	showHelpfulTips: true,
	dismissedTips: [],
	completedTips: []
};

export function normalizeGuidedTipId(value: unknown): GuidedTipId | "" {
	const id = String(value || "").trim();
	return (GUIDED_TIP_IDS as readonly string[]).includes(id) ? id as GuidedTipId : "";
}

function normalizeTipList(value: unknown) {
	if (!Array.isArray(value)) return [] as GuidedTipId[];
	const seen = new Set<GuidedTipId>();
	for (const item of value) {
		const id = normalizeGuidedTipId(item);
		if (id) seen.add(id);
	}
	return Array.from(seen);
}

export function normalizeGuidedTourSettings(input: unknown): GuidedTourSettings {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	return {
		showHelpfulTips: source.showHelpfulTips !== false,
		dismissedTips: normalizeTipList(source.dismissedTips),
		completedTips: normalizeTipList(source.completedTips)
	};
}

export function mergeGuidedTourSettings(current: unknown, patch: Partial<GuidedTourSettings>) {
	const normalized = normalizeGuidedTourSettings(current);
	return normalizeGuidedTourSettings({
		...normalized,
		...patch
	});
}

export function addGuidedTourTip(settings: GuidedTourSettings, tipId: GuidedTipId, field: "dismissedTips" | "completedTips") {
	const next = normalizeGuidedTourSettings(settings);
	const values = new Set(next[field]);
	values.add(tipId);
	return {
		...next,
		[field]: Array.from(values)
	};
}

export async function loadGuidedTourStatus(sql: Sql, userId: string) {
	await sql`alter table app_user add column if not exists profile_data jsonb not null default '{}'::jsonb`;
	await ensureReadingJournalSchema(sql);
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
	const [settingsRows, statsRows] = await Promise.all([
		sql<Array<{ guided_tour: unknown }>>`
			select coalesce(profile_data->'settings'->'guidedTour', '{}'::jsonb) as guided_tour
			from app_user
			where id = ${userId}::uuid
			limit 1
		`,
		sql<Array<{
			total_books: number;
			reading_books: number;
			finished_books: number;
			rated_books: number;
			reviews: number;
			progress_events: number;
			journal_entries: number;
		}>>`
			select
				(select count(*)::int from user_book where user_id = ${userId}::uuid) as total_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and status = 'reading') as reading_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and status = 'finished') as finished_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and rating is not null) as rated_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and char_length(trim(coalesce(finished_reflection, ''))) > 0) as reviews,
				(select count(*)::int from user_reading_progress_event where user_id = ${userId}::uuid) as progress_events,
				(select count(*)::int from reading_journal_note where user_id = ${userId}::uuid) as journal_entries
		`
	]);
	const stats = statsRows[0] || {};
	return {
		settings: normalizeGuidedTourSettings(settingsRows[0]?.guided_tour),
		stats: {
			totalBooks: Math.max(0, Number(stats.total_books || 0)),
			readingBooks: Math.max(0, Number(stats.reading_books || 0)),
			finishedBooks: Math.max(0, Number(stats.finished_books || 0)),
			ratedBooks: Math.max(0, Number(stats.rated_books || 0)),
			reviews: Math.max(0, Number(stats.reviews || 0)),
			progressEvents: Math.max(0, Number(stats.progress_events || 0)),
			journalEntries: Math.max(0, Number(stats.journal_entries || 0))
		}
	};
}
