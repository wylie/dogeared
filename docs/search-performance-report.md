# Search Performance Report

Date: 2026-08-08

Scope: `/api/books/search` and `/search` book search only.

## Architecture Changes

- Search now supports `mode=local`, `mode=external`, and compatible `mode=all` responses.
- `/search` requests DogEared catalog results first and progressively fetches external matches afterward.
- Known DogEared catalog results do not wait for Google Books, Open Library, provider enrichment, cover enrichment, or canonical resolver work.
- External Google Books and Open Library calls run concurrently from deduped normalized query variants. The browser now requests them as separate provider-scoped external searches so one provider can append matches without waiting for the other.
- External results still resolve through `resolveCanonicalCatalogWork` before rendering or shelf saves.
- Public search caches use normalized provider, query input, page, and page size. They do not include reader-specific shelf state.
- Client-side progressive search uses `AbortController` and request ids so stale responses are ignored.
- Search analytics are queued after the useful response path instead of blocking local results.
- Admin Performance receives named Search spans for local catalog search, Google Books, Open Library, metadata enrichment, canonical Work matching, result merge, and rendering preparation.
- Canonical resolver setup now checks whether any catalog rows actually need Work/Edition backfill before running the expensive idempotent backfill, preserving canonical matching while avoiding a cold-search backfill on already-normalized catalogs.
- External provider calls are bounded with a short timeout so one slow dependency cannot keep progressive search open indefinitely.
- Search no longer runs canonical Work backfill on the request path. External results still attempt canonical matching against existing Work/Edition data, but catalog maintenance/backfill is reserved for import, shelf, and maintenance paths.
- Search caps canonical matching candidates and applies a per-candidate timeout. If canonical matching times out, DogEared returns the external result as an unresolved partial result instead of waiting tens of seconds.
- Search propagates the incoming request abort signal into provider fetches so client-abandoned stale searches stop external work early where the runtime supports request cancellation.
- Search telemetry records local, provider, dedupe, canonical, merge, and rendering spans plus timeout counts, retry count, canonical candidate count, and resolved-canonical count so Admin Performance can explain slow outliers.

## Telemetry Optimization Timings

Measured against the local Astro dev server on `127.0.0.1:4321` after Admin Performance showed Search p95 around 3.0 s and External Book APIs p95 around 2.2 s.

| Scenario | Query | Before | After | Gain |
| --- | --- | ---: | ---: | ---: |
| Existing DogEared book, repeated local path | `Project Hail Mary` | 3.0 s Search p95 telemetry baseline | 21.0 ms API response | Local cache serves known Work immediately |
| Existing catalog exact title, uncached local key | `The Ministry of Time` | 3.0 s Search p95 telemetry baseline | 558.9 ms API response | Local result returns before any external work, but this path remains above the <300 ms target on first uncached dev-server request |
| Existing catalog exact title, repeated local key | `The Ministry of Time` | 3.0 s Search p95 telemetry baseline | 37.0 ms API response | Short-lived public local cache serves repeat |
| Partial title catalog match | `Wool` | 3.0 s Search p95 telemetry baseline | 318.0 ms API response, 193.1 ms server telemetry | DogEared result visible near target |
| Title + author catalog match | `The Ministry of Time Kaliane Bradley` | 3.0 s Search p95 telemetry baseline | 154.1 ms API response, 147.5 ms server telemetry | Existing Work found locally |
| No-results local phase | `ThisBookShouldNotExistXYZ12345` | 3.0 s Search p95 telemetry baseline | 248.0 ms API response, 240.0 ms server telemetry | Fast empty local handoff |
| External split, Open Library fresh | `Orbital Samantha Harvey fresh timeout` | 2.2 s External Book APIs p95 telemetry baseline | 1,054.6 ms API response | First external provider appears near 1 s |
| External split, Google Books fresh | `Orbital Samantha Harvey fresh timeout` | 2.2 s External Book APIs p95 telemetry baseline | 1,151.8 ms API response | Provider bounded under 1.8 s timeout |
| External repeated identical query | `North Woods Daniel Mason` | 2.2 s External Book APIs p95 telemetry baseline | 3.9-4.9 ms provider-scoped cache | Resolved external cache avoids repeat provider and resolver work |
| Rapid query change | `Project Hail Mary` -> `Wool` | Older combined external response could still be pending | stale request aborted; newer local result 219.4 ms | Older response prevented from replacing newer results |

Post-fix Admin Performance telemetry sampled after the canonical setup guard showed `search.books` p50 688.8 ms and p95 1,515.3 ms across fresh local/external measurements. External provider telemetry showed Open Library p95 858.7 ms and Google Books p95 763.8 ms. The pre-fix diagnostic spans captured the root cause: first external searches spent about 46-47 s in canonical Work matching because cold resolver setup reran canonical backfill; after the guard, fresh canonical Work matching measured 129.6 ms for Open Library and 976.8 ms for Google Books in the tested queries.

## Outlier Investigation

Production telemetry on 2026-08-08 showed Search p50 around 569 ms but p95/p99 around 45-48 s. The slow rows were not provider-bound: Google Books measured 689.3 ms and Open Library measured 1,054.7 ms. Both catastrophic search rows were dominated by `canonical Work matching`, at 46,818.2 ms and 46,487.7 ms respectively.

## 2026-08-08 Canonical Matching Pathology Fix

Follow-up production telemetry showed the original 45-48 s p99 class was reduced but not eliminated: `search.books` had p50 640 ms, p75 1,382 ms, p95 3,180 ms, and p99 47,537 ms over the latest 24-hour sample. Recent slow rows still showed `canonical Work matching` as the dominant span: 46,818.2 ms for Google Books and 46,487.7 ms for Open Library, while provider p95 was about 990-1,098 ms.

Measured cause: Search was invoking the shared `resolveCanonicalCatalogWork` once per external candidate. That resolver used one monolithic query containing broad `OR` branches and title/series `LIKE` fallbacks, then ran lateral Edition, source, shelf, and representative-book aggregation for every candidate row returned by that query. Even though Search capped external candidates to 24 and wrapped each resolver call in a 900 ms `Promise.race`, the underlying database work could continue after the timeout and still dominate the request. The worst case was not provider latency; it was search-time fuzzy catalog resolution doing import-level work.

Changes:

- Added `resolveCanonicalCatalogWorksForSearch`, a search-only batched canonical detector.
- Search now deduplicates provider results first, prepares normalized lookup identities once, and performs bounded batch lookups for stable provider identifiers, ISBNs, Edition keys, canonical Work keys, and exact series signals.
- Search no longer runs broad title `LIKE` fuzzy catalog scans during external-result rendering. If stable signals do not produce a bounded DogEared candidate set, the result remains an unresolved external result until the reader shelves/imports it.
- Candidate scoring now runs in memory over the bounded candidate set returned by batch lookup instead of comparing every external result against broad catalog slices.
- Search telemetry now records canonical child spans for candidate preparation, identifier matching, ISBN matching, edition lookup, normalized title matching, series matching, existing Work lookup, candidate scoring, and dedupe.
- Search telemetry metadata now records canonical DB query count, DogEared candidate count, candidate comparison count, cache hits/misses, and whether the candidate set was truncated.

Local canonical resolver measurements using the Neon client after the fix:

| Scenario | Total | DB queries | DogEared candidates | Comparisons | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Mixed batch: ISBN, Open Library ID, title+author, series, malformed metadata | 220.7 ms warm | 6 | 4 | 20 | Preserved direct and fallback detection without per-result resolver queries |
| Deliberately pathological 24 malformed candidates | 40.4 ms warm | 1 | 0 | 0 | No broad catalog scan; unresolved external candidates fail fast |

Before this pass, query count scaled with external candidates: up to one monolithic resolver query plus a representative-book query per matched candidate, so a 9-result Google Books response could trigger roughly 9-18 resolver queries and up to 720 candidate comparisons from `limit 80` per resolver call. After this pass, the same class of search uses a fixed set of bounded batch queries, with measured mixed-batch comparisons at 20 and pathological malformed comparisons at 0.

No speculative indexes were added. Existing indexes cover the stable lookup paths used by the batch detector, including `book.canonical_work_key`, `book.work_id`, `book_edition(work_id)`, `book_edition(book_id)`, and `book_source(source, source_work_id, source_edition_id)`. The fix removes the broad search-time query shape instead of trying to index unbounded fuzzy matching.

Degradation behavior: if batch canonical detection times out or finds no bounded candidate set, Search returns the external result without a local `bookId`. That avoids creating duplicate Works during Search; duplicate prevention remains authoritative when the reader shelves/imports the external book through the catalog write path.

Root cause: external Search called the shared canonical resolver, and the resolver's schema guard was still allowed to run canonical Work/Edition backfill before resolving. When any catalog row needed backfill, Search inherited the full catalog maintenance cost.

Fix:

- `ensureCanonicalWorkSchema` now separates schema readiness from backfill readiness.
- Search calls `resolveCanonicalCatalogWork` with `skipSchemaBackfill: true`.
- Search limits canonical matching to the best 24 pre-deduped external candidates.
- Each candidate has a 900 ms canonical matching budget.
- Local catalog and collection search have hard fallbacks at 2,500 ms and 900 ms.
- Provider fetches combine the provider timeout with the incoming request abort signal, and telemetry distinguishes provider timeout from client-aborted stale searches.
- Provider and canonical timeouts are recorded in `search.books` metadata; external provider timeout events use HTTP 408 in telemetry.

Post-fix local measurements against `127.0.0.1:4321`:

| Scenario | Result |
| --- | ---: |
| Existing DogEared local result, cold | 823.2 ms |
| Existing DogEared local result, repeated cache | 11.7 ms |
| No-results local phase | 305.7 ms |
| External Google Books phase | 1,388.3 ms |
| External Open Library phase | 709.0 ms |
| External Google Books repeated cache | 5.7 ms |
| External no-results phase | 387.6 ms |
| Rapid stale client abort | 57.3 ms client-side abort |
| Newer local query after abort | 167.0 ms |

Persisted telemetry from the same pass showed Google Books 635.2 ms, canonical Work matching 733.8 ms for 9 candidates, and total external Search 1,381.6 ms. Open Library measured 612.4 ms, canonical Work matching 87.4 ms for 1 candidate, and total external Search 702.6 ms. A subsequent aborted client request still completed on the Astro dev server in 1,160.0 ms because the local runtime did not surface the request signal as aborted; the server code now propagates that signal to provider fetches for runtimes that support disconnect cancellation.

## Timings

Earlier local-first search measurements, also against the local Astro dev server on `127.0.0.1:4321`.

| Scenario | Query | Before | After | Gain |
| --- | --- | ---: | ---: | ---: |
| Existing DogEared book, first request | `Project Hail Mary` | 44,313.5 ms | 877.1 ms local | 98.0% faster to first useful result |
| Existing DogEared book, repeated query | `Project Hail Mary` | 1,750.2 ms | 241.3 ms local | 86.2% faster |
| Partial title catalog match | `Wool` | 2,085.9 ms | 151.7 ms local | 92.7% faster |
| Existing catalog exact title | `The Ministry of Time` | 2,835.0 ms | 378.8 ms local | 86.6% faster |
| Title + author local validation | `The Ministry of Time Kaliane Bradley` | Old local catalog SQL did not match combined title+author before provider work | 728.5 ms local | Existing Work now found locally |
| External-only title, first phase | `Orbital Samantha Harvey` | Not captured separately by the old all-at-once route | 148.0 ms local no-match handoff | First feedback before provider completion |
| External-only title, provider phase | `Orbital Samantha Harvey` | Not captured separately by the old all-at-once route | 826.8 ms external | Provider result appended after local phase |
| No results, local phase | `ThisBookShouldNotExistXYZ12345` | 925.0 ms | 150.1 ms local | 83.8% faster to first response |
| No results, local + external phases | `ThisBookShouldNotExistXYZ12345` | 925.0 ms | 314.2 ms total | 66.0% faster after both phases |
| Rapid query change | `Project Hail Mary` -> `Wool` | Old page did not have a separate stale-cancel phase | stale request aborted in 150.9 ms; newer local result in 149.6 ms | Older response prevented from replacing newer results |

## Validation Notes

- Exact title: `Project Hail Mary` returned DogEared book `488` locally.
- Partial title: `Wool` returned DogEared book `519` locally.
- Title + author: `The Ministry of Time Kaliane Bradley` returned DogEared book `152` locally.
- Existing catalog result: local `dbd` results render before external provider work.
- External result: `Orbital Samantha Harvey` returned `Orbital` from Open Library in the external phase.
- No results: local phase returned no cards in 150.1 ms; external phase also returned no cards.
- Rapid changes: aborted stale external request did not replace the newer local `Wool` result.
- Slow provider response behavior is covered by the progressive path: local results are rendered before external provider completion, and request ids prevent stale provider responses from mutating the current result set.
