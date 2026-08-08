# DogEared Page Rendering and Internal Navigation Performance Report

Date: 2026-08-08

Scope: Shared layout, internal navigation, and representative SSR routes. Search, shelf mutations, and reading-progress saves are covered by their own reports.

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
- Browser automation setup was attempted, but the in-app browser connector failed with a tool-side sandbox metadata error before interaction. Manual browser verification was therefore not completed in this run.

## Commands

- `npm test`
- `node --test --experimental-strip-types tests/performance-interactions.test.ts`
- `npm run build`

No `format` or `lint` script is defined in `package.json`; those requested validations could not be run as separate commands.
