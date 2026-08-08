# Search Performance Report

Date: 2026-08-08

Scope: `/api/books/search` and `/search` book search only.

## Architecture Changes

- Search now supports `mode=local`, `mode=external`, and compatible `mode=all` responses.
- `/search` requests DogEared catalog results first and progressively fetches external matches afterward.
- Known DogEared catalog results do not wait for Google Books, Open Library, provider enrichment, cover enrichment, or canonical resolver work.
- External Google Books and Open Library calls run concurrently from deduped normalized query variants.
- External results still resolve through `resolveCanonicalCatalogWork` before rendering or shelf saves.
- Public search caches use normalized query input, page, and page size. They do not include reader-specific shelf state.
- Client-side progressive search uses `AbortController` and request ids so stale responses are ignored.
- Search analytics are queued after the useful response path instead of blocking local results.

## Timings

Measured against the local Astro dev server on `127.0.0.1:4321`.

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
