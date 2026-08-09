# DogEared Profile Render Performance Report

Date: 2026-08-08

Scope: `/profile/[username]` rendering and the shared layout data required by Profile.

## Before

Admin Performance production telemetry showed Profile at about p50 1.06 s and p95 1.58 s. Existing spans were too coarse: `profile bundle` and `profile sections` hid whether latency came from profile lookup, follow counts, shelves, activity, reading goal, achievements, or shared layout data.

The previous local page-navigation report measured the shelf-heavy profile around 1.09 s to 1.26 s and identified Profile section loading as the remaining slow route.

## Changes

- `page.profile` now records fine-grained spans for authentication/session, profile identity, follower/following counts, shelf summary, currently reading, momentum/streak, recent activity, finished-this-year books, Read, reviews, reading goal, achievements, viewer shelf state, custom shelves, favorite links, shared navigation/sidebar data, and notification count.
- Profile passes its resolved session into the shared layout so the layout does not repeat session resolution work for the same request.
- Profile performance events are recorded from the layout after shared navigation/sidebar data is loaded, so the Profile total includes the shared data needed to render the page.
- After privacy is resolved, independent Profile reads run concurrently, including generated favorite book/author links, shelf summary, activity, reading summary, achievements, Want to Read, Read, and custom shelf data.
- Profile GET rendering no longer waits for review schema checks, profile index setup, achievement schema setup, or reading-progress schema setup. Those setup paths remain in mutating workflows, process-level guards, or migration/maintenance paths where they affect correctness.
- The duplicate momentum summary calculation at the end of Profile render was removed; Profile reuses the authoritative reading summary already loaded for the page.

## After

Measured locally against the Astro dev server on `127.0.0.1:4321` with the shelf-heavy public profile containing 458 shelf entries. The first dev request took 3.21 s due to cold Vite/dev-server work and was excluded from steady-state render timing.

| Scenario | Before | After | Change |
| --- | ---: | ---: | ---: |
| Production Profile p50 | 1.06 s | Pending production telemetry | Pending |
| Production Profile p95 | 1.58 s | Pending production telemetry | Pending |
| Local shelf-heavy Profile p50 | ~1.09 s | 0.46 s fetch / 0.43 s telemetry | ~58-61% faster |
| Local shelf-heavy Profile p95 | ~1.26 s | 0.74 s fetch / 0.67 s telemetry | ~41-47% faster |

Representative post-change telemetry for the shelf-heavy profile showed totals between 291 ms and 666 ms after warm-up. Dominant spans were usually `recent activity` at about 124-274 ms and `finished books` at about 84-393 ms, with occasional user/profile lookup variance around 110-356 ms from database/network round trips.

## Remaining Bottlenecks

Profile still loads all canonical finished books because the Read section, Reviews section, and annual reading goal share correctness-sensitive dedupe and finished-date behavior. The next deeper optimization should introduce dedicated paginated/counting profile shelf loaders that preserve canonical Work dedupe, review ordering, and annual-goal counts without loading the full finished history for every profile render.

Production should be checked after deployment because the current before/after production comparison is limited to the pre-change Admin Performance numbers plus local post-change telemetry.

## 2026-08-09 Production Telemetry Follow-up

Admin Performance for `/profile/[username]` showed about 61 `page.profile` samples over the latest seven-day production window: p50 937 ms, p95 1,591 ms, and p99 1,851 ms with 0% errors. The user-provided production sample for the route was p50 about 984 ms and p95 about 1.68 s. Request waterfalls showed the remaining latency was not external API work. The dominant spans were Profile section database reads and occasional profile-bundle/session variance.

Span breakdown from production telemetry:

| Span | p50 | p95 | Notes |
| --- | ---: | ---: | --- |
| profile sections loaded | 837.5 ms | 1,158.9 ms | Dominant request section. |
| profile bundle loaded | 93.7 ms | 514.5 ms | Included profile lookup plus follow counts. |
| finished books / Read | 125.4 ms | 429.8 ms | Still loads canonical finished history for correctness. |
| user/profile lookup | 112.3 ms | 410.3 ms | Renamed to `profile identity` for new traces. |
| recent activity | 191.0 ms | 336.3 ms | First page was requesting up to 100 candidate activity rows. |
| follower/following counts | 44.3 ms | 278.5 ms | Three independent queries. |
| Want to Read | 52.6 ms | 219.0 ms | Already bounded by a render window. |
| currently reading | 47.0 ms | 187.1 ms | Previously allowed up to 500 current rows. |
| momentum/streak | 46.6 ms | 179.9 ms | Progress-date lookup remains fresh. |

Request data map for one Profile render after identity/privacy resolution:

| Purpose | Query count | Rows returned | Freshness rule |
| --- | ---: | ---: | --- |
| authentication/session | 0-1 | 0-1 | Reuses resolved session in shared layout. |
| profile identity | 1 | 0-1 | Fresh per request. |
| follower/following counts + viewer relationship | 1 | 1 | Fresh per request; consolidated from three queries. |
| shelf summary | 1 | up to active statuses | Fresh per request. |
| recent activity | 2 | up to 12 visible activities plus like aggregates | Fresh per request; first-page candidate window reduced from 100 to 48 rows. |
| currently reading + progress counts | 1 | bounded to the visible page window, minimum 36 | Fresh per request. |
| momentum/streak | 1 | up to 120 progress dates | Fresh per request. |
| achievements | 1 | up to 48 | Fresh per request, hidden unless owner/public setting allows. |
| Want to Read | 1 | up to 36 | Fresh per request. |
| Read / finished books | 1 | all canonical finished books | Fresh per request; still the correctness-sensitive remaining bottleneck. |
| custom shelves | 0-1 | owner shelves | Owner-only. |
| custom shelf books | 0-1 | owner custom shelf books | Owner-only. |
| viewer shelf state | 0-1 | visible book IDs | Only when viewer and visible books exist. |
| favorite book/author links | 0 | none | DB lookups removed; generated from stored profile text. |
| shared navigation/sidebar data | cached public layout query | public layout metadata | Does not repeat Profile session lookup. |
| notification count | 0 during SSR | none | Client-deferred badge fetch; recorded as zero-duration deferred span. |

Changes in this pass:

- Consolidated follower count, following count, and viewer-follow relationship into one query.
- Removed favorite book and favorite author DB lookups from Profile rendering. Favorite author links use the existing slug helper; favorite book links use the existing title/author detail URL.
- Reduced first-page recent activity candidate loading from up to 100 rows to 48 rows while still rendering the current requested page.
- Passed a Profile-specific current-book limit into `loadReaderReadingSummary` so Profile does not request up to 500 current rows when it only renders a bounded section.
- Added request-waterfall start offsets to Profile spans and to the shared layout span.
- Added explicit Profile spans for `profile identity`, `Read`, `finished-this-year books`, `reviews`, `DNF`, and `notification count`. `DNF` is currently a zero-work span because DNF is not an active persisted default shelf in DogEared's shelf API. `notification count` is zero-duration during SSR because the unread badge remains client-deferred instead of blocking Profile rendering.

Direct database measurements against a shelf-heavy reader with 458 shelf entries:

| Query shape | Before | After | Change |
| --- | ---: | ---: | ---: |
| follower/following counts | 154.6 ms across 3 concurrent queries | 37.9 ms in 1 query | 75.5% faster |
| recent activity first-page candidate read | 109.5 ms for 100 rows | 39.5 ms for 48 rows | 63.9% faster |
| currently reading profile read | 50.8 ms with limit 500 | 40.4 ms with limit 36 | 20.5% faster |

Expected production impact: the p50 should improve modestly, and p95 should improve most on profiles where follow counts, favorite-link lookups, or first-page activity were contributing to the waterfall. The remaining hard ceiling is the all-finished-books `Read` load, which is still kept fresh and canonical for Reading Goal, Reviews, and Read pagination correctness.
