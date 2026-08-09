# Features

Status values:

- Complete: implemented and exposed in the current product.
- Beta: implemented but still visibly evolving or dependent on partial data.
- Experimental: implemented as a limited or fallback experience.
- Planned: referenced in UI/roadmap or implied by disabled controls, but not currently exposed as a working user workflow.

## Account And Authentication

### Magic Link Sign-In

Status: Complete

Readers sign in with an email magic link. Magic links expire, are rate-limited, and create server-side sessions.

Limitations: No password login is available.

### Username Setup

Status: Complete

New readers set a username on `/welcome`. Usernames are validated before saving and become the basis for profile URLs.

Limitations: A reader without a username is redirected to account/profile setup surfaces.

### Session Management

Status: Complete

Settings shows active sessions and allows revoking other sessions.

Limitations: The session list labels sessions by hash prefix rather than device details.

### Email Change

Status: Complete

Readers can request an email change, verify the new email, and keep their reading history attached to the account.

Limitations: Verification depends on email delivery. Preview links may be shown in local/development-style configurations.

### Self-Service Account Deletion UI

Status: Planned

Settings shows Delete Account as future account management and disables it.

Limitations: A backend `/api/account/delete` endpoint exists, but the Settings UI does not expose it as a completed workflow.

## Profiles And Identity

### Public Reader Profile

Status: Complete

Profiles show reader identity, shelf summary, reading goal, shelves, custom shelves, recent activity, followers, and following counts.

Profiles are the "Who am I as a reader?" surface, so the owner experience stays focused on profile card, bio, favorite book/author, concise reading goal summary, shelf summary, currently reading, recent activity, and settings access. Notifications live in the dedicated notification center.

Profile rendering loads privacy-critical profile data first, then runs independent shelf/activity/goal/achievement/review/navigation reads concurrently where correctness allows. Profile GET requests reuse request-scoped session data and avoid blocking on schema/index setup that is not required to render an already-deployed database. Admin Performance records `page.profile` spans for authentication/session, user/profile lookup, follower/following counts, shelf summary, current reads, momentum/streak, recent activity, finished books, reading goal, reviews/preparation, achievements, viewer shelf state, custom shelves, favorite links, and shared navigation/sidebar data.

Limitations: Private profiles are hidden from non-owners. Private journal entries are intentionally not shown on profiles.

### Profile Editing

Status: Complete

Owners can edit name, avatar, location, birth year, reading goal text, favorite book, favorite author, blurb, and genres from their profile.

Limitations: Avatar storage accepts data image or URL values in profile data; there is no dedicated media upload service documented in code.

### Profile Privacy

Status: Complete

Readers can set profiles public or private and control location sharing, activity sharing, discovery visibility, follow availability, and whether earned achievements appear on the public profile.

Limitations: Privacy settings are stored inside `profile_data.settings`, not a standalone table.

### Profile Achievements

Status: Complete

Readers earn persistent achievement badges for meaningful, non-competitive reading milestones. Initial badges cover 7, 14, 30, 60, 100, and 365 day reading streaks plus finishing every currently available book in a series. The registry also includes a future-ready yearly reading goal badge so goal milestones can use the same badge system. Badges appear near the bottom of the main profile header card on the owner profile and, when public achievement visibility is enabled, on public profiles viewed by other readers. The header shows a compact preview row and a small more control when additional badges exist.

Each achievement comes from the shared achievement-definition registry, which owns the key, type, title, description, icon identifier, accent color token, criteria, repeatability, and related Series or Work behavior. The same definition powers the profile badge, badge detail popover, notification icon, notification accent, notification title, notification description, and historical backfill. Earned achievements include an optional repeat scope key for badges such as yearly goals. Badge visuals use reusable rounded stamp artwork: streak tiers move from greens through oranges into gold with distinct icons, series completion uses blues, and yearly goals use purple. Badge details explain how the achievement can be earned without exposing private journal entries, exact reading-session history, or incomplete progress.

Limitations: Current controls support showing all earned achievements or hiding all achievements publicly. Per-badge visibility is stored in the earned achievement model for future use but is not yet exposed as a separate profile control.

### Followers Page

Status: Complete

Profiles expose a paginated followers list with search and recent/name sorting.

Limitations: There is no separate following list route for another user's following list; `/following` is the viewer's management/feed page.

## Books And Catalog

### Canonical Works And Editions

Status: Complete

DogEared uses a Work -> Edition catalog model. Reader-facing surfaces resolve to a canonical Work so shelves, ratings, reviews, reading progress, recommendations, search, author pages, series, activity, and Readers Also Enjoyed do not duplicate hardcover, paperback, ebook, audiobook, translated, or publisher-specific editions.

Canonical Work titles store the published title only. Series suffixes and edition labels are normalized into structured series and edition metadata instead of being appended to Work titles, and cleanup only strips parentheticals when structured metadata proves they are redundant.

Editions remain available for precision metadata such as ISBN, publisher, format, language, publication date, page count, cover, edition title, Open Library IDs, Google Books ID, and external source IDs. Work detail pages show an Available Editions section only when more than one edition is known.

Potential duplicate Works are detected with confidence scoring across canonical title, author, structured series position, ISBNs, edition keys, provider identifiers, and existing Work relationships. Admins review high-confidence suggestions in Data Health and may merge or ignore them. Approved merges preserve reader-owned data, activity, recommendations, custom shelves, journal entries, collection entries, source mappings, and editions; uncertain matches are never silently merged.

Legacy catalog rows are backfilled idempotently into `book_work` and `book_edition` using the same canonical title rules as imports. The backfill attaches every compatibility `book` row to a Work and creates an Edition without overwriting legacy unique source keys on `book.canonical_work_key`.

Canonical Work resolution now runs before Search or shelf imports create catalog entries. The resolver scores ISBNs, Google Books IDs, Open Library Work and Edition IDs, stored `book_source` mappings, Edition keys, canonical title and author, structured series position, page count, publication year, and existing relationships. A sufficiently confident match returns the existing DogEared Work and attaches any incoming edition metadata beneath it. New Works are created only when no confident canonical match exists.

Canonical Work normalization can be run as a repeatable admin/task workflow. It first attaches known-series metadata to legacy rows and canonical Works, removes resolved placeholder Series rows, repairs legacy Work keys, moves Edition rows beneath the corrected Work, then runs safe title cleanup and merges only high-confidence duplicate Works where structured series position, shared Work identity, ISBN, edition key, provider ID, or redundant-title evidence proves equivalence. This repairs relationships instead of hiding duplicate records in individual UI surfaces.

Canonical Catalog Migration is the production data repair path for legacy rows created before Works, Editions, Authors, and Series were normalized. The `migrate:canonical-catalog` task defaults to dry-run and only applies changes with `--apply`. It identifies duplicate Works, chooses the canonical representative with the shared resolver/scoring rules, moves Editions and reader-owned data to that representative, deletes obsolete duplicate compatibility rows, rebuilds Series entries around canonical Works, refreshes Author relationships, and refreshes the canonical Search backing indexes. The report includes Works before/after, duplicate Works merged, Editions attached, Series repaired, Search index status, and conflicts remaining. Rollback relies on a database backup or Neon branch snapshot taken before `--apply`; duplicate prevention afterward comes from running canonical resolution before every Search/import/enrichment path creates a new Work.

The developer-only `catalog:audit` task is a read-only inspection report for planning catalog cleanup. It scans every Work, groups potential duplicates by ISBN, ISBN-13, author, canonical title, structured Series and Series position, provider IDs, Edition keys, source mappings, and existing Work relationships, then prints the Work IDs, Edition IDs, metadata, reader counts, shelf counts, review counts, activity counts, recommendation counts, and duplicate rationale for each group. The summary includes total Works, total Editions, duplicate Work groups, duplicate Editions, Works missing Series, Works missing Covers, and Works missing Authors. It is explicitly non-mutating and should be run before normalization or merge work.

Canonical Catalog Cleanup is the targeted follow-up for empty duplicate Work placeholders found by `catalog:audit`. The `catalog:cleanup --dry-run` report lists the placeholder Work ID, canonical Work ID, cleanup reason, relationships found, and deletion eligibility. The applying `catalog:cleanup` task only deletes Works after proving no shelves, readers, reviews, activity, reading history, journal entries, recommendations, representative books, Editions, Series entries, collection entries, or foreign-key references remain. It may move non-reader Work-level references to the canonical Work, then re-check eligibility before deletion. It rebuilds canonical search indexes, Series relationships, and Author relationships after cleanup. Rollback requires a database backup or Neon branch snapshot before applying.

Canonical Work identity preserves meaningful subtitle text. Titles like `Star Wars: The High Republic, Vol. 1: There Is No Fear` and `Minecraft: The Island` are distinct Works, not generic `Star Wars` or `Minecraft` records. Edition labels may still collapse for display dedupe when the suffix is clearly edition metadata rather than part of the published title.

Limitations: v1 keeps the existing `book` table as a compatibility representative for routes and older relationships while new `book_work` and `book_edition` records carry the canonical model.

### Recommended For You

Status: Complete

Home shows personalized, explainable recommendations. Signed-in recommendations use saved Works, ratings, completed Works, favorite genres, enjoyed authors, similar-Work genre overlap, and community ratings. If DogEared has limited personal data, the section falls back to popular Works.

Every recommendation includes a visible reason. Readers can mark recommendations Interesting or Hide them through small rectangular secondary buttons; Interesting uses a subtle amber treatment, Hide uses neutral gray, and Add To Shelf remains the primary green action. Hidden recommendations store `not_interested` feedback per user and are excluded from future personal results.

Limitations: Review sentiment is future-ready but not currently scored. Recommendations are transparent heuristics, not an AI engine.

### Discover Page

Status: Complete

`/discover` gathers Recommended For You and community discovery sections such as Trending Up, New Releases Readers Love, Hidden Gems, Most Finished, and Community Favorites.

Limitations: Award winners and staff picks are future extension points through editorial collections or additional providers; they are not fabricated when no data exists.

### Book Search

Status: Complete

Search returns DogEared catalog and matching editorial collection results first, then progressively adds Google Books and Open Library matches when external providers are needed. Known DogEared catalog matches reuse existing Work, Edition, author, cover, and series metadata immediately instead of waiting for provider lookup or optional enrichment.

External provider calls run concurrently from normalized query variants and use short-lived public caches keyed by normalized provider, query inputs, and pagination. The Search page requests Google Books and Open Library independently so a faster provider can append matches without waiting for a slower one. External results use a bounded, batched canonical Work detector before rendering; it checks stable provider IDs, ISBNs, Edition keys, canonical Work keys, and exact series signals, then scores only the returned DogEared candidates. Import-level fuzzy matching, Work creation, Edition creation, enrichment, and canonical backfill are deferred until a reader shelves/imports an unresolved external book. If a provider returns a book already in DogEared, Search returns the existing Work with DogEared community context, reader counts, rating context, series metadata, and the standard ShelfButton instead of exposing a duplicate imported record. User-specific shelf state is applied separately from current reader data and is not cached as public search data.

The Search page appends external matches without duplicate cards and ignores stale responses when the query changes. It propagates request abort signals into provider fetches so abandoned stale searches can stop external work early where supported. Search does not run canonical Work/Edition backfill inside a reader search request; external results attempt canonical matching against existing Work data within a strict timeout and return as unresolved partial matches if the canonical step times out. Search performance telemetry records spans for local catalog search, Google Books, Open Library, metadata preparation, dedupe, canonical Work matching, canonical candidate preparation, identifier matching, ISBN matching, edition lookup, normalized title matching, series matching, existing Work lookup, candidate scoring, result merge, rendering preparation, timeout counts, retry count, DB query count, candidate comparison count, canonical candidate count, and resolved-canonical count, which are visible in Admin Performance breakdowns and slow-operation rows. Users can add search results to shelves, catalog matches show series name/book number when available, and matching editorial collections appear above book results.

Internal page navigation is progressively enhanced rather than converted into a single-page app. Astro's client router runs from the shared layout so same-origin links and GET forms can avoid full document reloads, preserve browser history, and keep direct SSR URL loads intact. Slow route swaps show a small delayed top progress bar instead of a global spinner. User-specific navigation data, including unread notification counts and shelf state rendered in cards, remains current-reader data and is not stored in shared public caches.

Limitations: External APIs can fail or return incomplete metadata.

### Book Detail Page

Status: Complete

Book pages represent the Work. They show metadata, cover, synopsis, author link, series context, genres, topics, shelf controls, ratings, reviews, activity, and a lightweight Available Editions section when more than one edition is known.

Limitations: If a book is not in DogEared, the page may resolve from Google Books/Open Library query parameters and may have sparse metadata.

### Shared Page Metadata

Status: Complete

All reader-facing and admin HTML pages inherit baseline metadata through the shared layout metadata builder. The baseline includes favicon links, Apple touch icon, web manifest, theme color, viewport, canonical URL, robots directive, title branding, description, Open Graph metadata, Twitter Card metadata, and site-level JSON-LD. Individual pages provide only page-specific values such as title, description, canonical path, social image, robots policy, and optional structured data.

Limitations: Redirect-only compatibility routes do not render full HTML metadata because they immediately forward readers to canonical pages.

### Presentation Architecture

Status: Complete

DogEared uses four primary presentation components for repeated reader-facing layouts. `BookCard` is the rich book surface for Discover, Search, Recommendations, Activity, Reviews, Currently Reading, and standalone book contexts where descriptions, progress, review, recommendation, or community detail matter. `CollectionBookCard` is the compact book surface for Series, Author-page series groups, Collections, Reading Lists, Related Books, Reading Challenges, staff picks, award lists, and other browseable book groupings. `SeriesSection` owns the reusable series/list header, supporting metadata, responsive compact grid, and current-book highlight without adding a surrounding card or header cover. `AuthorSection` owns author photo, biography, statistics, and links.

Pages should compose these components with behavior primitives such as `ShelfDropdown`, `RatingControl`, and shared client helpers. New book-list or author surfaces should choose the existing presentation component that matches the job instead of creating page-local card, header, or grid markup.

Limitations: Some legacy rich book surfaces still pass page-specific slots into `BookCard`; v1 standardizes the major repeated presentation shells without removing every local slot.

### Series Support

Status: Complete

DogEared stores first-class series records with name, optional description, optional cover, total-book count, ordered Work entries, publication order, chronological order, and extensible metadata. Book Detail and Author pages use the same reusable `SeriesSection` presentation: a small `Series` eyebrow, the series name as the primary heading, supporting book-count text such as `3 books`, and a responsive `CollectionBookCard` grid. The section renders directly on the page without a white wrapper or header cover thumbnail, so the books themselves provide the visual grouping. Book Detail highlights the current Work through the card treatment; Author pages do not highlight a current Work and append `Series` to each series heading. The compact card keeps the standard BookCard architecture while removing unnecessary inherited height for denser collection-style lists. Series cards avoid repeating the surrounding series name; each card shows the book position once as supporting metadata, then published year, page count when available, and average rating or "No ratings yet." as lightweight decision context. They intentionally omit descriptions, recommendation reasons, progress trackers, review actions, and redundant shelf status text. Missing-title placeholders, links to available Works, and the shared shelf action appear on every entry. The grid itself is the browsing surface, so Book Detail does not add separate previous, next, or jump controls above it. Search results, discovery cards, recommendation cards, author cards, and book detail cards display concise series labels where metadata exists. If a known-series title is being shown from external lookup before it has a DogEared catalog row, Book Detail can still render the persisted placeholder series list and highlight the current external title.

Series membership belongs to the canonical Work, not an Edition. Catalog imports attach known-series metadata during shelf creation, search infers labels for known series before a book is saved, and the known-series backfill migration populates existing catalog rows and placeholder series entries for Harry Potter, The Lord of the Rings, The Empyrean, Shadow and Bone, Six of Crows, Wings of Fire, A Series of Unfortunate Events, and Mistborn. Book Detail also performs a best-effort known-series attachment for recognized Works and resolves display context from `series_book` or canonical Work-level series fields. Canonical titles do not duplicate that context: when a title has a trailing parenthetical series suffix, DogEared strips it only if the structured series name and book order already match the suffix. When source metadata is incomplete and no known-series rule matches, the Work remains standalone until DogEared receives reliable series metadata.

Series cover enrichment is metadata-layer work, not BookCard behavior. If a Series BookCard lacks a cover, Book Detail schedules a bounded background enrichment pass. The enrichment workflow checks existing DogEared book, Work, Edition, and series-entry metadata first, then Open Library, then Google Books. The first valid cover is persisted locally on the relevant catalog records and reused on subsequent page loads. Negative lookups are cached for 30 days and transient failures for 1 day so DogEared does not repeatedly call external providers for unresolved titles.

### Books Index

Status: Complete

The Books page presents curated catalog sections such as trending, most shelved, top rated, and recently active books.

Limitations: These sections depend on existing catalog and shelf activity.

### Author Index

Status: Complete

Readers can browse, search, filter, sort, and page through authors.

Limitations: Author quality depends on catalog and backfill data.

### Author Detail Page

Status: Complete

Author pages show author metadata through `AuthorSection`, reader/shelf counts, editorial collections featuring the author, and a bibliography organized around what the author has written. Series sections are the primary grouping, reuse the shared Series section presentation from Book Detail, append `Series` to their headings, and mix DogEared Works with known missing titles in reading order. Series entries render as `CollectionBookCard` items with standard shelf controls; Standalone Books is the only non-series grouping and remains a full BookCard grid sorted by publication date. Grouping uses structured series metadata from the exact representative row, another edition row for the same Work, canonical Work fields, or trusted known-series inference for external missing titles. A title is treated as standalone only when no structured or trusted series relationship exists.

Limitations: Author bio and photo may be missing.

### Cover Proxy

Status: Complete

The cover API proxies valid Google Books cover URLs.

Limitations: It only accepts normalized Google Books cover URLs.

## Shelves And Reading State

### Default Shelves

Status: Complete

Readers can save Works as Want to Read, Currently Reading, or Read. DogEared may retain the chosen Edition internally, but shelf lists should not show duplicate editions of the same Work.

Shelf mutations for existing DogEared catalog Works use the known representative book, Work, and Edition IDs. The shelf API does not wait for external metadata lookup, author enrichment, cover enrichment, genre inference, series cleanup, or redundant canonical resolution before confirming an existing-Work shelf save. It persists the previous-state read and `user_book` write in one authoritative statement, batches default/custom shelf reconciliation with activity/progress writes, and returns the persisted shelf row as the response state. Required finished-book milestone checks remain on the response path; reading-streak checks run only when the mutation records new forward progress.

Limitations: Only these three statuses are persisted in `user_book.status`.

### Custom Shelves

Status: Complete

Readers can create custom shelves, choose icons, rename shelves, reorder shelves, delete shelves, and assign books to custom shelves.

Limitations: Custom shelves are separate from default shelf status. Assigning a default shelf removes the book from custom shelves.

### Shelf Removal

Status: Complete

Readers can remove books from default and custom shelves.

Limitations: Activity history may remain even after a shelf entry is removed.

### Shelf Section Ordering

Status: Complete

Profile shelf sections and the profile Reviews section can be reordered and saved through the section-order API.

Limitations: Ordering applies to profile content sections, not global navigation.

### DNF Shelf

Status: Planned

DNF appears in roadmap copy and Goodreads import filtering, but the current persisted shelf model does not expose DNF as a shelf status.

Limitations: DNF imports map to Want to Read unless a different implemented status is provided.

## Reading Progress And Reflection

### Reading Progress Updates

Status: Complete

Currently Reading Works can store total pages and current page. Edition metadata may influence progress calculations, but progress belongs to the Work and must survive edition changes. The profile update control uses a compact grouped selector for Page Number, Percentage, Chapter, Kindle Location, and Audiobook Time so the interaction matches journal reading positions without overflowing book cards. Every progress input now flows through a shared canonical normalizer before save: page numbers persist directly, percentages convert into `currentPage`, and the remaining input types still resolve into the same canonical page field used by the rest of the app. Non-finish progress saves use `/api/reading/progress`, a narrow existing-Work path that updates `user_book`, records forward progress history when needed, runs required milestone checks, and returns the authoritative saved progress, momentum score, streak, and guidance text. This path does not wait on shelf mutation work, external metadata lookup, cover enrichment, redundant canonical resolution, or broad profile refreshes. After the first successful nonzero progress update, the card immediately leaves the Recently Started placeholder state and shows progress context while deeper momentum history continues forming. Forward progress creates reading progress events for metrics and streaks, but it does not create repeated Recent Activity shelf events.

Limitations: Persisted progress tracking remains page-based. Percentage updates are converted to pages when total pages are known; chapter, location, and audiobook inputs remain lightweight entry aids rather than a full alternate progress model.

### Quick Finish

Status: Complete

Readers can mark a Currently Reading book as Read from the profile reading card.

Limitations: Completion quality depends on available total page count and supplied finished metadata.

### Ratings

Status: Complete

Readers can rate shelved Works from 1 to 5 stars. Rating updates create rating activity and update aggregate Work ratings.

Limitations: A book must be on the reader's shelf before it can be rated.

### Reviews

Status: Complete

Reviews are public finished-Work recommendations stored on the shelf entry. When a reader marks a Work Read, DogEared offers a simple completion flow: rating, optional review, and finish. Reviews support an optional title, optional body, spoiler flag, editing, deletion, and local draft autosave where the editor is available. Reviews belong to the Work, never to an individual Edition.

Book pages show average rating, rating count, recent reviews, spoiler labels, collapsed long reviews, and an owner editor for finished books. When the editor is already visible, Book Detail suppresses duplicate write-review CTAs and transitions into the community review area with compact empty-state copy. Profiles include a Reviews section with latest reviews, sort and spoiler filters, and the same move-up/move-down layout controls used by shelf sections.

Limitations: Reviews are public by default. Future privacy settings may add alternate visibility, but current Journal entries remain the private place for notes while reading.

### Finished Date

Status: Complete

Read books can store a finished date. Reading goal progress uses finished dates for current-year completion.

Limitations: Finished books without dates may not appear in annual goal progress.

### Momentum Score

Status: Complete

Currently Reading profile sections show supportive momentum context based on progress, recency, elapsed days, and update count.

Limitations: Predictions are hidden until there is enough reading history and confidence.

### Reading Streak

Status: Complete

Profiles and metrics show a reading streak based on recent reading/progress dates.

Limitations: Streak calculation depends on recorded updates and visible shelf state.

### Annual Reading Goal

Status: Complete

Readers can set an annual goal in profile data and see completed count, progress bar, percentage, remaining/beyond-goal count, and pace label. Profile and My Reading Life derive annual goal progress from the same helper, counting books with finished dates in the current year.

Limitations: Goal input is stored as profile text, with numeric parsing applied in the reading goal helper.

### My Reading Life

Status: Complete

Signed-in readers can open `/reading-life` from the You navigation to see a private reflection on their reading history. The page shows books completed this year, pages read, reading streak, goal progress, average rating, average pages per day, average book length, reading pace, current books, favorite genre, favorite author, and newest author discovered. It also includes a finished-book timeline with year/month/search filters, a calendar heatmap with textual alternative, genre insights, author insights, fun statistics, and yearly reading-journey summaries.

My Reading Life is the "How has my reading changed over time?" surface. Its content is consolidated into richer overview, history, insights, and journey areas rather than split across many small pages. The legacy `/reading-timeline` URL redirects to `/reading-life#timeline` for backwards compatibility.

Limitations: My Reading Life is derived from recorded DogEared data. Rereads are not tracked separately today because the default shelf model stores one row per reader/book.

### Reading Journal

Status: Complete

Reading Journal is private notebook space for "What was I thinking while reading?"

Signed-in readers can create private journal entries from `/journal` with a prominent New Entry action. Entries support an optional title, required body, journal date/time, optional book association, one optional reading position, optional mood, and personal tags. Reading position uses a type/value pair: Page, Percent, Chapter, or Location. The page shows a newest-first journal timeline, supports text search, searchable saved-book filtering, date filtering, paginates longer journals, recovers a local draft, opens entry detail inline, edits existing entries, and deletes entries after confirmation.

Book pages show a Reading Journal section for signed-in readers who have that exact book on a shelf. Currently Reading books expose a Write Journal Entry form on the book page, and all owned book pages show recent private entries plus a link to the filtered journal view. After profile reading progress is saved, DogEared offers a lightweight anchored coach-mark prompt to create a journal entry with the current book and page position. The prompt reuses the contextual guidance surface, appears outside the BookCard layout so the Currently Reading grid keeps its rhythm, uses standard DogEared button styling, and can be dismissed for that book and position during the current browser session.

Journal entries do not appear on profiles, shelves, activity feeds, public search, or reading statistics surfaces.

Limitations: Journal entries are private-only in the current UI. The data model includes future visibility states for friends, public, and shared entries, but the permission policy currently allows only the owner to access entries.

### Reading Challenge

Status: Planned

Public reading challenges are listed as future roadmap work.

Limitations: No challenge join, tracking, or challenge page workflow is currently implemented.

## Activity And Community

### Recent Activity

Status: Complete

DogEared records meaningful public reading events as activity: adding to Want to Read, starting a book, finishing a book, rating a book, and writing or updating a public review. Routine page, percentage, chapter, audiobook time, or location updates are stored as reading progress events and do not create repeated feed entries. Activity appears on profiles, book pages, following feed, and settings security summaries.

Limitations: Activity visibility is controlled by profile privacy and activity sharing.

### Following

Status: Complete

Readers can follow and unfollow other readers. Following powers the Following page feed.

Limitations: There is no approval queue; follow availability is controlled by a preference.

### Reader Suggestions

Status: Beta

Home and Following can suggest public readers the viewer does not already follow.

Limitations: Suggestions are simple and based on public/discoverable readers rather than a mature recommendation engine.

### Following Feed

Status: Complete

The Following page shows activity from followed readers and includes shelf controls, likes, and comments.

Limitations: Feed content excludes private profiles and users who disabled activity sharing.

### Likes

Status: Complete

Readers can like and unlike activity. Likes notify the activity owner.

Limitations: Users cannot like their own activity.

### Comments

Status: Complete

Readers can comment on activity, load comments, and delete their own comments. Comment feedback appears as lightweight inline status text only when a success or error message exists; hidden feedback does not reserve card height.

Limitations: Comments are capped at 500 characters.

### Notifications

Status: Complete

DogEared has a dedicated low-noise notification center for meaningful updates. Notifications are grouped by Today, This Week, and Earlier and include an icon, title, short description, timestamp, read/unread state, and optional action. Readers can open, mark read, mark all read, or delete notifications. The left navigation shows a subtle unread badge only when unread notifications exist.

Supported v1 event types cover community updates (follows, likes, comments, replies), reading and milestone updates (goal completion, achievement-backed streak milestones, achievement-backed finished series), discovery updates (trending Want to Read books and favorite-author imports), and future-ready system imports. Achievement notifications use the same icon, accent color token, title, and description as the earned profile badge, then deep-link to the profile badge. Similar events can be grouped within a configurable window so repeated likes or replies become one calm notification. Settings includes in-app category preferences for Community, Reading, Discovery, Milestones, and System. Admin includes a notification operations dashboard for sent today, unread count, common types, and volume over time.

Limitations: Email and push delivery are future expansion points; v1 is in-app only. Failed notification job reporting is represented as an admin-ready placeholder until asynchronous jobs exist.

## Discovery And Navigation

### Home Discovery Sections

Status: Beta

Home surfaces featured editorial collections, explainable community discovery sections, discovery jump links, reader suggestions, first-run welcome, onboarding checklist, reading goal prompt, recommendation education, and custom shelf ideas.

Limitations: Section quality depends on catalog, shelf, rating, review, and activity volume. Some shelf ideas are prompts that create custom shelves.

### Guided First Experience

Status: Complete

Signed-in readers receive optional first-run onboarding instead of a traditional wizard. Home can show a welcome card, a dismissible checklist, a one-time yearly reading goal prompt, and short recommendation education. The checklist tracks six high-signal actions: add a first book, update reading progress, rate a book, write a first journal note, follow another reader, and explore Discover.

Contextual tips remain lightweight callouts that point at relevant areas, include a title, explanation, optional icon, primary action, and dismiss control, and are keyboard accessible. Fresh-user guidance starts on Home. The current tip set covers Home, Search, book detail shelf controls, first book added, Currently Reading progress, first progress update, Reading Journal privacy, Discover recommendation education, first finished book review guidance, and Settings Learning controls.

DogEared chooses onboarding from transparent reader state: shelf count, Currently Reading count, finished books, ratings, reviews, progress updates, journal entries, follows, recommendation feedback, reading goal status, and explicit completed actions. Only one contextual tip appears at a time. Completed or dismissed tips are stored per user and do not reappear. Settings includes Learning controls to turn helpful tips on or off, reset the guided tour, restart onboarding, and hide the onboarding checklist.

Journal-specific tips appear only on the Journal route or after a progress update. The broader guidance path stays focused on learning DogEared as a whole: finding a book, saving it, tracking reading, finishing, reviewing, and managing preferences.

Onboarding state is extensible and stored under `profile_data.settings.guidedTour.onboarding`. It includes welcome completion, checklist dismissal, reading goal prompt dismissal, recommendation education dismissal, completed actions, and celebrated milestones. Future onboarding ideas can add more action IDs without changing page-level APIs.

Limitations: Guided tips are state-based and contextual, not a multi-step wizard. They currently cover first-use learning moments only.

### Beta Launch Readiness UX

Status: Complete

DogEared includes a limited-beta readiness pass focused on reducing confusion in the first reader journey. Username setup, Search, Goodreads import, Profile shelves, Recent Activity, Reading Goal, recommendations, progress updates, and review prompts use clearer next-step language. Owner-facing empty states include CTAs such as searching for books, finding a book to start, adding a finished book, searching again, and reviewing shelves after import.

Success and error messages are intentionally plain and recoverable. Examples include import completion with a Profile next step, magic-link retry guidance, export retry guidance, progress-save retry guidance, recommendation feedback status, and signed-out shelf prompts that explain why account creation matters.

Reusable UI behavior belongs inside shared components or shared client utilities whenever practical. Recommendation feedback is owned by BookCard. Shelf feedback timing, loading persistence, and error styling are owned by the ShelfDropdown helper path. Pages should opt into these shared behaviors instead of rebuilding equivalent markup, CSS, or JavaScript.

Limitations: The beta readiness pass improves existing flows but does not add centralized telemetry, a device-lab QA matrix, or a full assistive-technology audit.

### Editorial Collections

Status: Complete

Editors can curate collections with title, slug, subtitle, description, editorial introduction, hero image, category, featured flag, publication state, and sort order. Books inside collections support custom order, editor notes, and featured quotes. Readers can browse published collections at `/collections`, open collection detail pages, read why each book belongs, see ratings, and add books to shelves.

Featured collections appear sparingly on Home, author pages show collections that include that author, and Search returns matching published collections. Collections is currently hidden from the left navigation until the beta product has enough useful published content to avoid an empty destination.

Limitations: Collections are manually curated by admins. There is no staff profile, guest curator, award, library, or partnership workflow yet beyond the extensible collection metadata and category fields.

### Community Discovery Providers

Status: Complete

Home discovery is generated by a reusable discovery service and provider set. Each provider returns a title, description, ranked books, display priority, and optional empty state. The UI renders provider output rather than hardcoding book sections.

Current providers:

- Community Favorites.
- Most Added This Week.
- Most Finished This Week.
- Trending Up.
- Hidden Gems.
- Recently Reviewed.
- New Releases Readers Love.

Limitations: Providers hide themselves when DogEared lacks enough real community data. They do not fabricate recommendations.

### Community Favorites

Status: Complete

Shows books with enough ratings, ranked by highest average rating, rating count, and readership.

Limitations: Books below the minimum rating count are excluded.

### Most Added This Week

Status: Complete

Shows books added to shelves by the most unique readers over the last seven days. Duplicate additions by the same reader do not inflate the unique-reader ranking.

Limitations: Requires recent shelf activity.

### Most Finished This Week

Status: Complete

Shows books readers are completing now, ranked by unique finishers, completion count, recency, and rating context.

Limitations: Requires recent finished-book activity.

### Trending Up

Status: Complete

Shows books whose recent community activity is rising compared with the previous two-week window. Signals include recent readers, finishes, ratings, and reviews.

Limitations: This is transparent activity growth, not a personalized or AI model.

### Hidden Gems

Status: Complete

Shows books with excellent ratings, enough ratings to be credible, and relatively few readers.

Limitations: The provider intentionally excludes books that are already broadly read on DogEared.

### Recently Reviewed

Status: Complete

Shows thoughtful recent reviews, prioritizing meaningful length, reactions, and recency. Cards display the review excerpt, reviewer username when available, reviewer rating when present, and link directly to the surfaced review on the book page.

Limitations: Reviews must have enough written substance to qualify.

### New Releases Readers Love

Status: Complete

Shows recently published books with strong ratings and meaningful community activity.

Limitations: Requires publication-year metadata plus ratings and reader activity.

### Related Pages

Status: Complete

`/related` supports landing exploration plus genre, topic, author, and book collections.

Limitations: Genre and topic pages depend on stored `book_genre` and `book_tag` metadata.

### Genre Pages

Status: Complete

Genre pages are implemented through `/related?kind=genre&value=...` and show matching books, reader counts, shelf counts, and related authors.

Limitations: There is no separate `/genre/[slug]` filesystem route.

### Top Books By Genre API

Status: Complete

The top-list API ranks books by recent shelf activity for a genre.

Limitations: Requires the database function `get_top_books_by_genre`.

### Roadmap Page

Status: Complete

The Roadmap page communicates Current Version, Building Now, Recently Shipped, Coming Next, Looking Ahead, and Help Shape DogEared.

Limitations: Future direction does not promise dates. Recently Shipped is sourced from published Release Notes.

### Mission Page

Status: Complete

The Mission page communicates values and long-term product direction.

Limitations: It is informational, not interactive.

## Settings, Import, Export, And Preferences

### Goodreads Import

Status: Complete

Readers can upload Goodreads CSV exports from the Settings Import Dashboard. Imports support preview before writing, merge mode, replace mode, duplicate explanations, estimated time, series detection, post-import reports, report export, server sync, local cache fallback, import history, and resumable failed syncs.

Limitations: Goodreads shelves are mapped to the three implemented default statuses; non-status shelves can become genre candidates unless filtered.

### Import Dashboard

Status: Complete

Readers can see current import status, books imported, books skipped, duplicates merged, missing metadata, series matched, import preview, duplicate resolution details, import report, recovery state, and import history.

Limitations: Import history and recovery state are browser-local. Metadata review is surfaced for admins in Data Health rather than blocking the reader import.

### JSON Data Export

Status: Complete

Readers can download a JSON export of account profile and shelved books.

Limitations: CSV export is present as a disabled "Coming Soon" option.

### Clear Shelf Entries

Status: Complete

Settings can delete all default shelf entries while preserving the account.

Limitations: The current clear-shelf API deletes `user_book` rows; custom shelf-book rows are separate.

### Preferences

Status: Complete

Settings saves privacy, reading defaults, notification preferences, Learning/guided-tour preferences, data controls, import controls, and personalization preferences.

Limitations: Some preferences are forward-looking and not all have visible effects across the product yet.

### API Reference In Settings

Status: Complete

Settings shows copyable API URLs for shelf entries, catalog search, and top books by genre.

Limitations: This is a lightweight reference, not full developer documentation.

### Feedback Widget

Status: Complete

Feedback is a beta-ready reporting system available from the floating Feedback action. Readers can submit Bug Report, Feature Request, General Feedback, or Question, with optional severity for non-general reports. Bug reports reveal focused fields for expected behavior, actual behavior, and steps to reproduce; other feedback stays compact with subject, description, optional email, and optional screenshots.

Submissions automatically capture diagnostic context: page URL, route, timestamp, app version, git commit when available, browser, operating system, screen and viewport size, color scheme, language, login state, relevant book/author/collection/search/recommendation IDs, and recent client-side errors when the reader consents through the error prompt. DogEared never asks readers to enter this manually and does not collect passwords, private journal content, or sensitive personal information.

Client-side errors show a lightweight opt-in prompt: "Something unexpected happened. Would you like to send a report?" Reports are never sent automatically. Screenshot attachments are previewed before submit and stored with the feedback report for admin review.

Admins manage reports at `/admin/feedback`. The dashboard supports search and filters by type, severity, status, date, and user. Admins can add private internal notes, update status, mark Needs Reply, Needs Reproduction, Duplicate, add a duplicate tracking number, record Resolved in Version, and track resolution dates.

Limitations: Screenshot storage is currently inline JSON for beta-scale reports. A future expansion should move images to object storage if volume grows.

## Metrics And Admin

### Personal Metrics

Status: Beta

Logged-in users see pages read, books added, streaks, average pages, median finish days, top genre, new topics, average ratings, and percent rated.

Limitations: Metrics depend on shelf/progress metadata and may fall back to sample data if live queries fail.

### Community Metrics

Status: Beta

Metrics includes aggregate shelf, reader, completion, genre/topic, location, and chart data.

Limitations: Some views depend on enough community data to be meaningful.

### Taste Graph

Status: Experimental

Metrics derives taste signals from rated books, genres, tags, page counts, and themes.

Limitations: It is heuristic and depends on rating and metadata coverage.

### Admin Overview

Status: Complete

Admins can view site totals and recent weekly activity.

Limitations: Admin access is username allow-list based.

### Admin Product Analytics

Status: Beta

Admins can review aggregate product analytics at `/admin/analytics`: growth, reading actions, community activity, search trends, discovery performance, first-run funnel steps, and feature adoption. The system uses first-party product events plus existing shelf, progress, journal, review, follow, like, and recommendation tables.

Tracked events are intentionally small: page views, feature views, search performed with result counts, recommendation impressions, recommendation clicks, recommendation feedback, and recommendation add-to-shelf intent.

Privacy decisions: analytics dashboards show aggregate counts and top terms only. DogEared does not collect private journal content, passwords, sensitive personal information, or expose reader-level behavioral reports for this dashboard.

Limitations: Discovery impressions and recommendation add-to-shelf are client-side best-effort signals. Admin analytics uses cached aggregate queries and may lag briefly.

### Admin Performance Analytics

Status: Beta

Admins can review operational performance telemetry at `/admin/performance`: request volume, p50/p75/p95/p99 latency, error rate, slow-operation count, core workflow cards, route/API performance, timing-span breakdowns, external provider latency, recent slow operations, release comparisons, and workflow-specific performance targets.

Recorded operations use stable names such as `search.books`, `progress.save`, `shelf.mutate`, `page.profile`, `page.reading-life`, `page.search`, `page.book-detail`, `page.author-detail`, `page.discover`, `navigation.feedback`, `external.google-books`, and `external.open-library`. Timing spans use the same terminology as local development diagnostics, such as local catalog, external providers, canonical resolution, progress mutation, milestone work, Profile user/profile lookup, follower/following counts, shelf summary, current reads, recent activity, finished books, reading goal, shared navigation/sidebar loading, viewer-state loading, and navigation start to skeleton/content swap.

The telemetry path is fire-and-forget from measured workflows, samples normal successes through `PERFORMANCE_TELEMETRY_SAMPLE_RATE` when configured, and always keeps errors and unusually slow operations. Raw events are retained for 45 days; longer-term performance review should rely on aggregates and release comparisons rather than permanent raw request logs.

Privacy decisions: performance analytics measures operations, not readers. Events must not store search query text, book titles, journal content, emails, usernames, profile content, authorization data, database credentials, raw SQL, or sensitive request payloads. Shelf state remains current-user render data and is not cached as shared public telemetry.

Navigation feedback is measured separately from server render time through `navigation.feedback`. Client-side navigation telemetry records sanitized route patterns, whether a delayed skeleton was shown, navigation start to skeleton visible, and navigation start to content swap. It must not include query strings, usernames, search text, book titles, or form payloads.

Limitations: The dashboard depends on measured production traffic. Empty periods show explanatory empty states instead of misleading zero-valued health claims.

### Admin Collection Management

Status: Complete

Admins can create, edit, reorder, publish, archive, and feature editorial collections from `/admin/collections`. The editor supports collection metadata plus ordered book lines with optional editor notes and featured quotes.

Limitations: This is a simple admin form. It does not yet include rich media upload, curator profiles, preview workflows, audit logs, or drag-and-drop ordering.

### Admin Data Health

Status: Complete

Admins can inspect metadata gaps, genre coverage, author coverage, import quality, duplicate risk, potential duplicate Works, duplicate Editions, broken Series, multiple canonical Work assignments, missing-series signals, missing canonical titles, missing series positions, incorrect standalone classification, canonical title conflicts, series position conflicts, recent backfills, page-count gaps, publisher gaps, and canonical title cleanup candidates. Potential Duplicate Works provides a review queue with confidence and reasoning, plus merge and ignore actions. The same duplicate detection can run as the repeatable `cleanup:duplicate-works` task, which defaults to dry-run and only applies merges when explicitly requested. Canonical Work normalization is available through Data Health and `cleanup:canonical-works`; it attaches known-series metadata, repairs Work keys, moves Editions, removes stale placeholders, normalizes redundant title suffixes, and merges only high-confidence duplicate Works. Canonical Title Cleanup reports books whose stored title still includes redundant series parentheticals and provides an admin action to normalize those titles through the same safe metadata-layer matcher used by imports.

Limitations: Most backfill execution lives in scripts. Canonical title cleanup is available as a targeted admin action because it is deterministic and idempotent. Duplicate Work merging is admin-approved rather than automatic because false merges are more damaging than temporary duplicate suggestions.

### Admin User Management

Status: Complete

Admins can search users, inspect user counts, view user detail, and delete users except themselves.

Limitations: Admin deletion preserves catalog books and authors but removes reader-owned data.
