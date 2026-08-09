import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { monitorEvent } from "../../../lib/monitoring";
import { getNeonSql } from "../../../lib/neon";
import { createReadingMilestoneNotifications } from "../../../lib/notifications";
import {
	ensureReadingProgressEventSchema,
	loadReaderReadingSummary
} from "../../../lib/readingSummary";
import { normalizeProgressInputMode, type ProgressInputMode } from "../../../lib/readingProgress";
import { normalizeReadingFormat, type ReadingFormat } from "../../../lib/readingFormats";
import { recordPerformanceEventSafe } from "../../../lib/performanceTelemetry";

export const prerender = false;

type ExistingProgressRow = {
	book_id: number;
	title: string;
	primary_author: string;
	current_page: number;
	total_pages: number;
	book_page_count: number;
	preferred_progress_type: string;
	reading_format: string;
	progress_updates: number;
};

type UpdatedProgressRow = {
	book_id: number;
	current_page: number;
	total_pages: number;
	preferred_progress_type: string;
	reading_format: string;
	updated_at: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store"
		}
	});
}

function normalizePositiveInt(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function markPerf(
	startedAt: number,
	stages: Record<string, number>,
	stage: string
) {
	stages[stage] = Math.round((performance.now() - startedAt) * 10) / 10;
	return stage;
}

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now();
	const stages: Record<string, number> = {};
	let debugStage = "start";
	let bookId = 0;
	const recordProgressPerformance = (
		success: boolean,
		httpStatus: number,
		metadata: Record<string, unknown> = {}
	) => {
		recordPerformanceEventSafe({
			operationName: "progress.save",
			route: "/api/reading/progress",
			totalMs: performance.now() - startedAt,
			success,
			httpStatus,
			spans: stages,
			metadata: {
				stage: debugStage,
				hasBookId: bookId > 0,
				...metadata
			}
		});
	};
	try {
		const sql = getNeonSql();
		await ensureReadingProgressEventSchema(sql);
		const session = await resolveUserBySession(request);
		const body = await request.json().catch(() => ({}));
		debugStage = markPerf(startedAt, stages, "schema_session_body");
		if (!session?.userId) {
			recordProgressPerformance(false, 401);
			return jsonResponse({ error: "You must be logged in to save reading progress." }, 401);
		}
		if (!body || typeof body !== "object") {
			recordProgressPerformance(false, 400);
			return jsonResponse({ error: "Invalid progress payload." }, 400);
		}
		const input = body as Record<string, unknown>;
		bookId = normalizePositiveInt(input.bookId);
		const requestedCurrentPage = normalizePositiveInt(input.currentPage);
		const requestedTotalPages = normalizePositiveInt(input.totalPages);
		const preferredProgressType: ProgressInputMode = normalizeProgressInputMode(
			input.preferredProgressType || input.progressType
		);
		const requestedReadingFormat: ReadingFormat = normalizeReadingFormat(input.readingFormat);
		if (bookId <= 0) {
			recordProgressPerformance(false, 400);
			return jsonResponse({ error: "Missing book id." }, 400);
		}

		const existingRows = await sql<ExistingProgressRow[]>`
			select
				b.id as book_id,
				b.title,
				b.primary_author,
				coalesce(ub.current_page, 0)::int as current_page,
				coalesce(ub.total_pages, 0)::int as total_pages,
				coalesce(b.page_count, 0)::int as book_page_count,
				coalesce(nullif(trim(ub.preferred_progress_type), ''), 'page') as preferred_progress_type,
				coalesce(nullif(trim(ub.reading_format), ''), 'unknown') as reading_format,
				coalesce(pe.progress_updates, 0)::int as progress_updates
			from user_book ub
			join book b on b.id = ub.book_id
			left join lateral (
				select count(*)::int as progress_updates
				from user_reading_progress_event pe
				where pe.user_id = ub.user_id
					and pe.book_id = ub.book_id
			) pe on true
			where ub.user_id = ${session.userId}::uuid
				and ub.book_id = ${bookId}
				and ub.status = 'reading'
			limit 1
		`;
		debugStage = markPerf(startedAt, stages, "existing_progress_loaded");
		const existing = existingRows[0];
		if (!existing?.book_id) {
			recordProgressPerformance(false, 404);
			return jsonResponse({ error: "This book is not currently being tracked for reading progress." }, 404);
		}

		const previousCurrentPage = normalizePositiveInt(existing.current_page);
		const effectiveTotalPages = Math.max(
			normalizePositiveInt(existing.total_pages),
			normalizePositiveInt(existing.book_page_count),
			requestedTotalPages
		);
		const nextCurrentPage = effectiveTotalPages > 0
			? Math.min(requestedCurrentPage, effectiveTotalPages)
			: requestedCurrentPage;
		const pageDelta = Math.max(0, nextCurrentPage - previousCurrentPage);
		let updatedRows: UpdatedProgressRow[] = [];
		let progressEventRecorded = false;
		if (pageDelta > 0) {
			const results = await sql.transaction((tx) => [
				tx<UpdatedProgressRow[]>`
					update user_book
					set
						current_page = ${nextCurrentPage},
						total_pages = ${effectiveTotalPages},
						preferred_progress_type = ${preferredProgressType},
						reading_format = case
							when ${requestedReadingFormat}::text in ('physical', 'ebook', 'audio') then ${requestedReadingFormat}::text
							else reading_format
						end,
						updated_at = now()
					where user_id = ${session.userId}::uuid
						and book_id = ${bookId}
						and status = 'reading'
					returning
						book_id,
						current_page,
						total_pages,
						coalesce(nullif(trim(preferred_progress_type), ''), 'page') as preferred_progress_type,
						coalesce(nullif(trim(reading_format), ''), 'unknown') as reading_format,
						updated_at::text as updated_at
				`,
				tx<Array<{ id: number }>>`
					insert into user_reading_progress_event (
						user_id,
						book_id,
						from_page,
						to_page,
						page_delta,
						recorded_at
					)
					values (
						${session.userId}::uuid,
						${bookId},
						${previousCurrentPage},
						${nextCurrentPage},
						${pageDelta},
						now()
					)
					returning id
				`
			]);
			updatedRows = (results[0] || []) as UpdatedProgressRow[];
			progressEventRecorded = Boolean(((results[1] || []) as Array<{ id: number }>)[0]?.id);
		} else {
			const results = await sql.transaction((tx) => [
				tx<UpdatedProgressRow[]>`
					update user_book
					set
						current_page = ${nextCurrentPage},
						total_pages = ${effectiveTotalPages},
						preferred_progress_type = ${preferredProgressType},
						reading_format = case
							when ${requestedReadingFormat}::text in ('physical', 'ebook', 'audio') then ${requestedReadingFormat}::text
							else reading_format
						end,
						updated_at = now()
					where user_id = ${session.userId}::uuid
						and book_id = ${bookId}
						and status = 'reading'
					returning
						book_id,
						current_page,
						total_pages,
						coalesce(nullif(trim(preferred_progress_type), ''), 'page') as preferred_progress_type,
						coalesce(nullif(trim(reading_format), ''), 'unknown') as reading_format,
						updated_at::text as updated_at
				`
			]);
			updatedRows = (results[0] || []) as UpdatedProgressRow[];
		}
		debugStage = markPerf(startedAt, stages, "progress_saved");
		const updated = updatedRows[0];
		if (!updated?.book_id) {
			recordProgressPerformance(false, 409, { pageDelta, progressEventRecorded });
			return jsonResponse({ error: "Unable to save reading progress." }, 409);
		}

		if (progressEventRecorded) {
			await createReadingMilestoneNotifications(sql, session.userId, {
				status: "reading",
				bookId,
				title: existing.title
			});
		}
		debugStage = markPerf(startedAt, stages, "milestones_complete");
		const summary = await loadReaderReadingSummary(sql, session.userId);
		debugStage = markPerf(startedAt, stages, "summary_loaded");
		const totalPages = normalizePositiveInt(updated.total_pages);
		const currentPage = normalizePositiveInt(updated.current_page);
		const percent = totalPages > 0
			? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)))
			: 0;
		const progressUpdates = normalizePositiveInt(existing.progress_updates) + (progressEventRecorded ? 1 : 0);
		monitorEvent("reading.progress.save.success", {
			userId: session.userId,
			bookId,
			pageDelta,
			progressEventRecorded
		});
		if (import.meta.env.DEV) {
			console.info("[perf.reading.progress]", {
				outcome: "success",
				stage: debugStage,
				totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
				stages,
				bookId,
				pageDelta
			});
		}
		recordProgressPerformance(true, 200, { pageDelta, progressEventRecorded });
		return jsonResponse({
			ok: true,
			progress: {
				bookId,
				title: existing.title,
				author: existing.primary_author,
				currentPage,
				totalPages,
				percent,
				preferredProgressType: normalizeProgressInputMode(updated.preferred_progress_type),
				selectedProgressType: normalizeProgressInputMode(updated.preferred_progress_type),
				readingFormat: normalizeReadingFormat(updated.reading_format || existing.reading_format),
				updatedAt: updated.updated_at,
				previousCurrentPage,
				progressUpdates,
				progressEventRecorded
			},
			momentumScore: summary.momentumScore,
			readingStreakDays: summary.readingStreakDays,
			guidanceText: summary.momentumNextAction,
			summary
		});
	} catch (error) {
		if (import.meta.env.DEV) {
			console.error("[perf.reading.progress]", {
				outcome: "error",
				stage: debugStage,
				totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
				stages,
				bookId,
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
		recordProgressPerformance(false, 500);
		return jsonResponse({
			error: "Failed to save reading progress.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
};
