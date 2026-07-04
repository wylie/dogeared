# Architecture

DogEared is an Astro application with server-rendered pages, TypeScript API routes, Neon Postgres persistence, and client-side enhancement for shelf, activity, profile, import, metrics, and settings interactions.

This is a high-level overview only. Implementation details should be read from the source files when changing behavior.

## Pages

Routes live in `src/pages/`.

- Content and product pages: home, books, authors, book detail, author detail, editorial collections, related, mission, roadmap, privacy, support.
- Authenticated reader pages: profile, following, My Reading Life, Reading Journal, settings, welcome, metrics.
- Admin pages: admin overview, collections, data health, users, user detail.
- Compatibility redirects: discover, feed, myreads, profile index, author query redirect, reading timeline, legacy `/u/[username]`.
- System routes: robots and sitemap.

## Components

Shared components live in `src/components/`.

- `BookCard` renders repeated book/activity cards.
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
- Admin-adjacent/system: health, feedback, notifications count, onboarding status, guided first-experience status, top lists, reader suggestions.

Most APIs resolve the current session when mutating or reading private user data.

## Services

Shared product/data logic lives in `src/lib/`.

- Authentication and account helpers: `auth`, `authHardening`, `emailChange`, `email`.
- Catalog and metadata helpers: `catalog`, `bookPayload`, `bookCovers`, `catalogKeys`, `author`, `authorEnrichment`, `externalAuthorBooks`, `genres`, `metadataAssets`, `series`, `collections`.
- Reader/product logic: `shelfClient`, `shelfStorage`, `customShelves`, `readingGoal`, `readingLife`, `readingJournal`, `guidedTour`, `momentumPrediction`, `goodreadsImport`, `bookReviews`.
- Discovery logic: `discoveryProviders` exposes the discovery service and reusable Home providers; `homeSections` loads cached aggregate signals and maps provider output to book cards.
- Community and privacy: `feed`, `publicProfile`, `privacy`, `followPolicy`, `demoVisibility`.
- Operations: `admin`, `adminData`, `monitoring`, `feedback`, `runtimeCache`, `indexing`, `seo`, `roadmap`, `homeSections`.

## Utilities

Utilities normalize text, status, slugs, metadata, ISBNs, privacy defaults, usernames, and cached/runtime data. The codebase favors small local helpers in page/API files plus reusable helpers in `src/lib`.

## Data Flow

1. A page renders from Astro on the server.
2. Server code resolves session state when needed.
3. Pages query Neon directly or through library helpers.
4. Catalog pages enrich books with optional series and editorial collection metadata when available.
5. Editorial collection pages load published collection records and ordered collection-book entries with notes, quotes, ratings, and shelf state.
6. My Reading Life derives private personal summaries from shelf entries, finished dates, ratings, progress events, genres, authors, series, and profile goal data, including timeline and calendar history.
7. Reading Journal loads private entries for the signed-in reader, supports optional book-linked entries for owned books, saves through an authenticated API, and searches/filters only that reader's entries.
8. Home discovery loads cached aggregate community signals, ranks them through reusable providers, and renders explainable sections.
9. Guided first-experience tips load per-user progress from Settings data, evaluate the current route and reader state, and render at most one contextual callout.
10. Client-side scripts enhance the page by calling API routes for mutations or lazy loading.
11. API routes validate the session, normalize input, mutate Neon, and return JSON.
12. Client-side UI updates the current card/section and often refreshes shelf/activity state from APIs.

## Series Support

Series support lives in `src/lib/series`. The helper owns schema readiness, series-book ordering, current-book detection, next-book continuation logic, and author-page grouping. Book detail pages load a series context when a book belongs to a series. Search attaches series labels to catalog results, and author pages group books by series while keeping standalone books separate.

## Editorial Collections

Editorial collection logic lives in `src/lib/collections`. The helper owns schema readiness, slug/state normalization, featured selection, collection-book ordering, public collection loading, author collection lookups, search matches, and admin save behavior. Public routes live at `/collections` and `/collections/[slug]`; admin management lives at `/admin/collections`. Home loads at most two featured published collections, Search returns published collection matches, and author pages show collections featuring that author.

## My Reading Life

My Reading Life lives at `/reading-life` and uses `src/lib/readingLife` for pure calculations. The route loads the signed-in reader's finished books, current books, progress events, and profile goal, then derives overview statistics, timeline filters, calendar heatmap data, genre insights, author insights, fun statistics, and yearly journey summaries. The page is marked `noindex,nofollow` and appears in signed-in navigation under You. It is the historical/reflection destination for overview, history, insights, and journey content.

## Reading Journal

Reading Journal lives at `/journal` and uses `src/lib/readingJournal` for schema readiness, input normalization, permission checks, entry creation/update, deletion, book-level recent entries, and private search/filtering. The main journal page renders a newest-first paginated timeline, prominent new-entry form, searchable saved-book picker, date filters, inline entry detail, edit/delete controls, and local draft recovery. Journal entries store one optional reading position as a type/value pair. Book detail pages show recent entries for owned books and offer quick creation when the book is Currently Reading. Profile progress updates can offer an optional journal prompt that deep-links to a prefilled private draft. Journal content remains private notebook data and is not rendered on profiles, public search, activity feeds, comments, or statistics surfaces.

## Discovery Providers

Home discovery is provider-based. The discovery service runs pure ranking providers that receive aggregate community signals and return section metadata plus ranked book IDs, reasons, and optional review metadata. The SQL layer gathers activity, ratings, reviews, reviewer usernames, reactions, publication year, and shelf counts in one cached aggregate pass to avoid N+1 discovery queries.

Current providers:

- `CommunityFavoritesProvider`.
- `MostAddedProvider`.
- `MostFinishedProvider`.
- `TrendingProvider`.
- `HiddenGemsProvider`.
- `RecentlyReviewedProvider`.
- `NewReleaseProvider`.

## Guided First Experience

Guided first-experience logic lives in `src/lib/guidedTour`, `src/components/GuidedTip.astro`, and `/api/guidance/status`. The helper defines canonical tip IDs, normalizes settings, deduplicates completed/dismissed tips, and derives the signed-in reader state used by contextual rules. The component owns the site-wide tip catalog, route/state conditions, accessible callout rendering, placement, and primary/dismiss actions.

Current guided surfaces are Home, Search, book detail shelf controls, first book added, Profile/Currently Reading progress, post-progress Journal suggestion, Reading Journal, Reviews, and Settings Learning controls. Journal-specific tips are constrained to the Journal route or post-progress context so the first experience remains about learning DogEared as a whole.

To add a tip, add a canonical ID in `src/lib/guidedTour.ts`, add the tip definition in `GuidedTip.astro`, and include tests for the new ID and trigger rule. The API stores progress under `app_user.profile_data.settings.guidedTour`, so adding a tip does not require a new table.

## Persistence

Baseline schema is in `db/neon-schema.sql`, migrations are in `db/migrations/`, and newer support tables are also created lazily in API/helper code. The product currently uses Neon Postgres directly through `@neondatabase/serverless`.

## External Data

DogEared uses Google Books and Open Library for search, metadata, covers, and enrichment. Once a book is shelved or imported, DogEared stores a local catalog record and can serve it from its own database.
