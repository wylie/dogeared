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
- The 2026-08-08 follow-up optimization collapses the previous-state read and `user_book` upsert into one authoritative CTE that returns the persisted shelf row used by the response.
- The same pass collapses custom-shelf cleanup, status activity, rating activity, and reading progress-event creation into one awaited SQL statement instead of multiple independent round trips.
- Finish-only shelf mutations still run required finished-book milestone checks, but they skip reading-streak milestone work unless the mutation records new forward page progress.

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

## 2026-08-08 Telemetry Follow-Up

Admin Performance showed `shelf.mutate` around 530 ms before this pass. The follow-up pass targeted the warmed existing-DogEared-Work path, which is the ShelfButton path readers hit most often.

Measured locally against the dev server with an authenticated test reader and existing DogEared book `Orbital` (`book_id=536`). The first add still pays occasional session/database warm-up cost, so the table includes the warm repeated path separately.

| Flow | Before current pass | After current pass | Dominant remaining step |
| --- | ---: | ---: | --- |
| Add to Want to Read | ~530 ms telemetry p95 | 239.6 ms warm, 664.9 ms cold | Session/catalog lookup on cold path; DB write on warm path |
| Repeat identical Want to Read | ~530 ms telemetry p95 | 239.6 ms | `user_book` authoritative upsert |
| Move to Currently Reading | ~530 ms telemetry p95 | 157.9 ms | Catalog lookup and authoritative follow-ups |
| Mark Read | ~530 ms telemetry p95 | 329.0 ms | Finished-book milestone notifications |
| Remove from shelves | ~530 ms telemetry p95 | 164.0 ms | Direct delete statement |

Persisted telemetry spans for the latest warm pass:

- Add to Want to Read: `schema session body` 40.6 ms, `existing catalog ready` 114.7 ms, `canonical resolution complete` 0.1 ms, `user book upsert complete` 44.5 ms, `authoritative followups complete` 39.1 ms.
- Move to Currently Reading: `schema session body` 39.1 ms, `existing catalog ready` 38.1 ms, `canonical resolution complete` 0.1 ms, `user book upsert complete` 41.6 ms, `authoritative followups complete` 38.6 ms.
- Mark Read: `schema session body` 38.2 ms, `existing catalog ready` 38.1 ms, `canonical resolution complete` 0.1 ms, `user book upsert complete` 40.0 ms, `authoritative followups complete` 45.2 ms, `notifications complete` 167.0 ms.
- Remove from shelves: `session loaded` 40.0 ms, direct removal 123.6 ms.

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
