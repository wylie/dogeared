# DogEared Page Rendering and Internal Navigation Performance Report

Date: 2026-08-08

Scope: Shared layout, internal navigation, and representative SSR routes. Search, shelf mutations, and reading-progress saves are covered by their own reports.

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
