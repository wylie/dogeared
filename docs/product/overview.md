# Product Overview

DogEared is a calm social reading and book-tracking application. It helps readers save books, track reading progress, rate and review finished books, discover titles through reader activity, and maintain a long-term memory of their reading life.

DogEared is inspired by book communities and personal reading journals, but the current product avoids ad-driven social media patterns. The application is organized around books, authors, reader profiles, shelves, recent activity, and lightweight community interactions.

## Target Audience

DogEared is for readers who want a quieter alternative to high-noise book platforms:

- Readers who want to track what they want to read, are reading, and have finished.
- Readers who care about ratings, short reflections, and reading history.
- Readers who want discovery through books and people, not engagement algorithms.
- Readers who want privacy controls around profiles, activity, and location.
- Administrators maintaining catalog quality, user health, and import reliability.

## Core Goals

- Help readers find, save, read, finish, rate, and discuss books.
- Preserve a trustworthy long-term record of shelves, reviews, progress, and profile context.
- Surface discovery through books, authors, genres, topics, and readers.
- Keep community features useful but restrained.
- Keep operations visible through admin and metrics tools.

## Product Principles

- Reader first: reading, memory, and reflection matter more than activity volume.
- Calm by default: the product should not pressure readers to perform.
- Private by design: readers control profile visibility, location sharing, activity sharing, discovery, and follow availability.
- Reliable shelves: shelf state, ratings, reviews, and progress updates must be trustworthy.
- Thoughtful discovery: recommendations and related pages should come from catalog and reader context.

## Major Application Sections

- Home: transparent community discovery sections, onboarding checklist, discovery jump links, reader suggestions, and custom shelf ideas.
- Search: book search backed by DogEared catalog results plus Google Books and Open Library.
- Books: curated catalog views such as trending, most shelved, top rated, and recently active.
- Book detail: metadata, synopsis, genres, topics, shelf controls, ratings, reviews, and related activity.
- Authors: searchable and sortable author index.
- Author detail: author profile, author books in DogEared, and external author-book context.
- Profiles: public reader pages with about information, shelf summary, custom shelves, reading goal, current reads, activity, followers, and following.
- Following: reader suggestions, current follows, and activity from followed readers.
- Metrics: personal and community reading analytics, taste graph, charts, drill-down exploration, and comparison views.
- Settings: profile/account entry points, magic-link auth, email changes, Goodreads import, preferences, privacy, notifications, data export, shelf clearing, API endpoint references, and sessions.
- Admin: operational overview, data health, user search, user detail, and admin delete-user tools.
- Mission, Roadmap, Privacy, Support: public product context and project direction.

## Major Workflows

- Account setup: request a magic link, verify it, set a username, then manage profile and settings.
- Book discovery: browse explainable home recommendations, search books, open book pages, browse author pages, or explore related genre/topic/author/book pages.
- Shelfing: add a book to Want to Read, Currently Reading, Read, or a custom shelf; remove it from shelves when needed.
- Reading progress: update pages read for Currently Reading books, mark a book Read, and create progress activity.
- Reviews and ratings: rate finished books and optionally save a short finished reflection.
- Social reading: follow readers, view following activity, like activity, comment on activity, and receive activity notifications.
- Profile management: update name, avatar, location, birth year, goal text, favorite book, favorite author, blurb, and genres.
- Privacy management: set public/private profile visibility and control location, activity, discovery, and follow availability.
- Import/export: import Goodreads CSV data with preview/merge/replace controls, export account data as JSON, and clear shelf entries.
- Admin operations: inspect site statistics, metadata coverage, import health, duplicate risk, backfill movement, and user accounts.

## Current Capabilities

### Accounts

DogEared uses email magic links for sign-in. Sessions are stored server-side and can be reviewed or revoked from Settings. Email changes require verification at the new address and preserve reading history, shelves, ratings, reviews, follows, and notifications.

### Books

Books have catalog records with title, primary author, author link, ISBNs, Google Books ID, synopsis, cover, language, page count, publisher, published year, genres, topic tags, and source records. Books can be found through search, home sections, book lists, related pages, author pages, profile shelves, and activity.

### Community Discovery

Home discovery is generated from transparent community activity, not an AI recommendation engine. Reusable providers rank books into sections such as Community Favorites, Most Added This Week, Most Finished This Week, Trending Up, Hidden Gems, Recently Reviewed, and New Releases Readers Love. Each section explains why it exists, and each book card shows a concrete reason such as rating count, unique readers, recent finishes, activity growth, review length/reactions, or recent publication with strong activity.

If DogEared does not have enough data for a provider, that provider is hidden. If no provider has enough data, Home falls back to a simple Popular With Readers section when shelf activity exists, or a friendly empty state when it does not.

### Authors

Authors have an index page, canonical author detail routes, optional bio/photo/source fields, reader and shelf counts, and book lists. A legacy author query route redirects to the canonical author route.

### Profiles

Profiles show reader identity, shelf counts, followers/following counts, reading goal progress, notifications for the owner, custom shelves, recent activity, and default shelf sections. Owners can edit profile information directly from their profile page.

### Shelves

The implemented default shelf statuses are Want to Read, Currently Reading, and Read. Readers can also create custom shelves with names, slugs, icons, ordering, renaming, and deletion. Assigning a book to a default shelf removes it from custom shelves; assigning to a custom shelf stores a separate custom shelf-book relation.

DNF is referenced in roadmap/completed copy and filtered from imported Goodreads genre tags, but it is not currently a persisted default shelf status in the main shelf schema or shelf API.

### Reading Progress

Currently Reading books can store total pages, current page, finished date after completion, and progress events. Forward page progress creates `user_reading_progress_event` rows. Read books can store finished date and a short finished reflection.

### Momentum Score

Profile Currently Reading uses a supportive momentum model based on current page, total pages, days since update, days since start, and progress update count. Predictions are intentionally withheld when confidence or reading history is too low.

### Reading Streak

Profiles and metrics calculate reading streaks from recent reading/progress dates. The streak is a gentle continuity signal, not a leaderboard.

### Reading Goal

Profiles support an annual reading goal stored in profile data. The goal card shows completed books this year, percentage progress, remaining/beyond-goal count, and pace context.

### Reading Challenge

Public reading challenges are roadmap/future work. No active challenge workflow is currently implemented in the application.

### Recent Activity

Activity is created for shelf changes, finished updates, progress updates, and rating events. Activity appears on profiles, following feeds, book pages, settings security summaries, and public activity APIs when privacy allows.

### Reviews

Reviews are represented as finished-book reflections on `user_book`, optionally paired with a star rating. Reviews appear on book detail pages, profile activity, and admin review counts.

Recently Reviewed recommendations link directly to anchored review cards on the book page.

### Comments

Authenticated users can comment on activity. Comments are limited to 500 characters, can be loaded per activity, and can be deleted by their author.

### Likes

Authenticated users can like and unlike activity. Readers cannot like their own activity. Likes generate notifications for the activity owner.

### Following

Readers can follow and unfollow other public readers unless the target disables follow requests. Following drives the Following page activity feed and reader management list.

### Notifications

Notifications exist for activity likes and comments. Profile owners see a notifications section on their own profile and the API exposes unread count.

### Admin

Admins are recognized by username through `ADMIN_USERNAMES`. Admin pages include an overview, data-health view, user search, user detail, and delete-user controls. Admin pages redirect non-admins to home.

### Settings

Settings includes profile/account links, email change, magic-link auth, notifications preferences, privacy preferences, reading defaults, personalization preferences, Goodreads import, import controls, API endpoint references, JSON export, shelf clearing, and security/session controls. Self-service delete account is not exposed in Settings, even though a backend endpoint exists.

### Metrics

Metrics shows personal reading metrics for logged-in users and community metrics from aggregate data. It includes pages read, books added, reading streak, average pages per day, median finish days, top genres/topics, ratings, community momentum, taste graph, charts, drill-down explorer, and comparison views. If live metrics fail, the page falls back to sample data and states that in the UI.

### Mission

The Mission page explains the product vision: less noise, more memory, better taste, transparency, privacy, reader-first design, and community-led discovery.

### Roadmap

The Roadmap page groups product direction into Now, Next, Later, and recently completed work. Some roadmap copy may be aspirational or historical; implemented behavior should be verified against code before being treated as current capability.

### Search

Search queries DogEared catalog records first, then Google Books, then Open Library. Results are scored and deduplicated, and known catalog matches attach local book and author IDs.

### Genre And Related Pages

Related pages support landing exploration plus specific `kind=genre`, `kind=topic`, `kind=author`, and `kind=book` views. Genre pages show books, reader counts, shelf counts, and related authors when available.

## Current Product Snapshot

Derived from the current repository structure and implementation:

- Major non-API page routes: 28 application/content routes plus `robots.txt` and `sitemap.xml`.
- API routes: 33 endpoint files.
- Admin pages: 4 routes.
- Redirect-only compatibility routes: `/discover`, `/feed`, `/myreads`, `/profile`, `/author`, and `/u/[username]`.
- User-facing feature areas documented here: 42.
- Default persisted shelf statuses: 3 (`want_to_read`, `reading`, `finished`).
- Custom shelf icon options: 16.
- Current reading metrics: Momentum Score, Reading Streak, annual Reading Goal, pages read windows, average pages per day, median finish days, top genre/topic, rating averages, percent rated, finish/completion rates.
- Community discovery providers: 7.
- Supported social interactions: follow, unfollow, like activity, unlike activity, comment, delete own comment.
- Supported catalog metadata types: genres and topic tags.
- Supported import source in Settings: Goodreads CSV.
- Supported data export format in Settings: JSON.
