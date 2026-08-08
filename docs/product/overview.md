# Product Overview

DogEared is a calm social reading and book-tracking application. It helps readers save books, track reading progress, rate and review finished books, discover titles through reader activity, and maintain a long-term memory of their reading life.

DogEared is inspired by book communities and personal reading journals, but the current product avoids ad-driven social media patterns. The application is organized around literary works, editions, authors, reader profiles, shelves, private journal entries, recent activity, and lightweight community interactions.

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

- Home: Recommended For You, featured editorial collections when available, transparent community discovery sections, onboarding checklist, guided first-experience tips, discovery jump links, reader suggestions, and custom shelf ideas.
- Discover: explainable personalized and community-powered discovery for what to read next.
- Search: book search backed by DogEared catalog results plus Google Books and Open Library, with series labels and editorial collection matches when available.
- Books: curated catalog views such as trending, most shelved, top rated, and recently active.
- Book detail: metadata, series context, synopsis, genres, topics, shelf controls, ratings, Readers Also Enjoyed recommendations, private journal entry controls for shelved books, reviews, and related activity.
- Authors: searchable and sortable author index.
- Author detail: author profile, editorial collections featuring the author, and a bibliography grouped by series first, with standalone books only when no series relationship is known.
- Editorial Collections: curated book lists with editorial introductions, book ordering, notes, quotes, and shelf controls. Collection routes remain available, but Collections is hidden from primary navigation until there is useful published content to browse.
- Profiles: public reader identity and current reading state, including profile card, bio, favorite book/author, concise reading goal summary, shelf summary, public achievement badges, current reads, recent activity, and settings access.
- My Reading Life: private historical reflection across finished books, pages, streaks, goals, ratings, timeline, reading calendar, genre and author history, milestones, fun statistics, and yearly summaries.
- Reading Journal: private searchable notebook for what a reader was thinking while reading, including dated entries, optional book context, one optional reading position, moods, and personal tags.
- Following: reader suggestions, current follows, and activity from followed readers.
- Metrics: personal and community reading analytics, taste graph, charts, drill-down exploration, and comparison views.
- Notifications: dedicated low-noise notification center grouped by Today, This Week, and Earlier for meaningful community, reading, discovery, milestone, and system updates.
- Settings: profile/account entry points, magic-link auth, email changes, Goodreads import dashboard, preferences, privacy, notifications, Learning controls for helpful tips, data export, shelf clearing, API endpoint references, and sessions.
- Admin: operational overview, privacy-friendly product analytics, notification operations, Founding Reader access controls, release workflow, feedback dashboard, data health, user search, user detail, and admin delete-user tools.
- Mission, Roadmap, Release Notes, Privacy, Support: public product context, shipped changes, and project direction.

## Current Information Architecture

DogEared separates the signed-in reader experience into three personal destinations with distinct jobs:

- Profile answers "Who am I as a reader?" It is identity plus current reading state, not a historical analytics page or a private notebook.
- My Reading Life answers "How has my reading changed over time?" It consolidates yearly progress, timeline, calendar, genre/author history, milestones, journey summaries, and fun statistics into one richer reflective area.
- Reading Journal answers "What was I thinking while reading?" It is private notebook space only, with no shelves, reading goal, profile information, or statistics.

The signed-in navigation under You is intentionally short: Profile, My Reading Life, Reading Journal, Notifications, Settings, and Log Out. Following remains available as a community/discovery destination rather than part of the core personal IA.

## Major Workflows

- Account setup: request a magic link, verify it, set a username, then manage profile and settings.
- Book discovery: browse Recommended For You, Discover, featured editorial collections, explainable home recommendations, search books with series context, open book pages, browse author pages, or explore related genre/topic/author/book pages.
- Guided first experience: signed-in readers see one contextual, dismissible tip at a time when it is relevant, starting on Home for fresh users and continuing through Search, book shelves, reading progress, reviews, Settings, and Journal moments.
- Founding Reader first-time path: new readers move from access request or account creation to username setup, import or manual book search, first shelf save, progress update, recommendation feedback, first review, and return visits through Profile, Home, and Discover.
- Shelfing: add a book to Want to Read, Currently Reading, Read, or a custom shelf; remove it from shelves when needed.
- Reading progress: update pages read for Currently Reading books, mark a book Read, and record private progress events for metrics without noisy feed posts.
- Reading reflection: review My Reading Life to understand completed books, pages, streaks, goal progress, calendar patterns, favorite genres/authors, timeline history, milestones, and yearly summaries.
- Private journaling: create, autosave, search, date-filter, book-filter, view, edit, and delete private journal entries from the Reading Journal page; create book-linked entries from a Currently Reading book page or after saving reading progress.
- Reviews and ratings: finish a book through a rating plus optional public review flow, then edit or delete that review later.
- Social reading: follow readers, view following activity, like activity, comment on activity, and receive low-noise notifications.
- Profile management: update name, avatar, location, birth year, goal text, favorite book, favorite author, blurb, and genres.
- Privacy management: set public/private profile visibility and control location, activity, discovery, and follow availability.
- Import/export: import Goodreads CSV data with dashboard status, preview, duplicate explanations, merge/replace controls, reports, resumable failed syncs, export account data as JSON, and clear shelf entries.
- Admin operations: inspect site statistics, aggregate product analytics, Founding Reader access, releases, feedback and bug reports, metadata coverage, import health, duplicate risk, backfill movement, and user accounts.

## Current Capabilities

### Presentation Architecture

DogEared uses a small presentation component system so repeated concepts look and behave consistently:

- `BookCard` is the rich book presentation. Use it for surfaces where community context, descriptions, recommendation reasons, review actions, progress controls, or activity context are part of the reader decision: Discover, Search, Recommendations, Activity, Reviews, Currently Reading, and standalone author books.
- `CollectionBookCard` is the compact browsing presentation for a book inside a collection-like context. It wraps the compact `BookCard` variant and owns the denser cover, title, author, book-position, publication year, page count, rating, and shelf-action hierarchy. Use it for Series, Author-page series groups, editorial collection detail pages, related-book lists, reading lists, reading challenges, staff picks, award lists, and future Year in Review collections. Do not use it where descriptions, progress controls, review interactions, or recommendation feedback are the primary job.
- `SeriesSection` is the reusable series/list shell. It owns the `Series` eyebrow, title, supporting text, compact responsive grid, and current-book highlight style without adding a surrounding card or header cover. Use it for Book Detail, Author Detail, and future collection-like series/list modules instead of recreating section headers and grids.
- `AuthorSection` is the reusable author header. It owns author photo/placeholder, name, biography, source link, and statistic layout. Use it for author profile headers and future author-focused modules instead of page-local photo/bio/stat markup.

Presentation components should compose existing behavior components such as `ShelfDropdown` and `RatingControl` rather than rebuilding shelf, rating, or feedback logic.

### Accounts

DogEared uses email magic links for sign-in. Sessions are stored server-side and can be reviewed or revoked from Settings. Email changes require verification at the new address and preserve reading history, shelves, ratings, reviews, follows, and notifications.

### Works And Editions

DogEared treats the literary Work as the reader-facing catalog identity. A Work represents the intellectual book, such as `Project Hail Mary` or `The Fellowship of the Ring`, and owns title, canonical title, author, description, subjects, genres, series position, original publication year, preferred cover, and rating summary.

Canonical Work titles should contain only the published title. Series context belongs in structured series metadata, not appended parentheticals such as `(Wings of Fire, #5)` or `(Book 3)`, and edition context belongs on the Edition rather than the Work title. Import and cleanup flows may remove those suffixes only when the Work already has matching series name and book-number metadata.

Editions sit beneath a Work. An Edition stores precision metadata such as ISBN-10/ISBN-13, publisher, format, language, publication date, page count, edition cover, Open Library identifiers, Google Books ID, edition title, and other external IDs. Book search, recommendations, author pages, series, shelves, ratings, reviews, reading progress, activity, and Readers Also Enjoyed should resolve to the canonical Work so duplicate editions do not fragment the reader experience. Edition details appear only when useful, such as the Available Editions section on Work detail pages.

Legacy catalog rows are repaired through an idempotent Work/Edition backfill. That backfill uses the same canonical title rules as imports, attaches each compatibility `book` row to a canonical Work, creates an Edition for source-specific metadata, and preserves legacy unique source keys rather than overwriting them with duplicate Work keys.

DogEared detects potential duplicate Works with multiple signals: canonical title, author, structured series name and position, ISBNs, edition keys, external provider identifiers, and existing Work relationships. High-confidence duplicate candidates are shown in Admin Data Health for review with merge reasoning. Admins can merge or ignore suggestions; DogEared does not silently merge uncertain matches. A merge keeps the richer representative Work while preserving shelf assignments, ratings, reviews, reading progress, activity, journal entries, recommendation feedback, custom shelves, collection entries, source mappings, and editions.

Canonical Work normalization is repeatable and relationship-first. The normalization workflow attaches known-series metadata to legacy rows and their Works, safely removes redundant series suffixes from titles, repairs legacy Work keys, moves Edition rows beneath the corrected Work, removes resolved placeholder Series entries once a real catalog row exists, and automatically merges only high-confidence duplicate Works where structured series position, shared Work identity, or strong edition/provider evidence proves the records represent the same book. Duplicate editions remain attached beneath the surviving Work instead of appearing as separate reader-facing books.

### Canonical Catalog Migration

The Canonical Catalog Migration is the one-time data migration that brings legacy production rows into the Work -> Edition -> Series model. It runs through `migrate:canonical-catalog`, defaults to dry-run, and requires `--apply` before it mutates data. The migration reports Works before and after, duplicate Works merged, Editions attached, Series repairs, canonical search identity refresh, and remaining conflicts.

The migration process uses the same canonical resolution and duplicate scoring as Search, imports, metadata enrichment, duplicate cleanup, and Data Health. It repairs known-series metadata, normalizes redundant title suffixes only when structured series metadata proves they are duplicate context, repairs Work keys, attaches Editions beneath the surviving Work, moves reader-owned relationships to the canonical representative, rebuilds Series entries around canonical Works, refreshes Author relationships, and ensures the backing indexes used by Search target canonical `book` rows. It preserves shelves, ratings, reviews, reading progress events, activity, journal entries and notes, recommendation feedback, custom shelves, collection entries, source mappings, and Edition metadata before deleting obsolete duplicate compatibility rows.

The rollback strategy is operational rather than UI-based: run the dry-run report first, take a database backup or Neon branch snapshot, apply the migration in one controlled operation, then compare the report counts and Data Health conflicts. If counts or conflicts are unacceptable, roll back to the backup/snapshot rather than trying to recreate deleted duplicate rows by hand.

Duplicate prevention after migration is handled by canonical resolution before import or shelf creation. Search results, external metadata, Goodreads imports, and enrichment jobs resolve against existing Works by ISBN, provider IDs, source mappings, Edition keys, canonical title, author, structured series position, page count, publication year, and existing relationships. Only unresolved low-confidence records create new Works; incoming editions attach beneath existing Works.

The developer-only Catalog Audit tool is available through `catalog:audit`. It is read-only and generates a human-readable report of potential duplicate Works before another normalization or merge. The audit inspects every `book_work` row and compares ISBNs, ISBN-13s, authors, canonical titles, structured Series and Series positions, external provider IDs, Edition keys, source mappings, and existing Work relationships. Each duplicate group lists canonical title, Series, Series position, Work IDs, Edition IDs, ISBNs, external IDs, shelf/review/activity/reader/recommendation counts, and the reasons the records were grouped. Its summary reports total Works, total Editions, duplicate Work groups, duplicate Editions, Works missing Series, Works missing Covers, and Works missing Authors. The tool must not create, update, merge, or delete data.

### Canonical Catalog Cleanup

Canonical Catalog Cleanup is a targeted cleanup migration for duplicate `book_work` placeholders discovered by `catalog:audit`. It is not a merge engine. The cleanup only removes empty Work containers after finding a populated canonical Work in the same duplicate group and proving the duplicate has no reader-owned data. A dry run is available with `catalog:cleanup --dry-run`; `catalog:cleanup` applies the cleanup.

Placeholder Work detection requires a duplicate signal such as shared canonical title and author, shared structured Series position and author, shared ISBN, shared provider ID, shared Edition key, or shared compatibility Work key. Before deletion, the script reports Work ID, canonical Work ID, cleanup reason, relationship counts, and deletion eligibility. Safety checks require no shelves, readers, reviews, activity, reading progress events, journal entries or notes, recommendation feedback, custom shelf entries, representative books, Editions, Series entries, collection entries, or foreign-key references. If a Work only has non-reader Work-level references, those references are moved to the canonical Work and eligibility is checked again before deletion. If reader-owned data exists, the Work is skipped and the report lists exactly why it remains.

After applying cleanup, DogEared refreshes the canonical search backing indexes, rebuilds Series entries around canonical Works, and refreshes Author relationships. Rollback uses the same operational strategy as the canonical migration: run and save the dry-run report, take a database backup or Neon branch snapshot before applying, compare the post-cleanup audit, and restore from the snapshot if counts or remaining duplicate explanations are unacceptable.

Canonical Work resolution is the shared lookup engine for Search, shelf imports, metadata enrichment, duplicate cleanup, and admin merge tooling. Before DogEared creates a new catalog row, it scores existing Works using ISBN-10/ISBN-13, Google Books IDs, Open Library Work and Edition IDs, stored source mappings, Edition keys, canonical title, author, structured series name and position, compatible page count, compatible publication year, and existing Work relationships. Confident matches return the existing representative Work; incoming edition metadata is then attached under that Work instead of creating another reader-facing book.

Canonical Work keys preserve meaningful subtitle text. DogEared must not collapse real titles such as `Star Wars: The High Republic, Vol. 1: There Is No Fear` into a generic `Star Wars` Work. Edition-style suffixes such as hardcover, audiobook, Kindle, or deluxe edition belong on Editions and may be collapsed for display dedupe only when they are clearly edition labels.

The legacy `book` record remains a compatibility catalog row and representative display record while v1 migrates data into `book_work` and `book_edition`.

### Series

DogEared supports first-class series metadata. A series can have a name, description, cover image, total-book count, ordered Work entries, publication order, chronological order, and extensible metadata. Series entries point at canonical Works through their representative catalog row or represent known missing titles with a title override.

When a book belongs to a series, the book page shows a dedicated `SeriesSection` led by the series name, with "Series" treated as a small context label and the book count as supporting text. The section renders directly on the page without a white wrapper or cover thumbnail; the grid of books provides the visual grouping. Ordered entries render as `CollectionBookCard` items, keeping covers, title, author, one quiet book-position metadata line, published year, page count when available, rating context or "No ratings yet.", and the shared shelf action while allowing card height to follow the smaller content set. Compact Series cards use natural content height instead of equal-height dashboard rows and avoid descriptions, recommendation reasons, progress trackers, review actions, and redundant shelf status text. The current book is subtly highlighted through the card treatment rather than an extra badge. The full card grid is the primary browsing control, so the header stays focused on series identity instead of duplicating previous, next, or jump navigation. Book Detail resolves series from `series_book` first and falls back to canonical Work-level `book_work.series_id` metadata so a representative Work does not lose its series context. For recognized known-series titles that are visible as sparse external Book Detail pages before a local catalog row exists, Book Detail may render a read-only Series section from DogEared's persisted `series` and `series_book` placeholder metadata while keeping the current external title highlighted.

Series cards use DogEared's stored catalog metadata as the source of truth for covers. When a series entry is missing a cover, Book Detail schedules non-blocking metadata enrichment that first checks existing Work, Edition, book, and series-entry metadata, then tries Open Library, then Google Books. Successful covers are saved back to DogEared's catalog tables so later page loads use local metadata. No-cover and failed lookup attempts are cached before retrying, which avoids repeated external requests for titles that providers cannot resolve.

Author pages group books by structured series metadata from `series_book` and canonical Work fields, not by title parsing. Series headings include the word `Series` and can mix canonical DogEared Works with trusted external missing-title context in reading order. Catalog status is expressed through the card action, not through separate "in DogEared" and "not yet in DogEared" sections. A book is standalone only when no series relationship exists on its representative row, another edition row for the same Work, or the Work itself. Search results, discovery cards, recommendation cards, author cards, and book detail cards show concise series labels when metadata exists; inside a visible series group, cards use only the book-position label such as `Book 7` because the section heading already supplies the series name.

### Community Discovery

Home discovery is generated from transparent community activity, not an AI recommendation engine. A discovery service runs reusable providers for sections such as Community Favorites, Most Added This Week, Most Finished This Week, Trending Up, Hidden Gems, Recently Reviewed, and New Releases Readers Love. Each section explains why it exists, and each book card shows a concrete reason such as rating count, unique readers, recent finishes, activity growth, review length/reactions, or recent publication with strong activity.

If DogEared does not have enough data for a provider, that provider is hidden. If no provider has enough data, Home falls back to a simple Popular With Readers section when shelf activity exists, or a friendly empty state when it does not.

### Recommendations And Discover

DogEared supports explainable Recommendations & Discovery v1. Home shows Recommended For You above broader community sections. Signed-in recommendations use the reader's shelves, ratings, finished books, favorite genres, enjoyed authors, similar books, and community ratings. If personal data is limited, DogEared falls back to popular books and explains that adding, rating, and reviewing books improves recommendations.

Recommendation cards always explain why a Work appears, with reasons such as "Because you enjoyed..." or "Popular with Fantasy readers." Feedback controls are small rectangular secondary buttons: Interesting uses a subtle amber treatment, Hide uses neutral gray, and Add To Shelf remains the primary green action. Hidden recommendations store `not_interested` feedback per user and are excluded from future personal recommendations.

The `/discover` page collects Recommended For You plus community sections such as Trending Up, New Releases Readers Love, Hidden Gems, Most Finished, and Community Favorites. Work detail pages include Readers Also Enjoyed, based on shared readers, genres, and authors. Recommendation and discovery lists use canonical Works and collapse duplicate editions so readers normally see one logical book unless they intentionally browse editions. Recommendation feedback and future review sentiment are modeled as extension points, but the current system remains transparent and non-AI.

### Guided First Experience

DogEared includes a complete but optional first-run experience for signed-in readers. Instead of trapping readers in a wizard, Home can show a calm welcome card, a dismissible six-step checklist, a one-time yearly reading goal prompt, and short recommendation education. The checklist tracks adding a first book, updating progress, rating a book, writing a first journal note, following another reader, and exploring Discover.

Contextual tips are shown only when the reader's current route and state make them useful. DogEared shows at most one active tip, and each tip can be dismissed or completed. Guidance can appear for Home, Search, book detail shelf controls, adding a first book, Currently Reading progress, the first progress update, Reading Journal privacy, Discover recommendations, first finished book review guidance, and Settings. Progress is stored per user in Settings data so completed or dismissed tips do not reappear. Settings includes Learning controls to show helpful tips, reset guided tips, restart onboarding, and hide the onboarding checklist.

Journal-specific guidance is intentionally narrow. It appears on the Reading Journal page itself or after a reader has saved progress and may want to remember something from that reading session.

The onboarding state object lives under `profile_data.settings.guidedTour.onboarding`. It tracks welcome completion, checklist dismissal, reading goal prompt dismissal, recommendation education dismissal, completed onboarding actions, and celebrated milestones. Milestones use subtle success cards or existing toasts, not confetti.

### Founding Reader Launch Readiness

DogEared is prepared for its first Founding Readers with launch-readiness polish focused on reducing confusion rather than adding major functionality. First-time surfaces use clear language and recoverable error states across access requests, username setup, Search, Goodreads import, shelf saves, progress updates, recommendation feedback, reviews, and return visits. Reusable UI behavior should live inside shared components or client utilities whenever practical, so pages compose BookCard, ShelfDropdown, RatingControl, and shared shelf/progress helpers instead of recreating feedback markup, loading state, or retry behavior.

Founding Reader access is controlled by a global mode that can be changed from Admin without deployment:

- Open: anyone may request a magic link and create an account.
- Waitlist: readers can request access, but admins approve or invite them before account creation.
- Invite Only: DogEared explains that the community is growing carefully and records requests without immediate account creation.

Capacity management tracks current readers against a target. When automatic capacity management is enabled, Open behaves as Waitlist once the target is reached. Access configuration is stored in `founding_reader_config`; requests are stored in `founding_reader_waitlist` with Pending, Approved, Invited, Joined, and Declined states.

Empty states are expected to answer "What should I do next?" Owner views on Profile shelves, Recent Activity, Reading Goal, Search, and recommendation areas include direct CTAs such as adding a book, searching again, finding a book to start, or reviewing shelves after import. Success messages stay plain and calm, such as saved shelf, saved rating, progress saved, import complete, preferences saved, and export downloaded. Error messages avoid bare "Error" language and should tell readers what to retry or where to continue.

Launch polish keeps async feedback visible while work is in flight. Shelf saves, recommendation feedback, and progress updates should expose busy states through disabled controls, `aria-busy` where helpful, and live status messages that do not collapse card layout. Developer diagnostics may log failing progress requests, but normal successful use should not create console errors.

Mobile layout polish treats the small-screen interface as its own reading surface. Dense discovery sections use compact sticky section headers, horizontally scrollable no-wrap jump links, and single-row compressed navigation metadata where it reduces repeated vertical space. The mobile header avoids permanent status badges near the logo and leaves a small spacing break before page content so navigation and reading content feel distinct. Recommendation feedback buttons remain shared BookCard controls and must stay centered, single-line, and readable at common phone widths.

The launch-readiness stance is documented in `docs/beta-readiness.md`. Remaining early-access risks are mostly operational: real-device mobile QA, assistive-technology review, and centralized monitoring.

### Editorial Collections

DogEared supports first-class editorial collections for curated discovery that does not depend on popularity. Collections have title, slug, subtitle, description, editorial introduction, hero image, category, featured flag, publication state, sort order, and extensible metadata. Books inside collections have custom order, optional editor note, and optional featured quote.

Published collections appear on `/collections` and detail pages at `/collections/[slug]`. Collection pages use larger editorial presentation, a short editor's note, and `CollectionBookCard` entries with covers, title, author, ratings, Add to Shelf controls, and the reason each book belongs. Home shows at most two featured collections so the page stays calm. Author pages show a Featured In section when published collections include that author, and Search returns matching published collections above book results. The left navigation does not currently link to Collections because the early-access product should not send readers to an empty or sparse destination.

Admins manage collections from `/admin/collections`, where they can create, edit, reorder, publish, archive, and feature collections.

### Authors

Authors have an index page, canonical author detail routes, optional bio/photo/source fields, reader and shelf counts, editorial collection references, and book lists. A legacy author query route redirects to the canonical author route.

### Achievements

DogEared persists meaningful non-competitive reading achievements as profile badges. The shared achievement-definition registry stores the achievement key, type, title, description, icon identifier, accent color token, criteria, repeatability, and related Work or Series behavior. Earned achievements store the reader, definition, earned date, optional related Work or Series, optional repeat scope such as a year, visibility, and display metadata.

The same definition powers profile badges, notification icon and accent treatment, badge popovers, descriptions, backfill, and future listings. Initial achievements cover 7, 14, 30, 60, 100, and 365 day reading streaks, finishing every currently available book in a series, and the future-ready yearly reading goal badge. Achievements do not add points, rankings, leaderboards, or competitive scoring.

Achievement notifications are created only after the server verifies eligibility, persists the earned achievement, and links the notification metadata to the achievement definition and earned row. Notification Open actions deep-link to the profile header Achievements row and highlight the earned badge. Deleting a notification does not delete the achievement.

Profile badges use shared Material icon identifiers, achievement color tokens from DogEared's palette, and a reusable rounded stamp artwork treatment inspired by library stickers, bookplates, field notes, and passport stamps. Streak badges progress from greens through oranges into gold with tier-specific reading-rhythm icons. Series completion uses literary blues, and yearly reading goals use purple. Badges appear as collectible mini stickers near the bottom of the main profile header card, after identity, biography, details, and favorite genres. The header shows a limited preview with a compact more control for additional badges. Badge details show larger artwork, description, earned date, related Series or Work, and how the badge can be earned without exposing private reading-session history or incomplete progress.

Readers can show or hide all achievements on their public profile from Settings. Earned achievements default to public unless the reader hides the section. Historical backfill is handled by `npm run backfill:achievements`, which defaults to dry run, reports eligible users, proposed awards, existing conflicts, and only writes rows with `-- --apply`.

### Profiles

Profiles show who a reader is and what they are reading now. They include reader identity, bio, favorite book and author, shelf counts, followers/following counts, a concise reading goal summary, custom shelves, compact achievement badges inside the profile header card, current reads, recent activity, profile Reviews, default shelf sections, and settings/profile edit access. Owners can edit profile information directly from their profile page and reorder Reviews alongside shelf sections.

### Shelves

The implemented default shelf statuses are Want to Read, Currently Reading, and Read. Readers can also create custom shelves with names, slugs, icons, ordering, renaming, and deletion. Readers shelve Works, while DogEared may remember the selected Edition for precision. Assigning a Work to a default shelf removes it from custom shelves; assigning to a custom shelf stores a separate custom shelf-book relation that resolves to the representative Work row.

For existing DogEared Works, default shelf mutations take the local catalog path: they reuse the representative book, Work, and Edition IDs and skip optional metadata/enrichment/canonicalization work before responding. Import-style saves without a known `bookId` still go through canonical Work resolution so duplicate prevention and Edition relationships are preserved.

DNF is referenced in roadmap and filtered from imported Goodreads genre tags, but it is not currently a persisted default shelf status in the main shelf schema or shelf API.

### Reading Progress

Currently Reading Works can store total pages, current page, finished date after completion, and progress events. Edition metadata such as page count or audiobook format may inform calculations, but changing editions must not lose progress. The profile progress control uses a compact grouped selector for Page Number, Percentage, Chapter, Kindle Location, and Audiobook Time plus value, Save, and Finish actions. All input types normalize into the same canonical persisted field, `currentPage`, before the shelf API writes the update. Percentage input converts to `round(totalPages * percent / 100)` when total pages are known; percentage updates without a usable total-page count are rejected instead of silently saving zero progress. Forward page progress creates `user_reading_progress_event` rows for streaks, Reading Life, and momentum, but it does not create another Recent Activity shelf event. Read Works can store finished date, rating, and public review metadata.

### Momentum Score

Profile Currently Reading uses a supportive momentum model based on current page, total pages, days since update, days since start, and progress update count. Predictions are intentionally withheld when confidence or reading history is too low.

### Reading Streak

Profiles and metrics calculate reading streaks from recent reading/progress dates. The streak is a gentle continuity signal, not a leaderboard.

### Reading Goal

Profiles support an annual reading goal stored in profile data. Profile and My Reading Life use the same reading-goal helper to count finished books with finished dates in the current year, then show percentage progress, remaining/beyond-goal count, and pace context from that shared source.

### My Reading Life

My Reading Life is a private, authenticated page for reflecting on a reader's own history. It is intentionally personal rather than competitive. The page derives its view from existing shelf entries, finished dates, page counts, ratings, reading progress events, genres, authors, series metadata, and the reader's annual goal.

The area is organized as a richer reflective destination rather than many sparse pages. Overview covers yearly progress, goal progress, books finished, pages read, favorite genre, favorite author, and current pace. History covers the finished-book timeline, calendar, and milestones. Insights covers genres, authors, statistics, and fun facts. Journey covers yearly summaries prepared for future Year in Books experiences.

The Reading Timeline is part of My Reading Life's History area. It shows finished books chronologically with small covers, title, author, finish date, rating, and links back to books. The active timeline section supports year, month, and search filters.

The legacy `/reading-timeline` URL remains as a compatibility redirect to `/reading-life#timeline` so old links keep working.

Current limitations: My Reading Life and its timeline depend on recorded DogEared data. Finished-book timeline entries need usable finished dates or update dates, and rereads are not tracked separately because DogEared stores one default shelf entry per user/book.

### Reading Journal

DogEared supports a private Reading Journal for signed-in readers. A journal entry belongs to one reader and may optionally be linked to a shelved book. Entries store an optional title, required body, journal date/time, one optional reading position, optional mood, personal tags, visibility metadata, and last-edited timestamps. Reading position is stored as a type and value, such as Page 20, 58%, Chapter 4, Kindle location 1234, or Audiobook 1h 20m.

The private `/journal` page provides a prominent New Entry action, newest-first journal timeline, text search, searchable saved-book picker/filtering, date filtering, pagination, local draft recovery, inline entry viewing, editing, and delete-with-confirmation controls. Entries created there can be general notes or linked to a shelved book.

On a book page, the Reading Journal section appears only when the signed-in reader has that exact DogEared book on a shelf. If the book is Currently Reading, the page offers a Write Journal Entry form with autosave draft recovery. The section also shows recent private entries for that book and links to the filtered journal view. After a reader saves forward progress on their profile, DogEared offers a lightweight anchored coach-mark prompt to write down anything worth remembering from that reading session. The prompt attaches to the updated BookCard without changing card height or grid layout, and dismissal hides it for that book and position during the current browser session so it stays helpful rather than permanent.

Journal entries do not appear on public profiles, recent activity feeds, or public search. The journal is intentionally scoped to private note-taking.

Current limitations: journal visibility is stored with future states for friends, public, and shared entries, but the current UI and permission policy keep journal entries private to their owner.

### Reading Challenge

Public reading challenges are roadmap/future work. No active challenge workflow is currently implemented in the application.

### Recent Activity

Activity is created for meaningful public reading events: adding a book to Want to Read, starting a book, finishing a book, rating a book, and writing or updating a public review. Routine progress updates are stored as reading progress events for private metrics and do not create repeated "Started Reading" or "Added to Currently Reading" feed entries. Activity appears on profiles, following feeds, book pages, settings security summaries, and public activity APIs when privacy allows.

### Reviews

Reviews are public recommendations written after finishing a Work. Ratings and reviews belong to the Work, not to an individual Edition, so the same rating/review context appears regardless of whether a reader originally shelved a hardcover, ebook, audiobook, or paperback. They are represented on `user_book` with optional star rating, optional review title, review body, spoiler flag, and review update timestamp. The finish flow offers rating, optional review, and Finish; reviews are never required.

Book detail pages show aggregate rating context, recent reviews, spoiler labeling, collapsed long reviews, and an editor for the signed-in reader's own finished books. When that editor is visible, Book Detail does not show a duplicate "write review" CTA below it; the page moves into the community review state instead. Profiles include a Reviews section with latest reviews, sorting, spoiler filters, and the same owner reorder controls used by shelf sections. Reviews are distinct from Reading Journal entries: reviews are public recommendations after finishing, while journal entries are private notes while reading.

Recently Reviewed recommendations show a review excerpt, reviewer attribution when a username is available, the reviewer's rating when present, and a direct link to the anchored review card on the book page.

### Comments

Authenticated users can comment on activity. Comments are limited to 500 characters, can be loaded per activity, and can be deleted by their author. Comment success and error feedback is lightweight inline status text that appears only while a message is visible, so activity cards do not reserve extra vertical space in the common case.

### Likes

Authenticated users can like and unlike activity. Readers cannot like their own activity. Likes generate notifications for the activity owner.

### Following

Readers can follow and unfollow other public readers unless the target disables follow requests. Following drives the Following page activity feed and reader management list.

### Notifications

DogEared supports thoughtful in-app Notifications v1. Notifications are designed to be helpful, relevant, calm, and actionable; they should never be used as engagement bait or urgency-driven loops. The dedicated `/notifications` page is private, authenticated, and grouped into Today, This Week, and Earlier. Each notification includes an icon, title, short description, timestamp, read/unread state, and an optional action.

Supported v1 types include community notifications for follows, review likes, review comments, and comment replies; reading/milestone notifications for yearly goal completion, reading streak milestones, and finished series; discovery notifications for Want to Read books gaining reader interest and newly imported favorite-author books; and system/import notifications for completed imports. Current event generators create follow, like, comment, reply, reading goal, reading streak, and series completion notifications. Discovery and import types are modeled for scheduled/import jobs.

Notification actions include mark one as read, mark all as read, delete, and Open. Opening a notification marks it read before redirecting. Unread counts appear as a subtle badge in signed-in navigation and are cached through the count endpoint rather than polled aggressively.

Smart grouping uses a notification `group_key` and configurable window so bursts such as multiple review likes become a single grouped notification like "3 people liked your review." Settings includes in-app category preferences for Community, Reading, Discovery, Milestones, and System, while browser and email controls remain future-ready.

### Admin

Admins are recognized by username through `ADMIN_USERNAMES`. Admin pages include an overview, product analytics dashboard, notification operations dashboard, Founding Reader access controls, release management, feedback dashboard, data-health view, user search, user detail, and delete-user controls. Admin pages redirect non-admins to home.

The Founding Readers dashboard manages Open, Waitlist, and Invite Only access modes, target capacity, automatic Open-to-Waitlist behavior, waitlist approvals, invitations, declines, removals, and current reader review. The public experience should use Founding Reader language instead of "beta tester" language, because these readers are early collaborators rather than instability testers.

The Product Analytics dashboard is first-party and product-focused rather than marketing-focused. It records small aggregate events such as page views, feature views, search queries with result counts, recommendation impressions, recommendation clicks, recommendation feedback, and recommendation add-to-shelf intent. Admins see aggregate growth, reading, community, search, discovery, first-run funnel, and feature-adoption metrics. The dashboard does not show private journal content, passwords, reader-level behavioral reports, or unnecessary personal information.

The Feedback dashboard is the Founding Reader bug-reporting workflow. It stores user-submitted reports with tracking numbers, type, optional severity, subject, description, bug details, screenshots, diagnostic context, status, private internal notes, follow-up flags, duplicate markers, resolved version, and resolution dates. Diagnostic context is limited to page and environment details useful for debugging; private journal content, passwords, and sensitive personal information are intentionally excluded.

The Releases dashboard owns DogEared's release lifecycle. Admins create draft releases, edit version/title/summary/release date/highlights/bug fixes/known issues/migration notes, preview the reader-facing content, publish releases, and archive old notes. Published releases appear newest-first on `/release-notes`, feed the Roadmap's Recently Shipped section, and power the once-per-version What's New modal. Draft and archived releases are admin-only.

### Settings

Settings includes profile/account links, email change, magic-link auth, notifications preferences, Learning controls for guided tips, privacy preferences, reading defaults, personalization preferences, a Goodreads import dashboard, API endpoint references, JSON export, shelf clearing, and security/session controls. Self-service delete account is not exposed in Settings, even though a backend endpoint exists.

### Import Experience

DogEared's import experience is designed to be transparent and forgiving. The Settings Import Dashboard shows current import status, books imported, skipped rows, duplicates merged, missing metadata, series matches, import history, and recovery state.

Before writing shelf changes, readers can preview the Goodreads CSV. Preview explains how many books will import, which works already exist in DogEared, likely duplicate rows, possible series matches, estimated time, and books that may need metadata review. Duplicate resolution copy names the Existing Work, Imported Edition, and action, such as "Merged into existing work," so merges are never silent.

After import, DogEared shows an Import Report with books imported, works merged, series detected, metadata completed, covers prepared, books requiring review, skipped rows, sync failures, and shelf totals. Reports can be exported as JSON from the browser. If server sync fails after local planning, DogEared stores a browser-local recovery list and offers Resume Failed Sync instead of forcing the reader to restart from zero.

Admins review metadata quality from `/admin/data-health`, including potential duplicate Works, canonical title cleanup, missing covers, authors, descriptions, page counts, and likely series gaps. Duplicate Work review shows the proposed canonical Work, duplicate Work, confidence, and reasoning, then lets admins merge or ignore each suggestion. Reader imports should not be blocked on metadata cleanup.

### Metrics

Metrics shows personal reading metrics for logged-in users and community metrics from aggregate data. It includes pages read, books added, reading streak, average pages per day, median finish days, top genres/topics, ratings, community momentum, taste graph, charts, drill-down explorer, and comparison views. If live metrics fail, the page falls back to sample data and states that in the UI.

### Mission

The Mission page explains the product vision: less noise, more memory, better taste, transparency, privacy, reader-first design, and community-led discovery.

### Roadmap

The Roadmap page is a public communication page, not an internal planning surface. It should help readers understand that DogEared is actively improving while avoiding implementation details, ranking labels, timelines, percentages, or internal work-tracking language.

The public roadmap structure is:

- Current Version: DogEared Beta version, release month, and a Release Notes link.
- Building Now: a small set of active reader-facing improvements with "why it matters" copy.
- Recently Shipped: recent improvements automatically sourced from published Release Notes.
- Coming Next: the next major areas of product direction without dates or promises.
- Looking Ahead: aspirational long-term ideas that fit DogEared's reader-first direction.
- Help Shape DogEared: Founding Reader messaging and a feedback CTA.

Future direction is maintained in `src/lib/roadmap.ts`. Recently Shipped is sourced from release notes so shipped work is not duplicated by hand. Roadmap copy should focus on reader outcomes, such as "Stay connected to meaningful reading activity without unnecessary noise," rather than implementation language.

Founding Reader messaging should explain that DogEared is shaped by a small reader community and that bug reports, feature suggestions, and conversations directly influence what gets built next.

### Release Notes

Release Notes live at `/release-notes`. They help Founding Readers understand what is new, what was fixed, what known issues remain, and where the roadmap is heading next. Each Release stores version, title, summary, release date, publication state, highlights, bug fixes, known issues, and optional migration notes.

Versioning follows DogEared's package/app version where practical, with release versions displayed in the footer as `DogEared Beta` plus the current published release version. The footer version links to `/release-notes`. When a new published release is deployed, DogEared shows readers a lightweight What's New modal once for that version and stores the dismissal locally so the same release does not reappear.

### Search

Search is local-first. DogEared catalog records and matching published editorial collections are returned before Google Books, Open Library, metadata enrichment, cover enrichment, or external canonicalization work. Local catalog matches reuse existing Work, Edition, author, cover, and series metadata directly; they do not run through external provider lookup just to render a known Work.

External search is progressive. When provider results are needed, Google Books and Open Library run concurrently from normalized query variants, short-lived public caches avoid duplicate provider work for identical public queries, and external results still pass through the shared canonical Work resolver before they are rendered or saved. Provider caches and resolved external-result caches are keyed by normalized query inputs and pagination only; reader-specific shelf state is not cached as shared public data and is applied from the current reader's shelf data when cards render.

The Search page renders DogEared results first, then appends non-duplicate external matches as they arrive. Client-side search requests use abort/request identifiers so older responses cannot replace newer queries, while the existing inline spinner and visible query text remain stable.

Private journal search is separate from public book search. Signed-in readers can search their own journal entries from `/journal`; those results are private and are not exposed through public search.

### Genre And Related Pages

Related pages support landing exploration plus specific `kind=genre`, `kind=topic`, `kind=author`, and `kind=book` views. Genre pages show books, reader counts, shelf counts, and related authors when available.

## Current Product Snapshot

Derived from the current repository structure and implementation:

- Major non-API page routes: 35 application/content routes plus `robots.txt` and `sitemap.xml`.
- API routes: 36 endpoint files.
- Admin pages: 5 routes.
- Redirect-only compatibility routes: `/feed`, `/myreads`, `/profile`, `/author`, `/reading-timeline`, and `/u/[username]`.
- Feature entries in `docs/product/features.md`: 72.
- Default persisted shelf statuses: 3 (`want_to_read`, `reading`, `finished`).
- Custom shelf icon options: 16.
- Current reading metrics: Momentum Score, Reading Streak, annual Reading Goal, My Reading Life overview, timeline history, timeline milestones, monthly timeline summaries, reading calendar, genre/author insights, fun statistics, yearly summaries, pages read windows, average pages per day, median finish days, top genre/topic, rating averages, percent rated, finish/completion rates.
- Community discovery providers: 7.
- Editorial collection publication states: 3 (`draft`, `published`, `archived`).
- Series ordering modes: book order, publication order, chronological order.
- Supported social/private interactions: follow, unfollow, like activity, unlike activity, comment, delete own comment, create/view/edit/delete/search/filter own journal entries, mark recommendations Interesting or hide them, dismiss/complete/reset guided tips.
- Supported catalog metadata types: editorial collections, series, genres, and topic tags.
- Supported import source in Settings: Goodreads CSV.
- Supported data export format in Settings: JSON.
