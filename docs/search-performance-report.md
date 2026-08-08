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
