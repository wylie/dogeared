# DogEared Page Rendering and Internal Navigation Performance Report

Date: 2026-08-08

Scope: Shared layout, internal navigation, and representative SSR routes. Search, shelf mutations, and reading-progress saves are covered by their own reports.

## 2026-08-08 Route Skeleton and Feedback Pass

Production Admin Performance showed Profile and detail routes still take long enough that click-to-response perception matters even when the backend is correct. The most recent sampled route render telemetry before this pass was:

| Operation | Count | p50 | p95 |
| --- | ---: | ---: | ---: |
| `page.profile` | 45 | 1029 ms | 1785 ms |
| `page.author-detail` | 26 | 457 ms | 1638 ms |
| `page.book-detail` | 25 | 236 ms | 1275 ms |
| `page.discover` | 12 | 113 ms | 271 ms |
| `page.reading-life` | 1 | 2 ms | 2 ms |

Changes in this pass:

- The shared layout starts route feedback on same-origin link clicks and GET form submits, then synchronizes with Astro client-router lifecycle events.
- The top navigation progress indicator appears after 75 ms for slow swaps; route-level skeletons appear after 140 ms to avoid flashes on fast navigations.
- Destination-shaped skeletons cover Search, Profile, My Reading Life, Book Detail, Author Detail, Discover/Books, Following, Notifications, Journal, and generic pages while keeping the persistent shell visible.
- Skeletons set `aria-busy` on `main`, announce loading through a polite live region, and disable animation for reduced-motion readers.
- Slow swaps replace the skeleton with a stable "taking longer than expected" state after 15 seconds instead of leaving an indefinite blank placeholder.
- Search now appends delayed skeleton BookCard placeholders only for the asynchronous external-provider phase; local DogEared results still render first and stale provider work still aborts/clears placeholders.
- Admin Performance now records `navigation.feedback` with sanitized route patterns and spans for "navigation start to skeleton visible" and "navigation start to content swap."

Targets for the next production review:

| Metric | Target |
| --- | ---: |
| Navigation start -> visible feedback | <= 120 ms p95 |
| Navigation start -> route skeleton visible, when needed | <= 200 ms p95 |
| Navigation start -> content swap | Track by route, not a single global target |

Measurement note: this pass changes perceived latency and adds production telemetry for it. Backend route-render targets remain owned by the SSR optimization work below; skeletons must not be treated as a substitute for making slow routes faster.

## 2026-08-08 Telemetry-Guided Page Render Pass

Admin Performance showed recent page telemetry near the 900 ms range before this pass, with `page.book-detail` at 910 ms and `page.profile` at 780 ms in the sampled last-24-hour data. The dominant spans were Book Detail catalog related/related-content loads and Profile section loading.

Changes in this pass:

- Profile reuses `resolvePublicProfileBundle` profile data instead of querying `app_user.profile_data` again during the same request.
- Profile now memoizes render-path index readiness for `user_book(user_id, status, updated_at desc)`, finished-book ordering, activity ordering, and custom shelf ordering.
- Profile Want to Read loads a bounded render window for the requested page while retaining authoritative shelf counts from `resolvePublicShelfSummary`.
- Book Detail batches optional catalog reads for editions, genres, topics, activity, and reviews with `Promise.all()` after the authoritative catalog lookup.
- Author Detail runs schema setup, viewer status/counts, Open Library bio, collection lookup, and external book lookup concurrently where independent.

Measured after changes against the local dev server on 2026-08-08. First-hit dev-server/index warmups are excluded from the steady-state numbers.

| Route | Before signal | After median | After p95-ish sample | Target | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Profile, shelf-heavy (`/profile/wylie`) | ~780 ms sampled telemetry | 1.09 s | 1.26 s | <500 ms | Still slow |
| Profile, sparse (`/profile/randnumreads`) | ~780 ms sampled telemetry | 989 ms | 1.02 s | <500 ms | Still slow |
| Book Detail (`/book?bookId=536`) | 910 ms sampled telemetry | 329 ms | 342 ms | <600 ms | Met |
| Author Detail (`/author/samantha-harvey`) | ~900 ms route class | 301 ms | 320 ms | <600 ms | Met |
| Discover (`/discover`) | ~900 ms route class | 123 ms | 213 ms | <500 ms | Met |

Remaining profile bottleneck: even after avoiding the duplicate profile lookup, bounding Want to Read payloads, and installing the missing compound indexes, Profile section loading remains roughly 800-950 ms in local telemetry. The remaining likely cost is correctness-sensitive shelf/profile aggregation, especially finished-book canonicalization, reviews, reading goal counts, and reading summary work. That should be optimized with dedicated paginated/counted profile shelf loaders so canonical Work dedupe, review ordering, and reading-goal counts stay authoritative.

## Changes Made

- Added Astro `ClientRouter` in the shared layout so same-origin internal links and GET forms can use progressive client-side navigation while direct URL loads remain server-rendered.
- Added a small delayed top navigation progress bar for route swaps that take longer than a quick transition. There is no global spinner and the page layout stays stable.
- Preserved request-scoped auth reuse through the existing `resolveUserBySession` WeakMap cache and avoided global caching of user-specific sidebar state.
- Memoized idempotent schema readiness work for reading journal, notifications, reviews, reading life, follow tables, and feed interaction tables. Failed setup resets the memoized promise.
- Parallelized independent route reads on Journal, Notifications, Following, Book Detail, and Author Detail.
- Changed Authors from loading every author into memory for filtering/sorting to SQL pagination for the requested page, with an out-of-range fallback that preserves clamped pagination behavior.
- Removed one extra Work lookup from Book Detail by carrying `book.work_id` out of the primary book query.
- Moved Book Detail known-series maintenance upsert off the response critical path.
- Bounded and cached optional Author Detail Open Library calls. Local DogEared author/book data renders first; public external metadata uses normalized public cache keys and short timeouts.

## Before/After Timings

Measured against the local dev server with the same authenticated reader session. Times are full HTTP response timings from Node `fetch`; server log timings were also checked for warm runs.

| Route / navigation proxy | Before | After | Change |
| --- | ---: | ---: | ---: |
| Profile -> My Reading Life (`/reading-life`) | 425.6 ms | 212.6 ms | 50.0% faster |
| Profile -> Book Detail (`/book?bookId=488`) | 1510.1 ms warm | 872.2 ms | 42.2% faster |
| Search -> Book Detail (`/book?bookId=488`) | 1510.1 ms warm | 872.2 ms | 42.2% faster |
| Book Detail -> Author Detail (`/author/andy-weir`) | 962.6 ms warm | 508.8 ms | 47.1% faster |
| Authors pagination (`/authors?page=2`) | 154.5 ms | 133.0 ms warm | 13.9% faster |
| Following (`/following`) | 369.1 ms | 256.5 ms | 30.5% faster |

Other warm route checks:

- Notifications: 1864.0 ms before, 116.1 ms after.
- Reading Journal: 865.6 ms before, 226.1 ms after.
- Discover: 734.6 ms before, 291.0 ms after.
- Search page: 483.9 ms before, 349.0 ms after.

Profile remains the slowest representative route at about 1.8 s warm after this pass. It was not the focus of the largest edits because the biggest Profile costs are page-specific profile/shelf aggregation work rather than shared layout duplication.

## Validation Notes

- Direct URL loads remain SSR routes.
- Same-origin links/forms are progressively enhanced by Astro client navigation and keep browser history behavior.
- Notification badge state remains user-specific and client-refreshed through the existing count endpoint.
- Public external Author Detail caches are keyed by normalized author plus local book IDs and do not contain user-specific shelf state.

## 2026-08-09 Author Detail Telemetry Follow-up

Production Admin Performance for `/author/[slug]` showed about 38 recent `page.author-detail` samples: p50 512.7 ms, p95 1,579.3 ms, p99 1,830.5 ms, and 0% errors. The user-provided production sample was p50 about 457 ms, p95 about 1.64 s, and p99 about 1.84 s across about 26 samples.

The old Author Detail telemetry used cumulative stage marks, so the apparent `viewer status loaded` span hid multiple independent operations. Slow request waterfalls showed three contributors:

| Span / stage | Slow sample signal | Finding |
| --- | ---: | --- |
| `schema ready` | up to 1,005.6 ms | Read-only Author renders were still awaiting canonical Work and Series schema/backfill readiness. |
| `local books loaded` | up to 1,308.1 ms | One broad query combined author matching, shelf counts, readers, ratings, genres, and per-row Series resolution. |
| `viewer status loaded` | up to 762.3 ms | This coarse stage also waited for author counts, shelf state, collections, Open Library bio, and external missing-book discovery. |

Changes in this pass:

- Replaced cumulative Author Detail stage marks with real timing spans and relative `startMs` offsets for request waterfalls.
- Removed canonical Work and Series schema/backfill setup from the read-only Author Detail render path.
- Kept canonical Work/Edition reuse by reading stored `book.work_id`, `book_work`, and `series_book` relationships; Author Detail does not run search-style canonical matching while rendering.
- Split the broad local book query into a narrow DogEared Work row query plus batched Series lookup, ratings/shelf aggregation, genre aggregation, author metadata counts, editorial collections, and current-reader shelf state.
- Used `book.author_id` when the canonical author row exists, with normalized `primary_author` matching retained only as the fallback for slugs without an author record.
- Changed optional Open Library bio/photo and "not yet in DogEared" discovery to cache-only SSR reads with background warming on misses, so provider latency no longer blocks the initial Author page.
- Added a read-only `loadCollectionsForAuthor(..., { ensureSchema: false })` path so Author Detail does not run collection DDL/index setup on GET.

Post-change local route timings against the Astro dev server, excluding the first HMR/cold request:

| Route | Samples | Median | Max warm sample |
| --- | ---: | ---: | ---: |
| `/author/sarah-j-maas` | 4 warm | 137.2 ms | 220.0 ms |
| `/author/tui-t-sutherland` | 5 | 138.9 ms | 253.7 ms |
| `/author/arthur-conan-doyle` | 5 | 129.6 ms | 219.4 ms |
| `/author/samantha-harvey` | 5 | 192.0 ms | 209.4 ms |

Latest local `page.author-detail` telemetry after the collections change showed totals from 113.6 ms to 198.3 ms for sampled warm requests. Typical spans were author lookup 34-105 ms, DogEared Works 33-38 ms, Series lookup 39-106 ms, ratings aggregation 38-45 ms, genre aggregation 37-45 ms, editorial collections 39-106 ms, and BookCard preparation about 1 ms. External discovery recorded 0-3 ms because SSR only reads cache and schedules background warming when data is absent.

Production p95 should be rechecked after deployment and traffic. The expected p95 improvement comes from eliminating external-provider waits, render-path schema/backfill readiness, and per-row lateral aggregation from the Author Detail critical path.
- Browser automation setup was attempted, but the in-app browser connector failed with a tool-side sandbox metadata error before interaction. Manual browser verification was therefore not completed in this run.

## Commands

- `npm test`
- `node --test --experimental-strip-types tests/performance-interactions.test.ts`
- `npm run build`

No `format` or `lint` script is defined in `package.json`; those requested validations could not be run as separate commands.
