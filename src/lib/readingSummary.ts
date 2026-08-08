import { resolveMomentumPrediction } from "./momentumPrediction.ts";
import { calculateReadingStreak } from "./readingLife.ts";
import { normalizeProgressInputMode, type ProgressInputMode } from "./readingProgress.ts";

export type ReadingSummaryCurrentBook = {
	bookId: number;
	title: string;
	author: string;
	authorId: number;
	thumbnail: string;
	language: string;
	isbn10: string;
	isbn13: string;
	googleBooksId: string;
	description: string;
	currentPage: number;
	totalPages: number;
	preferredProgressType: ProgressInputMode;
	updatedAt: string;
	firstAddedAt: string;
	progressUpdates: number;
	genres: string[];
};

export type ReadingSummaryMomentumBook = {
	bookId: number;
	title: string;
	currentPage: number;
	totalPages: number;
	percent: number;
	daysSinceUpdate: number;
	daysSinceStart: number;
	progressUpdateCount: number;
	finishProbability: number;
	confidence: number;
	healthLabel: string;
	healthTone: "good" | "neutral";
	predictionEligible: boolean;
	showOnboardingStatus: boolean;
	onboardingMessage: string;
	momentumMessage: string;
};

export type ReaderReadingSummary = {
	currentlyReading: ReadingSummaryCurrentBook[];
	momentumBooks: ReadingSummaryMomentumBook[];
	momentumScore: number;
	readingStreakDays: number;
	readingStreakDateKeys: string[];
	momentumNextAction: string;
};

type CurrentBookRow = {
	book_id: number;
	title: string;
	primary_author: string;
	author_id: number | null;
	cover_url: string;
	language: string;
	isbn10: string;
	isbn13: string;
	google_books_id: string;
	current_page: number;
	total_pages: number;
	preferred_progress_type: string;
	updated_at: string;
	first_added_at: string;
	progress_updates: number;
	genres: string[];
};

type ProgressDateRow = {
	activity_day: string;
};

let readingProgressSchemaReady: Promise<void> | null = null;

function toPositiveInt(value: unknown) {
	return Math.max(0, Number(value || 0) || 0);
}

function normalizeDateKey(value: unknown) {
	return String(value || "").trim().slice(0, 10);
}

function daysSince(value: unknown, now: Date) {
	const parsed = new Date(String(value || "").trim());
	if (!Number.isFinite(parsed.getTime())) return 999;
	const delta = now.getTime() - parsed.getTime();
	return Math.max(0, Math.floor(delta / (1000 * 60 * 60 * 24)));
}

export function buildReaderReadingSummary(input: {
	currentlyReading: ReadingSummaryCurrentBook[];
	progressDateKeys: string[];
	now?: Date;
}): ReaderReadingSummary {
	const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
	const readingStreakDateKeys = Array.from(new Set(
		(Array.isArray(input.progressDateKeys) ? input.progressDateKeys : [])
			.map(normalizeDateKey)
			.filter(Boolean)
	));
	const momentumBooks = input.currentlyReading.map((item) => {
		const totalPages = toPositiveInt(item.totalPages);
		const currentPage = toPositiveInt(item.currentPage);
		const percent = totalPages > 0 ? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100))) : 0;
		const daysSinceUpdate = daysSince(item.updatedAt, now);
		const daysSinceStart = daysSince(String(item.firstAddedAt || item.updatedAt), now);
		const progressUpdateCount = toPositiveInt(item.progressUpdates);
		const prediction = resolveMomentumPrediction({
			currentPage,
			totalPages,
			daysSinceUpdate,
			daysSinceStart,
			progressUpdateCount
		});
		return {
			bookId: item.bookId,
			title: item.title,
			currentPage,
			totalPages,
			percent,
			daysSinceUpdate,
			daysSinceStart,
			progressUpdateCount,
			finishProbability: prediction.finishProbability,
			confidence: prediction.confidence,
			healthLabel: prediction.label,
			healthTone: prediction.tone,
			predictionEligible: prediction.eligible,
			showOnboardingStatus: false,
			onboardingMessage: prediction.eligible ? "" : prediction.label,
			momentumMessage: prediction.message
		};
	});
	const firstOnboardingBook = momentumBooks
		.filter((item) => !item.predictionEligible)
		.sort((a, b) => a.daysSinceUpdate - b.daysSinceUpdate)[0];
	if (firstOnboardingBook) {
		const target = momentumBooks.find((item) => item.bookId === firstOnboardingBook.bookId);
		if (target) target.showOnboardingStatus = true;
	}
	const eligibleMomentumBooks = momentumBooks.filter((item) => item.predictionEligible);
	const momentumScore = eligibleMomentumBooks.length > 0
		? Math.round(eligibleMomentumBooks.reduce((sum, item) => sum + item.finishProbability, 0) / eligibleMomentumBooks.length)
		: 0;
	const mostAtRiskBook = eligibleMomentumBooks
		.filter((item) => item.healthLabel === "Reading momentum slowing")
		.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)[0];
	const bestOnTrackBook = eligibleMomentumBooks
		.slice()
		.sort((a, b) => b.finishProbability - a.finishProbability)[0];
	let momentumNextAction = "Add a few progress updates and DogEared will start estimating reading momentum.";
	if (mostAtRiskBook) {
		const catchupPages = Math.max(
			6,
			Math.min(24, Math.round((mostAtRiskBook.totalPages || 180) * 0.06))
		);
		momentumNextAction = `A short session of about ${catchupPages} pages in ${mostAtRiskBook.title} will rebuild momentum.`;
	} else if (bestOnTrackBook) {
		const nextMilestone = Math.min(100, Math.ceil(bestOnTrackBook.percent / 10) * 10);
		momentumNextAction = nextMilestone > bestOnTrackBook.percent
			? `Push ${bestOnTrackBook.title} to ${nextMilestone}% today.`
			: `Keep pace in ${bestOnTrackBook.title} today.`;
	}
	return {
		currentlyReading: input.currentlyReading,
		momentumBooks,
		momentumScore,
		readingStreakDays: calculateReadingStreak(readingStreakDateKeys, now),
		readingStreakDateKeys,
		momentumNextAction
	};
}

export async function ensureReadingProgressEventSchema(sql: ReturnType<typeof import("./neon.ts").getNeonSql>) {
	if (!readingProgressSchemaReady) {
		readingProgressSchemaReady = (async () => {
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
			await sql`create index if not exists idx_progress_event_user_recorded_at on user_reading_progress_event(user_id, recorded_at desc)`;
			await sql`create index if not exists idx_progress_event_user_book on user_reading_progress_event(user_id, book_id, recorded_at desc)`;
			await sql`alter table user_book add column if not exists preferred_progress_type text not null default 'page'`;
		})();
	}
	try {
		await readingProgressSchemaReady;
	} catch (error) {
		readingProgressSchemaReady = null;
		throw error;
	}
}

export async function loadReaderReadingSummary(
	sql: ReturnType<typeof import("./neon.ts").getNeonSql>,
	userId: string,
	options: { now?: Date } = {}
): Promise<ReaderReadingSummary> {
	await ensureReadingProgressEventSchema(sql);
	const [readingRows, progressDateRows] = await Promise.all([
		sql<CurrentBookRow[]>`
			select
				b.id as book_id,
				b.title,
				b.primary_author,
				b.author_id,
				b.cover_url,
				b.language,
				b.isbn10,
				b.isbn13,
				b.google_books_id,
				ub.current_page,
				coalesce(nullif(ub.total_pages, 0), nullif(b.page_count, 0), 0)::int as total_pages,
				coalesce(nullif(trim(ub.preferred_progress_type), ''), 'page') as preferred_progress_type,
				ub.updated_at::text as updated_at,
				coalesce(ub.first_added_at::text, ub.updated_at::text) as first_added_at,
				coalesce(pe.progress_updates, 0)::int as progress_updates,
				(
					select coalesce(array_agg(distinct bg.genre_name order by bg.genre_name) filter (where trim(coalesce(bg.genre_name, '')) <> ''), '{}')
					from book_genre bg where bg.book_id = b.id
				) as genres
			from user_book ub
			join book b on b.id = ub.book_id
			left join lateral (
				select count(*)::int as progress_updates
				from user_reading_progress_event pe
				where pe.user_id = ub.user_id
					and pe.book_id = ub.book_id
			) pe on true
			where ub.user_id = ${userId}::uuid
				and ub.status = 'reading'
			order by ub.updated_at desc
			limit 500
		`,
		sql<ProgressDateRow[]>`
			select distinct recorded_at::date::text as activity_day
			from user_reading_progress_event
			where user_id = ${userId}::uuid
			order by activity_day desc
			limit 120
		`
	]);
	const currentlyReading = readingRows.map((row) => ({
		bookId: toPositiveInt(row.book_id),
		title: String(row.title || "").trim(),
		author: String(row.primary_author || "").trim(),
		authorId: toPositiveInt(row.author_id),
		thumbnail: String(row.cover_url || "").trim(),
		language: String(row.language || "").trim(),
		isbn10: String(row.isbn10 || "").trim(),
		isbn13: String(row.isbn13 || "").trim(),
		googleBooksId: String(row.google_books_id || "").trim(),
		description: "",
		currentPage: toPositiveInt(row.current_page),
		totalPages: toPositiveInt(row.total_pages),
		preferredProgressType: normalizeProgressInputMode(row.preferred_progress_type),
		updatedAt: String(row.updated_at || "").trim(),
		firstAddedAt: String(row.first_added_at || row.updated_at || "").trim(),
		progressUpdates: toPositiveInt(row.progress_updates),
		genres: Array.isArray(row.genres) ? row.genres.map((genre) => String(genre || "").trim()).filter(Boolean) : []
	}));
	return buildReaderReadingSummary({
		currentlyReading,
		progressDateKeys: progressDateRows.map((row) => String(row.activity_day || "").trim()).filter(Boolean),
		now: options.now
	});
}
