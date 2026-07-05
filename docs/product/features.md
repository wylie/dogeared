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

Profiles are the "Who am I as a reader?" surface, so the owner experience stays focused on profile card, notifications, bio, favorite book/author, concise reading goal summary, shelf summary, currently reading, recent activity, and settings access.

Limitations: Private profiles are hidden from non-owners. Private journal entries are intentionally not shown on profiles.

### Profile Editing

Status: Complete

Owners can edit name, avatar, location, birth year, reading goal text, favorite book, favorite author, blurb, and genres from their profile.

Limitations: Avatar storage accepts data image or URL values in profile data; there is no dedicated media upload service documented in code.

### Profile Privacy

Status: Complete

Readers can set profiles public or private and control location sharing, activity sharing, discovery visibility, and follow availability.

Limitations: Privacy settings are stored inside `profile_data.settings`, not a standalone table.

### Followers Page

Status: Complete

Profiles expose a paginated followers list with search and recent/name sorting.

Limitations: There is no separate following list route for another user's following list; `/following` is the viewer's management/feed page.

## Books And Catalog

### Recommended For You

Status: Complete

Home shows personalized, explainable recommendations. Signed-in recommendations use saved shelves, ratings, completed books, favorite genres, enjoyed authors, similar-book genre overlap, and community ratings. If DogEared has limited personal data, the section falls back to popular books.

Every recommendation includes a visible reason. Readers can mark recommendations Interesting or Hide them through compact inline feedback actions. Hidden recommendations store `not_interested` feedback per user and are excluded from future personal results.

Limitations: Review sentiment is future-ready but not currently scored. Recommendations are transparent heuristics, not an AI engine.

### Discover Page

Status: Complete

`/discover` gathers Recommended For You and community discovery sections such as Trending Up, New Releases Readers Love, Hidden Gems, Most Finished, and Community Favorites.

Limitations: Award winners and staff picks are future extension points through editorial collections or additional providers; they are not fabricated when no data exists.

### Book Search

Status: Complete

Search combines DogEared catalog, Google Books, and Open Library results. Users can add search results to shelves, catalog matches show series name/book number when available, and matching editorial collections appear above book results.

Limitations: External APIs can fail or return incomplete metadata.

### Book Detail Page

Status: Complete

Book pages show metadata, cover, synopsis, author link, series context, genres, topics, shelf controls, ratings, reviews, and activity.

Limitations: If a book is not in DogEared, the page may resolve from Google Books/Open Library query parameters and may have sparse metadata.

### Series Support

Status: Complete

DogEared stores first-class series records with name, optional description, optional cover, total-book count, ordered book entries, publication order, chronological order, and extensible metadata. Book pages show a Series section with the current book highlighted, reader completion state, missing-title placeholders, and links to available books. Finished readers see a Continue the series callout for the next available book, including one-click Add to Want to Read when it is not already shelved.

Limitations: Series metadata must exist in DogEared; the app does not currently auto-import or infer series membership from external catalogs.

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

Author pages show author metadata, reader/shelf counts, editorial collections featuring the author, books in DogEared grouped by series where available, standalone books, and shelf controls.

Limitations: Author bio and photo may be missing.

### Cover Proxy

Status: Complete

The cover API proxies valid Google Books cover URLs.

Limitations: It only accepts normalized Google Books cover URLs.

## Shelves And Reading State

### Default Shelves

Status: Complete

Readers can save books as Want to Read, Currently Reading, or Read.

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

Currently Reading books can store total pages and current page. The profile update control uses a compact grouped selector for Page Number, Percentage, Chapter, Kindle Location, and Audiobook Time so the interaction matches journal reading positions without overflowing book cards. Forward progress creates reading progress events and activity.

Limitations: Persisted progress tracking remains page-based. Percentage updates are converted to pages when total pages are known; chapter, location, and audiobook inputs remain lightweight entry aids rather than a full alternate progress model.

### Quick Finish

Status: Complete

Readers can mark a Currently Reading book as Read from the profile reading card.

Limitations: Completion quality depends on available total page count and supplied finished metadata.

### Ratings

Status: Complete

Readers can rate shelved books from 1 to 5 stars. Rating updates create rating activity and update aggregate book ratings.

Limitations: A book must be on the reader's shelf before it can be rated.

### Reviews

Status: Complete

Reviews are public finished-book recommendations stored on the shelf entry. When a reader marks a book Read, DogEared offers a simple completion flow: rating, optional review, and finish. Reviews support an optional title, optional body, spoiler flag, editing, deletion, and local draft autosave where the editor is available.

Book pages show average rating, rating count, recent reviews, spoiler labels, collapsed long reviews, and an owner editor for finished books. Profiles include a Reviews section with latest reviews, sort and spoiler filters, and the same move-up/move-down layout controls used by shelf sections.

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

Readers can set an annual goal in profile data and see completed count, progress bar, percentage, remaining/beyond-goal count, and pace label.

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

Book pages show a Reading Journal section for signed-in readers who have that exact book on a shelf. Currently Reading books expose a Write Journal Entry form on the book page, and all owned book pages show recent private entries plus a link to the filtered journal view. After profile reading progress is saved, DogEared offers an optional prompt to create a journal entry with the current book and page position.

Journal entries do not appear on profiles, shelves, activity feeds, public search, or reading statistics surfaces.

Limitations: Journal entries are private-only in the current UI. The data model includes future visibility states for friends, public, and shared entries, but the permission policy currently allows only the owner to access entries.

### Reading Challenge

Status: Planned

Public reading challenges are listed as future roadmap work.

Limitations: No challenge join, tracking, or challenge page workflow is currently implemented.

## Activity And Community

### Recent Activity

Status: Complete

DogEared records shelf additions, finished updates, progress updates, and ratings as activity. Activity appears on profiles, book pages, following feed, and settings security summaries.

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

Readers can comment on activity, load comments, and delete their own comments.

Limitations: Comments are capped at 500 characters.

### Notifications

Status: Complete

Activity likes and comments create notifications. Owners see notification cards on their own profile and an API unread count is available.

Limitations: Notification settings exist for browser/release/weekly preferences, but the implemented notification event types are activity like and activity comment.

## Discovery And Navigation

### Home Discovery Sections

Status: Beta

Home surfaces featured editorial collections, explainable community discovery sections, discovery jump links, reader suggestions, onboarding checklist, and custom shelf ideas.

Limitations: Section quality depends on catalog, shelf, rating, review, and activity volume. Some shelf ideas are prompts that create custom shelves.

### Guided First Experience

Status: Complete

Signed-in readers can receive contextual first-time tips instead of a traditional onboarding wizard. Tips are lightweight callouts that point at relevant areas, include a title, explanation, optional icon, primary action, and dismiss control, and are keyboard accessible. Fresh-user guidance starts on Home. The current tip set covers Home, Search, book detail shelf controls, first book added, Currently Reading progress, first progress update, Reading Journal privacy, first finished book, Reviews versus private Journal Entries, and Settings Learning controls.

DogEared chooses tips from transparent reader state: shelf count, Currently Reading count, finished books, reviews, progress updates, and journal entries. Only one tip appears at a time. Completed or dismissed tips are stored per user and do not reappear. Settings includes Learning controls to turn helpful tips on or off and reset the guided tour.

Journal-specific tips appear only on the Journal route or after a progress update. The broader guidance path stays focused on learning DogEared as a whole: finding a book, saving it, tracking reading, finishing, reviewing, and managing preferences.

Limitations: Guided tips are state-based and contextual, not a multi-step wizard. They currently cover first-use learning moments only.

### Beta Launch Readiness UX

Status: Complete

DogEared includes a limited-beta readiness pass focused on reducing confusion in the first reader journey. Username setup, Search, Goodreads import, Profile shelves, Recent Activity, Reading Goal, recommendations, progress updates, and review prompts use clearer next-step language. Owner-facing empty states include CTAs such as searching for books, finding a book to start, adding a finished book, searching again, and reviewing shelves after import.

Success and error messages are intentionally plain and recoverable. Examples include import completion with a Profile next step, magic-link retry guidance, export retry guidance, and signed-out shelf prompts that explain why account creation matters.

Limitations: The beta readiness pass improves existing flows but does not add centralized telemetry, a device-lab QA matrix, server-persisted onboarding checklist dismissal, or a full assistive-technology audit.

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

The Roadmap page exposes Now, Next, Later, and recently completed product priorities.

Limitations: Roadmap items are not proof of implemented behavior.

### Mission Page

Status: Complete

The Mission page communicates values and long-term product direction.

Limitations: It is informational, not interactive.

## Settings, Import, Export, And Preferences

### Goodreads Import

Status: Complete

Readers can upload Goodreads CSV exports. Imports support dry-run preview, merge mode, replace mode, import summaries, server sync, and local cache fallback.

Limitations: Goodreads shelves are mapped to the three implemented default statuses; non-status shelves can become genre candidates unless filtered.

### Import Controls

Status: Complete

Readers can choose default import mode and whether to preview before writing.

Limitations: Controls apply to the Settings import workflow.

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

Feedback can be submitted and rate-limited. Submission events are tracked with user/IP hashes.

Limitations: The repository documents event tracking, not a complete feedback management dashboard.

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

### Admin Collection Management

Status: Complete

Admins can create, edit, reorder, publish, archive, and feature editorial collections from `/admin/collections`. The editor supports collection metadata plus ordered book lines with optional editor notes and featured quotes.

Limitations: This is a simple admin form. It does not yet include rich media upload, curator profiles, preview workflows, audit logs, or drag-and-drop ordering.

### Admin Data Health

Status: Complete

Admins can inspect metadata gaps, genre coverage, author coverage, import quality, duplicate risk, recent backfills, page-count gaps, and publisher gaps.

Limitations: It is diagnostic only; backfill execution lives in scripts, not buttons.

### Admin User Management

Status: Complete

Admins can search users, inspect user counts, view user detail, and delete users except themselves.

Limitations: Admin deletion preserves catalog books and authors but removes reader-owned data.
