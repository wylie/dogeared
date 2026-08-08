# Architecture

DogEared is an Astro application with server-rendered pages, TypeScript API routes, Neon Postgres persistence, and client-side enhancement for shelf, activity, profile, import, metrics, and settings interactions.

This is a high-level overview only. Implementation details should be read from the source files when changing behavior.

## Pages

Routes live in `src/pages/`.

- Content and product pages: home, books, authors, book detail, author detail, editorial collections, related, mission, roadmap, release notes, privacy, support.
- Authenticated reader pages: profile, following, My Reading Life, Reading Journal, settings, welcome, metrics.
- Admin pages: admin overview, product analytics, collections, Founding Readers, releases, feedback, data health, users, user detail.
- Compatibility redirects: discover, feed, myreads, profile index, author query redirect, reading timeline, legacy `/u/[username]`.
- System routes: robots and sitemap.

## Components

Shared components live in `src/components/`.

- `BookCard` renders repeated book/activity cards.
- Reusable UI behavior that belongs to a repeated card or shared surface should live with that component whenever practical, including its markup, scoped styles, data attributes, accessibility state, and client-side event handling. Pages should compose shared components and opt into component features instead of duplicating card-specific HTML, CSS, or JavaScript.
- `ShelfDropdown` provides default and custom shelf controls.
- `RatingControl` handles standalone star ratings, while book/profile review editors handle finished-book public recommendations.
- `Chip` renders metadata chips for genres/topics.
- `Navigation`, `LeftHand`, `FloatingActions`, `FeedbackWidget`, `GuidedTip`, and widget components provide layout and side surfaces.

## API Layers

API routes live in `src/pages/api/` and are grouped by product area:

- Account: preferences, sessions, email change, export, clear shelf, delete endpoint.
- Activity: recent activity, likes, comments.
- Auth: magic-link request, verification, current user, logout.
- Books: search, suggestions, cover proxy.
- Follow: follow state and mutations.
- Journal: private journal entry create/search/filter, update, and delete.
- Profile/public: profile info, username, public shelf/activity/profile.
- Shelf/reviews: shelf entries, ratings, finished-book review metadata, custom shelves, custom shelf books, section ordering.
- Admin-adjacent/system: health, feedback, first-party analytics events, notifications, notifications count, onboarding status, guided first-experience status, top lists, reader suggestions.

Most APIs resolve the current session when mutating or reading private user data.

## Services

Shared product/data logic lives in `src/lib/`.

- Authentication and account helpers: `auth`, `authHardening`, `emailChange`, `email`.
- Catalog and metadata helpers: `catalog`, `catalogWorks`, `bookPayload`, `bookCovers`, `catalogKeys`, `author`, `authorEnrichment`, `externalAuthorBooks`, `genres`, `metadataAssets`, `series`, `collections`.
- Reader/product logic: `shelfClient`, `shelfStorage`, `customShelves`, `readingGoal`, `readingLife`, `readingJournal`, `guidedTour`, `momentumPrediction`, `goodreadsImport`, `bookReviews`, `recommendations`.
- Discovery logic: `discoveryProviders` exposes the discovery service and reusable Home providers; `homeSections` loads cached aggregate signals and maps provider output to book cards.
- Community and privacy: `feed`, `publicProfile`, `privacy`, `followPolicy`, `demoVisibility`.
- Operations: `admin`, `adminData`, `monitoring`, `feedback`, `productAnalytics`, `performanceTelemetry`, `runtimeCache`, `indexing`, `seo`, `roadmap`, `releases`, `homeSections`.

## Utilities

Utilities normalize text, status, slugs, metadata, ISBNs, privacy defaults, usernames, and cached/runtime data. The codebase favors small local helpers in page/API files plus reusable helpers in `src/lib`.

## Data Flow

1. A page renders from Astro on the server.
2. Server code resolves session state when needed.
3. Pages query Neon directly or through library helpers.
4. Catalog pages resolve to canonical Works when possible, enrich representative book rows with optional series and editorial collection metadata, and retain Edition metadata for ISBN/publisher/format precision. Reader-facing recommendation/discovery/search/author lists dedupe by Work so ISBN-specific editions do not normally appear as duplicate books.
5. Editorial collection pages load published collection records and ordered collection-book entries with notes, quotes, ratings, and shelf state.
6. My Reading Life derives private personal summaries from shelf entries, finished dates, ratings, progress events, genres, authors, series, and profile goal data, including timeline and calendar history. Annual reading goal progress uses the same `readingGoal` helper as Profile.
7. Reading Journal loads private entries for the signed-in reader, supports optional book-linked entries for owned books, saves through an authenticated API, and searches/filters only that reader's entries.
8. Home discovery loads cached aggregate community signals, ranks them through reusable providers, and renders explainable sections.
9. Guided first-experience tips load per-user progress from Settings data, evaluate the current route and reader state, and render at most one contextual callout.
10. Client-side scripts enhance the page by calling API routes for mutations or lazy loading.
11. API routes validate the session, normalize input, mutate Neon, and return JSON.
12. Client-side UI updates the current card/section and often refreshes shelf/activity state from APIs.

## Global Rendering Rules

Global UI should have explicit rendering rules so release-blocker fixes do not depend on incidental route behavior.

- `LeftHand` owns the sidebar navigation and login dialog markup.
- The shared `Layout` includes Astro's `ClientRouter` for progressive same-origin navigation. Direct URLs still render through SSR, while internal links and GET forms can preserve browser history without forcing a full document reload. A delayed top progress bar provides subtle feedback only when a route swap is noticeable.
- Shared layout data follows cache boundaries: request-scoped auth/session data can be reused within a request, short-lived public layout data can be runtime-cached, and user-specific navigation state such as notification counts remains per-reader and is loaded from authenticated endpoints.
- `Layout` decides whether the global login prompt is allowed on the current route and passes `allowAuthPrompt` to `LeftHand`.
- `ReaderGuidance` uses the same route gate through `allowGuidance`, so logged-out visitor guidance does not appear on informational pages.
- The login prompt is limited to reader/product surfaces where sign-in or account creation is an expected next step, such as Home, Discover, Search, Books, Authors, Book Detail, Collections, Related, and public Profiles.
- Informational pages such as Mission, Privacy, Roadmap, and Support must not mount the global login modal.
- Authenticated, admin, settings, journal, and private reading-life surfaces should not show logged-out onboarding prompts.
- `FloatingActions` remains global for Feedback and Support, but its labels must stay readable and its controls keyboard accessible on desktop and mobile.
- Announcement banners render only when the admin announcement feature flag allows them and an active announcement exists.

## Series Support

Series support lives in `src/lib/series`. The helper owns schema readiness, known-series inference, idempotent series attachment, series-book ordering, current-book detection, previous/next navigation targets, and author-page grouping. Series are conceptually Work-level. During v1, `series_book.book_id` points at the representative catalog row for that Work, while `book_work.series_id` and `book_work.series_position` store canonical Work ownership. Book detail pages load a series context when a Work belongs to a series. Search attaches stored series labels to catalog results and infers labels for known external results before they are saved. BookCard can render concise series labels, recommendation/discovery queries attach series metadata where available, and author pages group Works by series while keeping standalone Works separate.

Series ordering prefers explicit `book_order`, then publication order, chronological order, publication year, title, and representative book id. Missing known titles may be represented as `series_book` placeholder rows with `title_override` and no `book_id`; book detail links those placeholders to Search so readers can add the title when a catalog row is not available yet. Recommendations use series context to rank the earliest unread next book after a finished series entry ahead of unrelated recommendations, while avoiding later unread books until earlier available entries have been finished.

Series cover enrichment lives in `src/lib/bookCoverEnrichment`. Book Detail schedules it after rendering a series context rather than blocking the page. The helper checks existing DogEared book, canonical Work, Edition, and series-entry metadata first, then Open Library, then Google Books. Successful covers are persisted back to local catalog records, while no-result and failure attempts are cached in `book_cover_enrichment_cache` with retry windows so external providers are not queried on every page load.

## Canonical Works And Editions

Work/Edition support lives in `src/lib/catalogWorks` and `src/lib/catalogKeys`.

- `book_work` is the canonical reader-facing Work table. It owns title, canonical title, author, description, subjects, genres, series metadata, original publication year, preferred cover, rating summary, and extensible metadata.
- `book_edition` stores Edition precision: ISBNs, publisher, format, language, publication date/year, page count, cover, Google Books ID, Open Library work/edition IDs, external IDs, and metadata.
- `book.work_id` links legacy catalog rows to their canonical Work. The existing `book` table remains a compatibility representative for routes, cards, and older relationships during v1.
- `user_book.edition_id` can remember the chosen Edition, but shelves, ratings, reviews, progress, activity, recommendations, search, author pages, series, and Readers Also Enjoyed operate on the Work through the representative book row.
- `canonicalCatalogWorkKey` is title/author based. ISBNs and source edition IDs are Edition identity, not Work identity. Import/dedupe code can still use ISBN as supporting evidence when deciding whether two rows represent the same Work.

The migration `2026-07-05-canonical-works-editions-v1.sql` creates the Work/Edition tables, backfills existing books, chooses a representative book per Work, merges duplicate shelf/rating/review/progress/journal/activity/custom-shelf/recommendation-feedback rows, and rewrites series and collection relations to the representative Work row. The follow-up known-series migration backfills common series whose metadata is often missing from external providers without changing shelves, ratings, reviews, journal entries, progress, activity, favorites, or goals.

## Editorial Collections

Editorial collection logic lives in `src/lib/collections`. The helper owns schema readiness, slug/state normalization, featured selection, collection-book ordering, public collection loading, author collection lookups, search matches, and admin save behavior. Public routes live at `/collections` and `/collections/[slug]`; admin management lives at `/admin/collections`. Home loads at most two featured published collections, Search returns published collection matches, and author pages show collections featuring that author.

## My Reading Life

My Reading Life lives at `/reading-life` and uses `src/lib/readingLife` for pure calculations. The route loads the signed-in reader's finished books, current books, progress events, and profile goal, then derives overview statistics, timeline filters, calendar heatmap data, genre insights, author insights, fun statistics, and yearly journey summaries. The page is marked `noindex,nofollow` and appears in signed-in navigation under You. It is the historical/reflection destination for overview, history, insights, and journey content.

## Reading Journal

Reading Journal lives at `/journal` and uses `src/lib/readingJournal` for schema readiness, input normalization, permission checks, entry creation/update, deletion, book-level recent entries, and private search/filtering. The main journal page renders a newest-first paginated timeline, prominent new-entry form, searchable saved-book picker, date filters, inline entry detail, edit/delete controls, and local draft recovery. Journal entries store one optional reading position as a type/value pair. Book detail pages show recent entries for owned books and offer quick creation when the book is Currently Reading. Profile progress updates can offer an optional journal prompt that deep-links to a prefilled private draft. Journal content remains private notebook data and is not rendered on profiles, public search, activity feeds, comments, or statistics surfaces.

High-traffic SSR routes avoid repeated idempotent setup on every request. Reading Journal, Notifications, My Reading Life, Book Detail reviews, Following feed tables, and feed interaction tables memoize schema readiness per server process and reset the memoized promise if setup fails. Page loaders parallelize independent data reads where correctness permits, and optional public metadata work such as known-series maintenance or Open Library author metadata is kept out of the authoritative local DogEared render path.

## Discovery Providers

Home discovery is provider-based. The discovery service runs pure ranking providers that receive aggregate community signals and return section metadata plus ranked book IDs, reasons, and optional review metadata. The SQL layer gathers activity, ratings, reviews, reviewer usernames, reactions, publication year, and shelf counts in one cached aggregate pass to avoid N+1 discovery queries.

## Recommendations

Recommendations live in `src/lib/recommendations`. The service builds explainable personal recommendations from shelf entries, ratings, finished books, genre overlap, enjoyed authors, similar books, and aggregate community ratings. It falls back to popular books when personalization data is thin. It also powers book detail Readers Also Enjoyed through shared readers, genres, and authors. Recommendation rows attach series labels and collapse display-level duplicate editions through `dedupeCatalogItemsByDisplayWork`.

Recommendation feedback is stored through `/api/recommendations/feedback`; the Hide recommendation action stores `not_interested` feedback, which is excluded from future personal results. User-specific recommendations are recomputed on request so feedback takes effect without waiting for a shared cache. `BookCard` owns the feedback controls, status messaging, disabled/loading states, styles, accessibility attributes, and client-side event handling through an opt-in API, leaving pages responsible only for rendering recommendation cards. The UI renders feedback as lightweight rectangular secondary actions, leaving Add To Shelf as the primary action.

Founding Reader feedback and bug reporting are handled by `FeedbackWidget`, `/api/feedback`, `feedback_submission`, and `/admin/feedback`. The widget owns the reader-facing form, bug-only fields, screenshot preview, privacy copy, context capture, and opt-in client-error prompt. The API validates input, rate-limits by user/IP hash, stores the report with a tracking number and diagnostics, and sends a best-effort notification email when configured. The admin dashboard owns triage status, internal notes, follow-up flags, duplicate markers, resolved version, and resolution dates.

Founding Reader access is handled by `src/lib/foundingReaders.ts`, `/api/auth/request-magic-link`, and `/admin/founding-readers`. The access service owns Open, Waitlist, and Invite Only rules, capacity checks, waitlist storage, and joined-state updates. Magic-link account creation checks this service before inserting an `app_user` record, so Waitlist and Invite Only modes can collect requests without creating accounts.

Release management is handled by `src/lib/releases.ts`, `/admin/releases`, `/release-notes`, Roadmap Recently Shipped, and the global What's New modal in `Layout`. Admin releases use the existing `admin_release_note` table with additive structured fields for summary, release date, status, highlights, bug fixes, known issues, and migration notes. Only published releases are reader-facing. The feedback flow includes app version, latest release version, and commit hash in diagnostic metadata.

Product analytics live in `src/lib/productAnalytics`, `/api/analytics/event`, and `/admin/analytics`. The system is first-party and aggregate-focused: server routes record durable events for search and recommendation feedback, while Layout records small non-blocking client events for page views, feature views, recommendation impressions, recommendation clicks, and recommendation add-to-shelf intent. Admin analytics uses cached aggregate queries and existing product tables for growth, reading, community, search, discovery, first-run funnel, and feature adoption. It does not collect private journal content, passwords, sensitive profile text, or expose reader-level behavior reports.

Performance telemetry lives in `src/lib/performanceTelemetry`, `performance_event`, and `/admin/performance`. It is operational telemetry, not user/product analytics. Meaningful user-facing workflows and dependency calls record operation name, route/API pattern, total duration, success/failure, optional HTTP status, release version, environment, external provider, and sanitized timing spans. Current operation names include `search.books`, `progress.save`, `shelf.mutate`, `page.profile`, `page.reading-life`, `page.search`, `page.book-detail`, `page.author-detail`, `page.discover`, `external.google-books`, and `external.open-library`. Search spans include local catalog search, Google Books, Open Library, metadata enrichment/preparation, canonical Work matching, result merge, and rendering preparation.

Recording is intentionally non-blocking: API routes and SSR pages call the safe recorder fire-and-forget after authoritative work or immediately before returning an error. The recorder creates the telemetry schema if needed, applies sampling from `PERFORMANCE_TELEMETRY_SAMPLE_RATE` for normal successes, and always records failed, server-error, and unusually slow operations. Raw telemetry retention is 45 days; admin views use cached aggregate queries for percentiles, route summaries, provider summaries, slow-operation rows, span breakdowns, and release comparisons.

Timing spans use the same stage names as local development performance logs so developers can compare local traces with production aggregates. Spans should describe work categories such as local catalog lookup, external providers, canonical resolution, result merge, progress save, milestone notifications, profile bundle loading, viewer-state loading, and related content loading. Do not store raw SQL, query text, titles, usernames, emails, journal content, profile text, auth data, or sensitive payload fields in telemetry metadata.

Notifications live in `src/lib/notifications`, `/notifications`, `/api/notifications`, `/api/notifications/count`, and `/admin/notifications`. The helper owns schema readiness, supported types, category preferences, low-noise grouping, unread counts, read/delete operations, reader-facing loading, admin statistics, and milestone generators. Event sources such as activity likes, comments, follows, and shelf/progress updates call the helper rather than embedding notification SQL locally. The renderer is the dedicated Notifications page, while Settings owns category preferences for Community, Reading, Discovery, Milestones, and System. New notification types should add a type/category/icon/default copy in the helper and then call `createNotification` from the relevant product event generator.

Current providers:

- `CommunityFavoritesProvider`.
- `MostAddedProvider`.
- `MostFinishedProvider`.
- `TrendingProvider`.
- `HiddenGemsProvider`.
- `RecentlyReviewedProvider`.
- `NewReleaseProvider`.

## Guided First Experience

Guided first-experience logic lives in `src/lib/guidedTour`, `src/components/GuidedTip.astro`, and `/api/guidance/status`. The helper defines canonical tip IDs, normalizes settings, deduplicates completed/dismissed tips, and derives the signed-in reader state used by contextual rules. The component owns the site-wide tip catalog, route/state conditions, accessible anchored coach-mark rendering, placement, and primary/dismiss actions.

Current guided surfaces are Home, Search, book detail shelf controls, first book added, Profile/Currently Reading progress, post-progress Journal suggestion, Reading Journal, first finished book review guidance, and Settings Learning controls. Journal-specific tips are constrained to the Journal route or post-progress context so the first experience remains about learning DogEared as a whole. Orphaned review-vs-journal tooltips are intentionally not mounted on Book Detail.

Coach marks must stay visually attached to the component they explain. `GuidedTip.astro` positions the callout with document-anchored absolute coordinates based on the declared anchor selector, updates placement on scroll and resize, and temporarily hides the callout when its target is missing, hidden, or outside the viewport. Do not reintroduce viewport-fixed guided popups for contextual tips.

To add a tip, add a canonical ID in `src/lib/guidedTour.ts`, add the tip definition in `GuidedTip.astro` with an anchor selector, and include tests for the new ID and trigger rule. The API stores progress under `app_user.profile_data.settings.guidedTour`, so adding a tip does not require a new table.

## Persistence

Baseline schema is in `db/neon-schema.sql`, migrations are in `db/migrations/`, and newer support tables are also created lazily in API/helper code. The product currently uses Neon Postgres directly through `@neondatabase/serverless`.

## External Data

DogEared uses Google Books and Open Library for search, metadata, covers, and enrichment. Once a book is shelved or imported, DogEared stores a local catalog record and can serve it from its own database.

## Import Experience

Goodreads import planning lives in `src/lib/goodreadsImport.ts`. Settings composes that shared parser/planner into the Import Dashboard so preview, final report, duplicate explanations, metadata review reasons, and resumable failed syncs all derive from the same plan. The page writes shelf changes through `saveShelfEntryWithRetry` and stores browser-local import history/recovery state for reader-facing transparency.

Admin metadata review lives on `/admin/data-health` and queries catalog gaps separately from reader import execution. Import cleanup should remain operational and non-blocking for readers.
