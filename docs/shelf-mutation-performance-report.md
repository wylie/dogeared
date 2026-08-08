# DogEared Shelf Mutation Performance Report

Date: 2026-08-08

Scope: ShelfButton/default shelf mutations only. Search behavior is covered by `docs/search-performance-report.md`.

## Goal

Adding, moving, and removing a book from shelves should feel immediate without weakening canonical Work resolution, Edition relationships, activity correctness, or duplicate prevention.

## Architecture Changes

- Existing DogEared catalog saves now resolve the representative book, Work, and Edition with a local catalog query before enrichment.
- Existing-Work shelf saves skip external metadata lookup, author enrichment, cover enrichment, genre inference, series cleanup, catalog source upserts, and redundant canonical resolver work before returning success.
- Import-style saves without a known `bookId` still use the canonical Work resolver and catalog upsert path.
- Shelf and custom-shelf schema setup is memoized per server instance instead of paying repeated DDL checks on every mutation.
- Required follow-up writes that do not depend on each other are issued concurrently and awaited: custom-shelf cleanup, status activity, rating activity, and reading progress events.
- The response is built from the authoritative mutation inputs and known catalog row instead of reloading the just-written shelf entry with an aggregate query.
- Reading milestone notification checks remain awaited because DogEared does not currently have a durable background queue for that correctness-sensitive work.

## Before And After Timings

Measured locally against the dev server with an authenticated test reader and existing DogEared book `Project Hail Mary` (`book_id=488`).

| Flow | Before | After | Change |
| --- | ---: | ---: | ---: |
| Add to Want to Read | 43,502.7 ms | 376.7 ms | 115.5x faster |
| Move to Currently Reading | 2,278.8 ms | 1,311.3 ms | 42% faster |
| Mark Read | 2,462.7 ms | 1,277.6 ms | 48% faster |
| Remove from shelves | 808.8 ms | 90.3 ms | 89% faster |
| Repeat identical Want to Read | not recorded | 196.3 ms | fast idempotent path |
| External-style import save | not optimized target | 4,963.0 ms | still canonical resolver path |
| Move to DNF | not applicable | not applicable | DNF is not a persisted shelf API status |

## Latency Breakdown

Before:

- Add to Want to Read was dominated by canonical schema/resolution/catalog work: `canonical_resolution_complete` at 42,880.8 ms and `catalog_writes_complete` at 43,218.2 ms.
- Move to Currently Reading spent about 690.6 ms reaching canonical resolution, 1,105.9 ms reaching catalog writes, and 2,224.5 ms reaching follow-up completion.
- Mark Read spent about 802.2 ms reaching canonical resolution, 1,134.9 ms reaching catalog writes, and 2,413.4 ms reaching follow-up completion.

After:

- Add to Want to Read reached `existing_catalog_ready` at 211.9 ms, reused the catalog at 253.1 ms, completed the user shelf write at 315.7 ms, and returned at 367.3 ms server time.
- Move to Currently Reading reached `existing_catalog_ready` at 72.1 ms, completed the user shelf write at 150.4 ms, completed required follow-up writes at 370.4 ms, and returned after milestone notifications at 1,298.8 ms server time.
- Mark Read reached `existing_catalog_ready` at 77.7 ms, completed the user shelf write at 148.3 ms, completed required follow-up writes at 286.4 ms, and returned after milestone notifications at 1,263.1 ms server time.
- Remove from shelves returned in 76 ms server time on the warmed direct-book path.

## Validation Notes

- Existing Work path avoids external API calls by using `resolveExistingShelfCatalogBook` and gating metadata enrichment on `!hasExistingCatalogBook && directBookId <= 0`.
- External/import-style saves still work and continue through canonical Work resolution.
- Rapid repeated clicks are guarded in the client by the existing busy state and in-flight mutation coalescing.
- Failed client requests do not commit success locally; shelf state is updated only after a successful server response.
- Activity duplication remains guarded by the previous-status check; the duplicate finished-activity regression test still passes.
- Shelf counts are updated through the same shelf mutation notifications as before; no full-page cache busting was added.
