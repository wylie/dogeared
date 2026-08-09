# DogEared Profile Render Performance Report

Date: 2026-08-08

Scope: `/profile/[username]` rendering and the shared layout data required by Profile.

## Before

Admin Performance production telemetry showed Profile at about p50 1.06 s and p95 1.58 s. Existing spans were too coarse: `profile bundle` and `profile sections` hid whether latency came from profile lookup, follow counts, shelves, activity, reading goal, achievements, or shared layout data.

The previous local page-navigation report measured the shelf-heavy profile around 1.09 s to 1.26 s and identified Profile section loading as the remaining slow route.

## Changes

- `page.profile` now records fine-grained spans for authentication/session, user/profile lookup, follower/following counts, shelf summary, currently reading, momentum/streak, recent activity, finished books, reading goal, achievements, viewer shelf state, custom shelves, favorite links, and shared navigation/sidebar data.
- Profile passes its resolved session into the shared layout so the layout does not repeat session resolution work for the same request.
- Profile performance events are recorded from the layout after shared navigation/sidebar data is loaded, so the Profile total includes the shared data needed to render the page.
- After privacy is resolved, independent Profile reads run concurrently, including favorite book/author link lookup, shelf summary, activity, reading summary, achievements, Want to Read, finished books, and custom shelf data.
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
