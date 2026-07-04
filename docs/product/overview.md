# Product Overview

DogEared is a calm social reading and book-tracking application. It helps readers save books, track reading progress, rate and review finished books, discover titles through reader activity, and maintain a long-term memory of their reading life.

DogEared is inspired by book communities and personal reading journals, but the current product avoids ad-driven social media patterns. The application is organized around books, authors, reader profiles, shelves, private journal entries, recent activity, and lightweight community interactions.

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

- Home: featured editorial collections, transparent community discovery sections, onboarding checklist, discovery jump links, reader suggestions, and custom shelf ideas.
- Search: book search backed by DogEared catalog results plus Google Books and Open Library, with series labels and editorial collection matches when available.
- Books: curated catalog views such as trending, most shelved, top rated, and recently active.
- Book detail: metadata, series context, synopsis, genres, topics, shelf controls, ratings, private journal entry controls for shelved books, reviews, and related activity.
- Authors: searchable and sortable author index.
- Author detail: author profile, editorial collections featuring the author, author books grouped by series where available, standalone books, and external author-book context.
- Editorial Collections: curated book lists with editorial introductions, book ordering, notes, quotes, and shelf controls.
- Profiles: public reader identity and current reading state, including profile card, notifications for the owner, bio, favorite book/author, concise reading goal summary, shelf summary, current reads, recent activity, and settings access.
- My Reading Life: private historical reflection across finished books, pages, streaks, goals, ratings, timeline, reading calendar, genre and author history, milestones, fun statistics, and yearly summaries.
- Reading Journal: private searchable notebook for what a reader was thinking while reading, including dated entries, optional book context, progress snapshots, page/chapter context, moods, and personal tags.
- Following: reader suggestions, current follows, and activity from followed readers.
- Metrics: personal and community reading analytics, taste graph, charts, drill-down exploration, and comparison views.
- Settings: profile/account entry points, magic-link auth, email changes, Goodreads import, preferences, privacy, notifications, data export, shelf clearing, API endpoint references, and sessions.
- Admin: operational overview, data health, user search, user detail, and admin delete-user tools.
- Mission, Roadmap, Privacy, Support: public product context and project direction.

## Current Information Architecture

DogEared separates the signed-in reader experience into three personal destinations with distinct jobs:

- Profile answers "Who am I as a reader?" It is identity plus current reading state, not a historical analytics page or a private notebook.
- My Reading Life answers "How has my reading changed over time?" It consolidates yearly progress, timeline, calendar, genre/author history, milestones, journey summaries, and fun statistics into one richer reflective area.
- Reading Journal answers "What was I thinking while reading?" It is private notebook space only, with no shelves, reading goal, profile information, or statistics.

The signed-in navigation under You is intentionally short: Profile, My Reading Life, Reading Journal, Settings, and Log Out. Following remains available as a community/discovery destination rather than part of the core personal IA.

## Major Workflows

- Account setup: request a magic link, verify it, set a username, then manage profile and settings.
- Book discovery: browse featured editorial collections, explainable home recommendations, search books with series context, open book pages, browse author pages, or explore related genre/topic/author/book pages.
- Shelfing: add a book to Want to Read, Currently Reading, Read, or a custom shelf; remove it from shelves when needed.
- Reading progress: update pages read for Currently Reading books, mark a book Read, and create progress activity.
- Reading reflection: review My Reading Life to understand completed books, pages, streaks, goal progress, calendar patterns, favorite genres/authors, timeline history, milestones, and yearly summaries.
- Private journaling: create, autosave, search, date-filter, book-filter, view, edit, and delete private journal entries from the Reading Journal page; create book-linked entries from a Currently Reading book page or after saving reading progress.
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

Books have catalog records with title, primary author, author link, ISBNs, Google Books ID, synopsis, cover, language, page count, publisher, published year, genres, topic tags, source records, and optional series membership. Books can be found through search, home sections, book lists, related pages, author pages, profile shelves, and activity.

### Series

DogEared supports first-class series metadata. A series can have a name, description, cover image, total-book count, ordered book entries, publication order, chronological order, and extensible metadata. Series entries can point to DogEared books or represent known missing titles with a title override.

When a book belongs to a series, the book page shows a dedicated Series section with the current book highlighted, ordered entries, completion state from the signed-in reader's shelves, and direct links to available books. If the signed-in reader has finished the current book and the next available book exists, DogEared shows a calm Continue the series callout with a one-click Add to Want to Read action unless the next book is already on a shelf.

Author pages group books by series when metadata exists and keep standalone books in a separate section. Search results show series labels such as series name and book number for catalog matches.

### Community Discovery

Home discovery is generated from transparent community activity, not an AI recommendation engine. A discovery service runs reusable providers for sections such as Community Favorites, Most Added This Week, Most Finished This Week, Trending Up, Hidden Gems, Recently Reviewed, and New Releases Readers Love. Each section explains why it exists, and each book card shows a concrete reason such as rating count, unique readers, recent finishes, activity growth, review length/reactions, or recent publication with strong activity.

If DogEared does not have enough data for a provider, that provider is hidden. If no provider has enough data, Home falls back to a simple Popular With Readers section when shelf activity exists, or a friendly empty state when it does not.

### Editorial Collections

DogEared supports first-class editorial collections for curated discovery that does not depend on popularity. Collections have title, slug, subtitle, description, editorial introduction, hero image, category, featured flag, publication state, sort order, and extensible metadata. Books inside collections have custom order, optional editor note, and optional featured quote.

Published collections appear on `/collections` and detail pages at `/collections/[slug]`. Collection pages use larger editorial presentation, a short editor's note, and book cards with covers, title, author, ratings, Add to Shelf controls, and the reason each book belongs. Home shows at most two featured collections so the page stays calm. Author pages show a Featured In section when published collections include that author, and Search returns matching published collections above book results.

Admins manage collections from `/admin/collections`, where they can create, edit, reorder, publish, archive, and feature collections.

### Authors

Authors have an index page, canonical author detail routes, optional bio/photo/source fields, reader and shelf counts, editorial collection references, and book lists. A legacy author query route redirects to the canonical author route.

### Profiles

Profiles show who a reader is and what they are reading now. They include reader identity, bio, favorite book and author, shelf counts, followers/following counts, a concise reading goal summary, notifications for the owner, custom shelves, current reads, recent activity, default shelf sections, and settings/profile edit access. Owners can edit profile information directly from their profile page.

### Shelves

The implemented default shelf statuses are Want to Read, Currently Reading, and Read. Readers can also create custom shelves with names, slugs, icons, ordering, renaming, and deletion. Assigning a book to a default shelf removes it from custom shelves; assigning to a custom shelf stores a separate custom shelf-book relation.

DNF is referenced in roadmap and filtered from imported Goodreads genre tags, but it is not currently a persisted default shelf status in the main shelf schema or shelf API.

### Reading Progress

Currently Reading books can store total pages, current page, finished date after completion, and progress events. Forward page progress creates `user_reading_progress_event` rows. Read books can store finished date and a short finished reflection.

### Momentum Score

Profile Currently Reading uses a supportive momentum model based on current page, total pages, days since update, days since start, and progress update count. Predictions are intentionally withheld when confidence or reading history is too low.

### Reading Streak

Profiles and metrics calculate reading streaks from recent reading/progress dates. The streak is a gentle continuity signal, not a leaderboard.

### Reading Goal

Profiles support an annual reading goal stored in profile data. The goal card shows completed books this year, percentage progress, remaining/beyond-goal count, and pace context.

### My Reading Life

My Reading Life is a private, authenticated page for reflecting on a reader's own history. It is intentionally personal rather than competitive. The page derives its view from existing shelf entries, finished dates, page counts, ratings, reading progress events, genres, authors, series metadata, and the reader's annual goal.

The area is organized as a richer reflective destination rather than many sparse pages. Overview covers yearly progress, goal progress, books finished, pages read, favorite genre, favorite author, and current pace. History covers the finished-book timeline, calendar, and milestones. Insights covers genres, authors, statistics, and fun facts. Journey covers yearly summaries prepared for future Year in Books experiences.

The Reading Timeline is part of My Reading Life's History area. It shows finished books chronologically with small covers, title, author, finish date, rating, and links back to books. The active timeline section supports year, month, and search filters.

The legacy `/reading-timeline` URL remains as a compatibility redirect to `/reading-life#timeline` so old links keep working.

Current limitations: My Reading Life and its timeline depend on recorded DogEared data. Finished-book timeline entries need usable finished dates or update dates, and rereads are not tracked separately because DogEared stores one default shelf entry per user/book.

### Reading Journal

DogEared supports a private Reading Journal for signed-in readers. A journal entry belongs to one reader and may optionally be linked to a shelved book. Entries store an optional title, required body, journal date/time, optional reading progress snapshot, optional page number, optional chapter/location, optional mood, personal tags, visibility metadata, and last-edited timestamps.

The private `/journal` page provides a prominent New Entry action, newest-first journal timeline, text search, book filtering, date filtering, pagination, local draft recovery, inline entry viewing, editing, and delete-with-confirmation controls. Entries created there can be general notes or linked to a shelved book.

On a book page, the Reading Journal section appears only when the signed-in reader has that exact DogEared book on a shelf. If the book is Currently Reading, the page offers a Write Journal Entry form with autosave draft recovery. The section also shows recent private entries for that book and links to the filtered journal view. After a reader saves forward progress on their profile, DogEared offers an optional prompt to write down anything worth remembering from that reading session.

Journal entries do not appear on public profiles, recent activity feeds, or public search. The journal is intentionally scoped to private note-taking.

Current limitations: journal visibility is stored with future states for friends, public, and shared entries, but the current UI and permission policy keep journal entries private to their owner.

### Reading Challenge

Public reading challenges are roadmap/future work. No active challenge workflow is currently implemented in the application.

### Recent Activity

Activity is created for shelf changes, finished updates, progress updates, and rating events. Activity appears on profiles, following feeds, book pages, settings security summaries, and public activity APIs when privacy allows.

### Reviews

Reviews are represented as finished-book reflections on `user_book`, optionally paired with a star rating. Reviews appear on book detail pages, profile activity, and admin review counts.

Recently Reviewed recommendations show a review excerpt, reviewer attribution when a username is available, the reviewer's rating when present, and a direct link to the anchored review card on the book page.

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

The Roadmap page groups product direction into Now, Next, Later, and recently completed work. It is maintained in `src/lib/roadmap.ts`.

### Search

Search queries DogEared catalog records first, then Google Books, then Open Library. Results are scored and deduplicated, and known catalog matches attach local book, author, and series metadata when available. Matching published editorial collections appear as a separate result group.

Private journal search is separate from public book search. Signed-in readers can search their own journal entries from `/journal`; those results are private and are not exposed through public search.

### Genre And Related Pages

Related pages support landing exploration plus specific `kind=genre`, `kind=topic`, `kind=author`, and `kind=book` views. Genre pages show books, reader counts, shelf counts, and related authors when available.

## Current Product Snapshot

Derived from the current repository structure and implementation:

- Major non-API page routes: 34 application/content routes plus `robots.txt` and `sitemap.xml`.
- API routes: 34 endpoint files.
- Admin pages: 5 routes.
- Redirect-only compatibility routes: `/discover`, `/feed`, `/myreads`, `/profile`, `/author`, `/reading-timeline`, and `/u/[username]`.
- Feature entries in `docs/product/features.md`: 68.
- Default persisted shelf statuses: 3 (`want_to_read`, `reading`, `finished`).
- Custom shelf icon options: 16.
- Current reading metrics: Momentum Score, Reading Streak, annual Reading Goal, My Reading Life overview, timeline history, timeline milestones, monthly timeline summaries, reading calendar, genre/author insights, fun statistics, yearly summaries, pages read windows, average pages per day, median finish days, top genre/topic, rating averages, percent rated, finish/completion rates.
- Community discovery providers: 7.
- Editorial collection publication states: 3 (`draft`, `published`, `archived`).
- Series ordering modes: book order, publication order, chronological order.
- Supported social/private interactions: follow, unfollow, like activity, unlike activity, comment, delete own comment, create/view/edit/delete/search/filter own journal entries.
- Supported catalog metadata types: editorial collections, series, genres, and topic tags.
- Supported import source in Settings: Goodreads CSV.
- Supported data export format in Settings: JSON.
