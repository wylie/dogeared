# DogEared Reading Progress Performance Report

Date: 2026-08-08

Scope: Profile reading-progress saves only. Shelf mutations are covered by `docs/shelf-mutation-performance-report.md`; search is covered by `docs/search-performance-report.md`.

## Goal

Saving reading progress should feel fast, keep the current card layout stable, and update related momentum and streak state without a full refresh.

## Critical Path Classification

Must complete before response:

- Session validation and request validation.
- Verify the existing `user_book` row belongs to the current reader and is `Currently Reading`.
- Update `user_book.current_page`, `total_pages`, `preferred_progress_type`, and `updated_at`.
- Insert `user_reading_progress_event` when the save moves forward.
- Run milestone checks for forward progress, including idempotent achievement awards and notification creation when a milestone is actually earned.
- Load the authoritative reading summary used by the UI for current progress, momentum, streak, and guidance text.

Safe to run afterward:

- Analytics.
- Recommendation recalculation.
- Broader aggregate refreshes.
- Unrelated profile statistics.

Not deferred in this pass:

- Reading history writes, streak/momentum source data, and milestone checks. DogEared does not currently have a durable background queue, so these stay on the correctness path.

## Architecture Changes

- Added `/api/reading/progress` for non-finish progress saves on existing DogEared `Currently Reading` books.
- The new endpoint reuses the existing `book` and `user_book` IDs. It does not invoke shelf mutation, external metadata lookup, cover enrichment, canonical Work resolution, custom-shelf reconciliation, or profile partial refreshes.
- Progress update and forward-progress event insert run inside a transaction.
- The endpoint returns the minimum authoritative UI payload: saved progress, selected progress type, current pages/percentage, momentum score, reading streak, guidance text, and the existing reading summary shape.
- The profile progress save branch applies that summary directly with `applyAuthoritativeReadingSummary(...)` and broadcasts the existing `dogeared:reading-data-changed` signal for other tabs.
- Focus/visibility/storage/BroadcastChannel revalidation remains in place for cross-device freshness, without adding polling.
- Reading progress schema setup is memoized per server instance and now includes `idx_progress_event_user_book` for user/book progress-history lookups.
- Milestone notification checks no longer run notification-table DDL or username lookup unless an achievement is actually awarded.

## Before And After Timings

Measured locally against the dev server with an authenticated test reader and existing DogEared book `Project Hail Mary` (`book_id=488`, 497 pages).

Before is the previous composite UI path:

`POST /api/shelf/entries` -> `GET /api/shelf/entries` -> `GET /api/reading/summary` -> profile partial refresh.

After is the new progress path:

`POST /api/reading/progress`, with the UI applying the returned progress and summary directly.

| Flow | Before | After | Change |
| --- | ---: | ---: | ---: |
| First progress entry on a book | 3,965 ms | 531.0 ms | 7.5x faster |
| Page number save | 2,694 ms | 279.0 ms | 9.7x faster |
| Percentage save | 2,756 ms | 277.1 ms | 9.9x faster |
| Chapter save | 2,792 ms | 182.5 ms | 15.3x faster |
| Audiobook time save | 2,702 ms | 290.7 ms | 9.3x faster |
| Repeated progress update | 1,893 ms | 146.7 ms | 12.9x faster |

One cold first request after adding the new schema/index path measured 988.8 ms because it paid one-time schema/index setup. Warmed steady-state timings above are the user-visible expectation after the first server-instance setup.

## Latency Breakdown

Before:

- Forward progress saves spent about 1.1s in `POST /api/shelf/entries`.
- The largest server sub-step was `reading_milestone_notifications`, usually completing around 1.06s to 1.11s.
- The UI then waited on shelf hydration, reading summary fetch, and profile partial refresh. The profile partial refresh alone took about 1.27s to 1.69s.
- Repeated no-delta saves had a faster shelf POST, about 185 ms, but still paid the broad follow-up refresh cost and landed around 1.9s total.

After:

- Forward progress saves usually complete in about 180 ms to 291 ms.
- A repeated no-delta save skips milestone checks and completed in 146.7 ms.
- Steady-state server stage timings show required DB update/history work around 108 ms to 199 ms, milestone checks adding about 34 ms when forward progress is recorded, and summary reload completing the response.
- First-entry timing was higher in the warmed run because the empty-history path and database variability put `existing_progress_loaded` and `summary_loaded` higher than other cases; it still avoided the previous 3.9s composite path.

## Validation Notes

- Progress saves update UI only after server success, so failed requests leave prior card state intact.
- The Save button still enters `Saving...`, is disabled during the request, and the card keeps `aria-busy` without layout shift.
- Repeated equal-page saves update `preferred_progress_type` and `updated_at` but do not create another progress event.
- Forward progress creates one progress event per successful save.
- Achievements remain idempotent through `awardAchievement`, so duplicate achievements and notifications are guarded.
- The Journal prompt still appears after forward progress and attaches outside the BookCard layout.
- Existing focus, visibility, storage-event, and BroadcastChannel revalidation paths remain for another tab/device to refresh stale momentum and streak data.
