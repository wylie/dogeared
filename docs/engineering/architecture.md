# Architecture

DogEared is an Astro application with server-rendered pages, TypeScript API routes, Neon Postgres persistence, and client-side enhancement for shelf, activity, profile, import, metrics, and settings interactions.

This is a high-level overview only. Implementation details should be read from the source files when changing behavior.

## Pages

Routes live in `src/pages/`.

- Content and product pages: home, books, authors, book detail, author detail, related, mission, roadmap, privacy, support.
- Authenticated reader pages: profile, following, settings, welcome, metrics.
- Admin pages: admin overview, data health, users, user detail.
- Compatibility redirects: discover, feed, myreads, profile index, author query redirect, legacy `/u/[username]`.
- System routes: robots and sitemap.

## Components

Shared components live in `src/components/`.

- `BookCard` renders repeated book/activity cards.
- `ShelfDropdown` provides default and custom shelf controls.
- `RatingControl` handles star ratings.
- `Chip` renders metadata chips for genres/topics.
- `Navigation`, `LeftHand`, `FloatingActions`, `FeedbackWidget`, and widget components provide layout and side surfaces.

## API Layers

API routes live in `src/pages/api/` and are grouped by product area:

- Account: preferences, sessions, email change, export, clear shelf, delete endpoint.
- Activity: recent activity, likes, comments.
- Auth: magic-link request, verification, current user, logout.
- Books: search, suggestions, cover proxy.
- Follow: follow state and mutations.
- Profile/public: profile info, username, public shelf/activity/profile.
- Shelf: shelf entries, ratings, custom shelves, custom shelf books, section ordering.
- Admin-adjacent/system: health, feedback, notifications count, onboarding status, top lists, reader suggestions.

Most APIs resolve the current session when mutating or reading private user data.

## Services

Shared product/data logic lives in `src/lib/`.

- Authentication and account helpers: `auth`, `authHardening`, `emailChange`, `email`.
- Catalog and metadata helpers: `catalog`, `bookPayload`, `bookCovers`, `catalogKeys`, `author`, `authorEnrichment`, `externalAuthorBooks`, `genres`, `metadataAssets`.
- Reader/product logic: `shelfClient`, `shelfStorage`, `customShelves`, `readingGoal`, `momentumPrediction`, `goodreadsImport`, `bookReviews`.
- Community and privacy: `feed`, `publicProfile`, `privacy`, `followPolicy`, `demoVisibility`.
- Operations: `admin`, `adminData`, `monitoring`, `feedback`, `runtimeCache`, `indexing`, `seo`, `roadmap`, `homeSections`.

## Utilities

Utilities normalize text, status, slugs, metadata, ISBNs, privacy defaults, usernames, and cached/runtime data. The codebase favors small local helpers in page/API files plus reusable helpers in `src/lib`.

## Data Flow

1. A page renders from Astro on the server.
2. Server code resolves session state when needed.
3. Pages query Neon directly or through library helpers.
4. Client-side scripts enhance the page by calling API routes for mutations or lazy loading.
5. API routes validate the session, normalize input, mutate Neon, and return JSON.
6. Client-side UI updates the current card/section and often refreshes shelf/activity state from APIs.

## Persistence

Baseline schema is in `db/neon-schema.sql`, migrations are in `db/migrations/`, and newer support tables are also created lazily in API/helper code. The product currently uses Neon Postgres directly through `@neondatabase/serverless`.

## External Data

DogEared uses Google Books and Open Library for search, metadata, covers, and enrichment. Once a book is shelved or imported, DogEared stores a local catalog record and can serve it from its own database.
