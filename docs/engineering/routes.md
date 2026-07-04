# Routes

Authentication requirements:

- Public: can be viewed without a session, though controls may be disabled or redirect to sign-in flows.
- Authenticated: requires a signed-in user.
- Admin: requires a signed-in user whose username is allowed by `ADMIN_USERNAMES`.
- Redirect: compatibility route that redirects elsewhere.

## Page Routes

| Route | Auth | Purpose | Major components/data |
| --- | --- | --- | --- |
| `/` | Public | Featured editorial collections, explainable community discovery, onboarding checklist, provider sections, reader suggestions, custom shelf ideas. | `BookCard`, `ShelfDropdown`, `RatingControl`, `collections`, `discoveryProviders`, `homeSections`, reader suggestions API. |
| `/search` | Public | Search books and add results to shelves, with series labels and editorial collection matches. | `BookCard`, `ShelfDropdown`, `RatingControl`, `/api/books/search`, series metadata, collection results. |
| `/books` | Public | Browse catalog sections like trending, most shelved, top rated, and recently active. | `BookCard`, `ShelfDropdown`, catalog stats. |
| `/book` | Public | Book detail by book ID or external/query metadata, including series context and private journal access when available. | `BookCard`, `ShelfDropdown`, `RatingControl`, `Chip`, series section, continue-series callout, recent Reading Journal entries and quick creation for owned Currently Reading books, reviews, activity likes/comments. |
| `/authors` | Public | Search, filter, sort, and page through authors. | Author cards, author stats. |
| `/author/[slug]` | Public | Canonical author detail page with Featured In collections and series-grouped local books. | `BookCard`, `ShelfDropdown`, `RatingControl`, collection links, series grouping, external author books, author metadata. |
| `/author` | Redirect | Legacy author query route. | Redirects to canonical author path or `/authors`. |
| `/collections` | Public | Browse published editorial collections by category. | `collections` helper, collection cards, published collection metadata. |
| `/collections/[slug]` | Public | Editorial collection detail page with introduction, ordered books, notes, quotes, ratings, and shelf controls. | `BookCard`, `ShelfDropdown`, `RatingControl`, `collections` helper. |
| `/related` | Public | Landing and related pages for genres, topics, authors, and books. | `BookCard`, `ShelfDropdown`, genre/topic/author/book queries. |
| `/profile/[username]` | Public with privacy checks | Public reader identity and current reading state; owner can edit profile, view notifications, and manage shelves. | Profile bundle, shelf summary, custom shelves, concise reading goal, momentum, current reads, notifications, activity likes/comments. |
| `/profile/[username]/followers` | Public with privacy checks | Paginated followers list for a profile. | Public profile bundle, follower search/sort. |
| `/profile` | Redirect | Sends the signed-in user to their profile or settings. | Session and username lookup. |
| `/u/[username]` | Redirect | Legacy profile alias. | Redirects to `/profile/[username]`. |
| `/following` | Authenticated | Manage followed readers and view following activity. | Reader suggestions, following readers, `BookCard`, likes/comments, follow API. |
| `/reading-life` | Authenticated | Private reflection on the signed-in reader's historical reading life, organized around overview, history, insights, and journey. | `readingLife` helper, shelf entries, progress events, genres, authors, series metadata, reading goal data, timeline, calendar, statistics. |
| `/reading-timeline` | Redirect | Compatibility route for old timeline links. | Redirects to `/reading-life#timeline` while preserving query parameters. |
| `/journal` | Authenticated | Private reading journal for creating, searching, filtering, editing, and deleting the signed-in reader's own notes. | `readingJournal` helper, newest-first journal search, book filter, new-entry form, edit/delete controls, local draft recovery, book links to `#reading-journal`. |
| `/feed` | Redirect | Legacy route for feed. | Redirects to `/following`. |
| `/myreads` | Redirect | Legacy reader library route. | Redirects signed-in users to their profile; otherwise settings. |
| `/settings` | Authenticated | Account, auth, email change, privacy, import, export, API references, sessions, preferences. | Settings scripts, Goodreads import helpers, account APIs, shelf APIs. |
| `/welcome` | Authenticated | New-reader username setup. | Username validation/save API. |
| `/account/email/verify` | Public token route | Verifies pending email changes. | Account email-change table, email notices. |
| `/metrics` | Public with personal sections when signed in | Personal/community reading metrics, taste graph, charts, drill-down, comparison views. | ECharts, Neon aggregate queries, sample fallback. |
| `/mission` | Public | Product mission and principles. | Static Astro page. |
| `/roadmap` | Public | Current, next, later, and completed roadmap items. | `src/lib/roadmap`. |
| `/privacy` | Public | Privacy explanation. | Static Astro page. |
| `/support` | Public | Support project context. | Static Astro page. |
| `/discover` | Redirect | Legacy discovery route. | Redirects to `/`. |
| `/admin` | Admin | Admin overview and site statistics. | `resolveAdminSession`, `loadAdminOverviewStats`. |
| `/admin/collections` | Admin | Create, edit, reorder, publish, archive, and feature editorial collections. | `collections` helper, collection form, collection list. |
| `/admin/data-health` | Admin | Metadata, import, duplicate, backfill, page count, and publisher health. | Neon diagnostic queries. |
| `/admin/users` | Admin | Search users and delete users from list. | `searchAdminUsers`, `deleteAdminUser`. |
| `/admin/users/[username]` | Admin | User detail counts and delete-user flow. | `loadAdminUserDetail`, `deleteAdminUser`. |
| `/robots.txt` | Public | Robots directives. | Astro endpoint. |
| `/sitemap.xml` | Public | Sitemap. | Astro endpoint. |

## API Routes

| Route | Methods | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/auth/request-magic-link` | POST | Public | Create and send a magic sign-in link. |
| `/api/auth/verify` | GET | Public token route | Verify magic token and create session. |
| `/api/auth/me` | GET | Public | Return current auth state and user summary. |
| `/api/auth/logout` | POST | Public/session-aware | Revoke current session and clear cookie. |
| `/api/account/preferences` | GET, POST | Authenticated | Load/save settings stored in profile data. |
| `/api/account/sessions` | GET, POST | Authenticated | List active sessions; revoke other sessions. |
| `/api/account/email-change` | GET, POST | Authenticated | Load pending email change state; request/resend email change verification. |
| `/api/account/export` | GET | Authenticated | Export account profile and shelved books as JSON. |
| `/api/account/clear-shelf` | POST | Authenticated | Delete all default shelf entries for current user. |
| `/api/account/delete` | POST | Authenticated | Delete current user account and clear session. Not exposed by Settings UI. |
| `/api/books/search` | GET | Public | Search DogEared catalog, Google Books, Open Library, and published editorial collections; attaches local series metadata when available. |
| `/api/books/suggest` | GET | Public | Return Google Books suggestions for query text. |
| `/api/books/cover` | GET | Public | Proxy allowed Google Books cover URLs. |
| `/api/shelf/entries` | GET, POST, DELETE | Authenticated | Load, upsert, and remove default shelf entries. |
| `/api/shelf/rating` | PATCH | Authenticated | Save or clear rating for an existing shelf entry. |
| `/api/shelf/custom-shelves` | GET, POST, PATCH, DELETE | Authenticated | Manage custom shelves. |
| `/api/shelf/custom-shelf-books` | GET, POST, DELETE | Authenticated | Manage custom shelf book assignments. |
| `/api/shelf/section-order` | GET, POST | Authenticated | Load/save profile shelf section ordering. |
| `/api/journal/entries` | GET, POST, DELETE | Authenticated | Search/filter, create/update, and delete the current user's private journal entries. Book-linked entries require the reader to own the book. |
| `/api/activity/recent` | GET | Authenticated | Return recent activity for settings/security surfaces. |
| `/api/activity/like` | POST, DELETE | Authenticated | Like or unlike activity. |
| `/api/activity/comments` | GET, POST, DELETE | Authenticated | Load, create, or delete activity comments. |
| `/api/follow` | GET, POST, DELETE | Mixed | Read follow state; follow/unfollow when authenticated. |
| `/api/notifications/count` | GET | Session-aware | Return unread notification count for signed-in user, otherwise zero. |
| `/api/onboarding/status` | GET | Authenticated | Return onboarding completion state from shelf/rating/review counts. |
| `/api/profile/info` | GET, POST | Mixed | Read public/current profile info and save current user's profile info. |
| `/api/profile/username` | GET, POST | Authenticated | Validate and save username. |
| `/api/public/profile` | GET | Public/session-aware | Return public profile bundle by username. |
| `/api/public/shelf` | GET | Public/session-aware | Return public shelf summary when visible. |
| `/api/public/activity` | GET | Public/session-aware | Return public activity when visible. |
| `/api/home/reader-suggestions` | GET | Authenticated | Return suggested public readers. |
| `/api/lists/top` | GET | Public | Return top books by genre from shelf activity. |
| `/api/feedback` | POST | Public/session-aware | Submit feedback with rate limiting. |
| `/api/health` | GET | Public | Health payload and database connectivity check. |
