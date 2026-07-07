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
	"discover-recommendations",
	"first-finished-book",
	"settings-learning"
] as const;

export type GuidedTipId = typeof GUIDED_TIP_IDS[number];

export const ONBOARDING_ACTION_IDS = [
	"first-book-added",
	"first-progress-update",
	"first-journal-entry",
	"first-review",
	"first-follow",
	"explore-discover",
	"first-recommendation-interaction"
] as const;

export type OnboardingActionId = typeof ONBOARDING_ACTION_IDS[number];

export const ONBOARDING_MILESTONE_IDS = [
	"first-book-added",
	"first-finished-book",
	"first-review",
	"first-journal-entry",
	"first-follow",
	"first-recommendation-interaction"
] as const;

export type OnboardingMilestoneId = typeof ONBOARDING_MILESTONE_IDS[number];

export type OnboardingState = {
	welcomeCompleted: boolean;
	checklistDismissed: boolean;
	goalPromptDismissed: boolean;
	recommendationEducationDismissed: boolean;
	completedActions: OnboardingActionId[];
	celebratedMilestones: OnboardingMilestoneId[];
};

export type GuidedTourSettings = {
	showHelpfulTips: boolean;
	dismissedTips: GuidedTipId[];
	completedTips: GuidedTipId[];
	onboarding: OnboardingState;
};

export const DEFAULT_GUIDED_TOUR_SETTINGS: GuidedTourSettings = {
	showHelpfulTips: true,
	dismissedTips: [],
	completedTips: [],
	onboarding: {
		welcomeCompleted: false,
		checklistDismissed: false,
		goalPromptDismissed: false,
		recommendationEducationDismissed: false,
		completedActions: [],
		celebratedMilestones: []
	}
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

function normalizeOnboardingActionId(value: unknown): OnboardingActionId | "" {
	const id = String(value || "").trim();
	return (ONBOARDING_ACTION_IDS as readonly string[]).includes(id) ? id as OnboardingActionId : "";
}

function normalizeOnboardingMilestoneId(value: unknown): OnboardingMilestoneId | "" {
	const id = String(value || "").trim();
	return (ONBOARDING_MILESTONE_IDS as readonly string[]).includes(id) ? id as OnboardingMilestoneId : "";
}

function normalizeOnboardingList<T extends string>(value: unknown, normalize: (item: unknown) => T | "") {
	if (!Array.isArray(value)) return [] as T[];
	const seen = new Set<T>();
	for (const item of value) {
		const id = normalize(item);
		if (id) seen.add(id);
	}
	return Array.from(seen);
}

export function normalizeOnboardingState(input: unknown): OnboardingState {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	return {
		welcomeCompleted: source.welcomeCompleted === true,
		checklistDismissed: source.checklistDismissed === true,
		goalPromptDismissed: source.goalPromptDismissed === true,
		recommendationEducationDismissed: source.recommendationEducationDismissed === true,
		completedActions: normalizeOnboardingList(source.completedActions, normalizeOnboardingActionId),
		celebratedMilestones: normalizeOnboardingList(source.celebratedMilestones, normalizeOnboardingMilestoneId)
	};
}

export function normalizeGuidedTourSettings(input: unknown): GuidedTourSettings {
	const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
	return {
		showHelpfulTips: source.showHelpfulTips !== false,
		dismissedTips: normalizeTipList(source.dismissedTips),
		completedTips: normalizeTipList(source.completedTips),
		onboarding: normalizeOnboardingState(source.onboarding)
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

export function addOnboardingAction(settings: GuidedTourSettings, actionId: OnboardingActionId) {
	const next = normalizeGuidedTourSettings(settings);
	const completedActions = new Set(next.onboarding.completedActions);
	completedActions.add(actionId);
	return normalizeGuidedTourSettings({
		...next,
		onboarding: {
			...next.onboarding,
			completedActions: Array.from(completedActions)
		}
	});
}

export function addOnboardingCelebration(settings: GuidedTourSettings, milestoneId: OnboardingMilestoneId) {
	const next = normalizeGuidedTourSettings(settings);
	const celebratedMilestones = new Set(next.onboarding.celebratedMilestones);
	celebratedMilestones.add(milestoneId);
	return normalizeGuidedTourSettings({
		...next,
		onboarding: {
			...next.onboarding,
			celebratedMilestones: Array.from(celebratedMilestones)
		}
	});
}

export function mergeOnboardingState(settings: GuidedTourSettings, patch: Partial<OnboardingState>) {
	const next = normalizeGuidedTourSettings(settings);
	return normalizeGuidedTourSettings({
		...next,
		onboarding: {
			...next.onboarding,
			...patch
		}
	});
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
	await sql`
		create table if not exists user_recommendation_feedback (
			user_id uuid not null references app_user(id) on delete cascade,
			book_id bigint not null references book(id) on delete cascade,
			feedback text not null,
			source text not null default '',
			reason text not null default '',
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			primary key (user_id, book_id)
		)
	`;
	await sql`
		create table if not exists user_follow (
			follower_user_id uuid not null references app_user(id) on delete cascade,
			following_user_id uuid not null references app_user(id) on delete cascade,
			created_at timestamptz not null default now(),
			primary key (follower_user_id, following_user_id)
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
			follows: number;
			recommendation_interactions: number;
			has_reading_goal: boolean;
		}>>`
			select
				(select count(*)::int from user_book where user_id = ${userId}::uuid) as total_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and status = 'reading') as reading_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and status = 'finished') as finished_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and rating is not null) as rated_books,
				(select count(*)::int from user_book where user_id = ${userId}::uuid and char_length(trim(coalesce(finished_reflection, ''))) > 0) as reviews,
				(select count(*)::int from user_reading_progress_event where user_id = ${userId}::uuid) as progress_events,
				(select count(*)::int from reading_journal_note where user_id = ${userId}::uuid) as journal_entries,
				(select count(*)::int from user_follow where follower_user_id = ${userId}::uuid) as follows,
				(select count(*)::int from user_recommendation_feedback where user_id = ${userId}::uuid) as recommendation_interactions,
				exists (
					select 1
					from app_user
					where id = ${userId}::uuid
						and char_length(trim(coalesce(profile_data->>'readingGoal', ''))) > 0
				) as has_reading_goal
		`
	]);
	const stats = statsRows[0] || {};
	const settings = normalizeGuidedTourSettings(settingsRows[0]?.guided_tour);
	const completedActions = new Set(settings.onboarding.completedActions);
	if (Number(stats.total_books || 0) > 0) completedActions.add("first-book-added");
	if (Number(stats.progress_events || 0) > 0) completedActions.add("first-progress-update");
	if (Number(stats.journal_entries || 0) > 0) completedActions.add("first-journal-entry");
	if (Number(stats.reviews || 0) > 0) completedActions.add("first-review");
	if (Number(stats.follows || 0) > 0) completedActions.add("first-follow");
	if (Number(stats.recommendation_interactions || 0) > 0) completedActions.add("first-recommendation-interaction");
	return {
		settings: normalizeGuidedTourSettings({
			...settings,
			onboarding: {
				...settings.onboarding,
				completedActions: Array.from(completedActions)
			}
		}),
		stats: {
			totalBooks: Math.max(0, Number(stats.total_books || 0)),
			readingBooks: Math.max(0, Number(stats.reading_books || 0)),
			finishedBooks: Math.max(0, Number(stats.finished_books || 0)),
			ratedBooks: Math.max(0, Number(stats.rated_books || 0)),
			reviews: Math.max(0, Number(stats.reviews || 0)),
			progressEvents: Math.max(0, Number(stats.progress_events || 0)),
			journalEntries: Math.max(0, Number(stats.journal_entries || 0)),
			follows: Math.max(0, Number(stats.follows || 0)),
			recommendationInteractions: Math.max(0, Number(stats.recommendation_interactions || 0)),
			hasReadingGoal: stats.has_reading_goal === true
		}
	};
}
