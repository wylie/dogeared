# Database

DogEared uses Neon Postgres. The baseline schema is in `db/neon-schema.sql`, migrations live in `db/migrations/`, and some newer support tables are created lazily by API/helper code.

This document describes major entities and relationships. It intentionally does not dump SQL.

## Users

Entity: `app_user`

Stores the account identity:

- Stable user ID.
- User key.
- Username.
- Hashed and encrypted email fields.
- Profile/settings JSON.
- Creation timestamp.

Relationships:

- Owns sessions, magic links, email changes, shelf entries, reading journal entries, activity, follows, custom shelves, likes, comments, notifications, feedback events, and progress events.

## Authentication

Entities: `auth_magic_link`, `auth_session`

Magic links store hashed sign-in tokens, user, IP/user-agent metadata, expiration, use state, and creation time.

Sessions store hashed session tokens, user, expiration, revocation state, last-seen time, and creation time.

Relationships:

- Both belong to `app_user`.
- Account deletion cascades or explicitly deletes related auth records.

## Email Changes

Entity: `account_email_change`

Stores pending email-change requests:

- User.
- New email hash and encrypted email.
- Token hash.
- IP/user-agent metadata.
- Expiration, used, created, and verified timestamps.

Relationships:

- Belongs to `app_user`.

## Works

Entity: `book_work`

Stores the canonical reader-facing literary Work:

- Stable Work ID.
- Work key based on normalized title and author.
- Title and canonical title.
- Primary author and optional `author_id`.
- Description, subjects, genres.
- Optional series ID and series position metadata.
- Original publication year.
- Preferred cover URL.
- Rating average and rating count summary fields.
- Extensible metadata and timestamps.

Relationships:

- May reference `author`.
- Has many `book_edition` rows.
- Is referenced by legacy `book.work_id` rows that serve as compatibility representatives.
- Reader-facing shelves, ratings, reviews, progress, activity, recommendations, search, author pages, series, and Readers Also Enjoyed resolve to the Work through the representative book row.

## Editions

Entity: `book_edition`

Stores edition-specific metadata beneath a Work:

- Work and optional representative `book`.
- Edition key.
- ISBN-10 and ISBN-13.
- Publisher.
- Format.
- Language.
- Publication date and year.
- Page count.
- Cover URL.
- Google Books ID.
- Open Library work and edition IDs.
- External IDs, metadata, and timestamps.

Relationships:

- Belongs to `book_work`.
- May point at a compatibility `book` row.
- May be remembered by `user_book.edition_id` for the reader's chosen edition.

Edition data should not own ratings, reviews, shelves, reading progress, series membership, or recommendation identity.

## Books

Entity: `book`

Stores legacy local catalog records and representative rows:

- `work_id` pointing at `book_work`.
- Legacy canonical work key retained for lookup/backwards compatibility.
- Title and primary author text.
- Optional `author_id`.
- ISBN-13, ISBN-10, Google Books ID.
- Synopsis, cover URL, language, page count, publisher, published year.
- Created and updated timestamps.

Relationships:

- May reference `author`.
- Has zero or more source records, genres, topic tags, collection entries, shelf entries, reading journal entries, activity rows, and progress events.
- May represent a canonical Work for older routes and relationships.

Current v1 compatibility rule:

- Existing relationships still store `book_id`, but duplicate edition rows are migrated to the representative `book_id` for the Work whenever possible.
- New shelf saves upsert `book_work` and `book_edition`, then use the representative Work row for reader-facing ownership.
- ISBNs and source edition IDs are edition identity. Work identity is normalized title and author, with ISBN used only as supporting duplicate-detection evidence where appropriate.

## Authors

Entity: `author`

Stores author metadata:

- Name.
- Bio and photo URL.
- Bio source and source URL.
- Created and updated timestamps.

Relationships:

- Books may reference authors through `book.author_id`.

## Book Sources

Entity: `book_source`

Maps a DogEared book to external sources:

- Source type: Google Books, Open Library, or NYT.
- Source key, work ID, edition ID, URL.
- Sync and creation timestamps.

Relationships:

- Belongs to `book`.

## Genres

Entity: `book_genre`

Stores genre metadata:

- Book.
- Genre slug.
- Genre display name.

Relationships:

- Belongs to `book`.
- Powers related/genre pages and top-by-genre lists.

## Series

Entities: `series`, `series_book`

Series records store reading-order metadata:

- Series name and unique slug.
- Optional description and cover image.
- Total-book count.
- Extensible JSON metadata for later additions.

Series-book records store:

- Series.
- Optional DogEared book.
- Optional title override for known books not yet in the catalog.
- Book order.
- Publication order.
- Chronological order.
- Extensible JSON metadata.

Relationships:

- A series has many series-book entries.
- A series-book entry is conceptually Work-level. During v1 it references the representative catalog `book` row for the Work, or may represent a missing/not-yet-cataloged title.
- Canonical Work ownership is mirrored on `book_work.series_id` and `book_work.series_position`. Editions never own series membership.
- Series ordering uses `book_order` first, then publication order, chronological order, publication year, title, and representative book id.
- Known missing titles can be stored as placeholder `series_book` rows with `book_id = null` and `title_override`; when a real representative book is later attached at the same order, the placeholder is removed.
- The known-series backfill migration populates common series and real entries by normalized title/author matching while preserving existing shelves, ratings, reviews, journal entries, progress, activity, favorites, and goals.
- Reader progress for series is derived from `user_book` statuses joined through `series_book`, so profiles can later support series-completed and series-in-progress views without a separate progress table.

## Editorial Collections

Entities: `collection`, `collection_book`

Collection records store editorial curation metadata:

- Title and unique slug.
- Optional subtitle.
- Description.
- Editorial introduction.
- Hero image.
- Category.
- Featured flag.
- Publication state: `draft`, `published`, or `archived`.
- Sort order.
- Extensible JSON metadata for future staff picks, seasonal collections, guest curators, library collections, award winners, and bookstore partnerships.

Collection-book records store:

- Collection.
- Book.
- Custom sort order.
- Optional editor note explaining why the book belongs.
- Optional featured quote.

Relationships:

- A collection has many ordered collection-book entries.
- A collection-book entry belongs to a representative catalog `book` row for a Work.
- Published collections can surface on Home, Search, collection pages, and author pages.
- Draft and archived collections remain admin-managed and are not shown to public readers.

## Topic Tags

Entity: `book_tag`

Created lazily by shelf-entry code. Stores topic metadata:

- Book.
- Tag slug.
- Tag display name.

Relationships:

- Belongs to `book`.
- Powers related topic pages and metrics topic views.

## Shelf Entries

Entity: `user_book`

Stores a reader's default shelf state for a book:

- User and book.
- Optional edition ID remembering the selected Edition.
- Status: `want_to_read`, `reading`, or `finished`.
- Rating.
- Total pages and current page.
- Finished date.
- Review title.
- Finished reflection/review body.
- Review spoiler flag.
- Review updated timestamp.
- First-added and updated timestamps.

Relationships:

- Joins `app_user` and the representative `book` row for a Work.
- May reference `book_edition` for the chosen Edition.
- Source of Work-level ratings, reviews, shelf counts, reading progress, profile shelves, metrics, and admin user counts.

Current limitation:

- DNF is not a valid persisted status in the current table/API model.

## Reading Journal Entries

Primary entity: `reading_journal_note`

Stores private notebook entries for one reader:

- User.
- Optional book.
- Optional entry title.
- Required body.
- Journal date/time.
- Optional reading position type and value. Supported position types are Page, Percent, Chapter, and Location.
- Optional mood.
- Personal tags.
- Visibility value.
- Extensible metadata.
- Created and updated timestamps.

Relationships:

- Belongs to `app_user`.
- May reference the representative `book` row for a Work; if a book is supplied, the reader must already have that Work on a default shelf before creating or updating the entry.
- Book detail pages load recent entries for the signed-in owner.
- The private `/journal` page searches, date-filters, saved-book-filters, and paginates only the signed-in reader's entries. The UI uses a searchable saved-book picker instead of a long dropdown.

Compatibility fields:

- `progress_snapshot`, `page_number`, and `chapter_location` remain available for older data and older links.
- New writes use `reading_position_type` and `reading_position_value` and derive only the matching compatibility field.

Compatibility entity: `reading_journal_entry`

The older one-entry-per-user/book table is retained for compatibility and legacy data backfill. Its fields are migrated into `reading_journal_note` as private note bodies when the journal schema is prepared.

Current limitations:

- `reading_journal_note` supports `private`, `friends`, `public`, and `shared` visibility values for future expansion, but current access policy only exposes entries to the owning reader.
- Journal entries do not appear in public profiles, activity feeds, public search, or metrics.

## Reading Progress Events

Entity: `user_reading_progress_event`

Created lazily by shelf/admin code. Stores forward reading movement:

- User and book.
- From page, to page, page delta.
- Recorded timestamp.

Relationships:

- Belongs to `app_user` and the representative `book` row for a Work.
- Used by profile momentum/streak, metrics, and My Reading Life calendar/streak summaries.
- Progress belongs to the Work. Edition page counts or formats may influence calculations, but changing editions should not lose progress.

## My Reading Life And Timeline Data

My Reading Life does not introduce a new persistence table. It derives its summaries from existing entities:

- `user_book` for finished books, current books, ratings, pages, finished dates, and reflections.
- `user_reading_progress_event` for reading activity dates and page movement.
- `book_work`, representative `book`, `book_edition`, `author`, `book_genre`, and `series_book`/`series` for catalog, author, genre, edition, and series context.
- `app_user.profile_data.readingGoal` for annual goal progress.

Relationships:

- The page is scoped to the signed-in `app_user`.
- Overview, timeline filters, calendar context, genre/author insights, fun statistics, and yearly summaries are calculated at render time from the reader's recorded data.
- The legacy `/reading-timeline` route redirects into this page and does not add separate persistence.

## Activity

Entity: `user_activity`

Stores reader-book events:

- User and book.
- Event type: `want_to_read`, `reading`, `finished`, or `rating`.
- Optional rating.
- Created timestamp.

Event semantics:

- `want_to_read`: reader added the book to Want to Read.
- `reading`: reader started the book by moving it to Currently Reading.
- `finished`: reader marked the book Read or updated finished-book review metadata.
- `rating`: reader changed the public star rating.

Routine reading progress updates are not stored as `user_activity` rows. They are stored in `user_reading_progress_event` so Reading Life, streaks, momentum, and guided first-experience state can use progress data without creating repeated feed items.

Relationships:

- Belongs to `app_user` and the representative `book` row for a Work.
- Has likes, comments, and notifications.
- Feeds profiles, book pages, following feed, settings recent activity, and public activity API.

## Reviews

Reviews are not a separate table today. They are public finished-book recommendations stored on `user_book`.

Fields:

- Optional `rating`.
- Optional `review_title`.
- Optional `finished_reflection` review body.
- `review_spoiler` flag.
- Optional `review_updated_at`.

Relationships:

- Belong to one user/Work shelf entry through the representative `book` row.
- Shown through book-review helpers, book detail review cards, profile Reviews, activity surfaces, discovery providers, and admin counts.
- Deleted reviews clear title/body/spoiler metadata while preserving the shelf entry and rating unless the reader clears the rating separately.
- Reviews are never edition-owned.

## Likes

Entity: `user_activity_like`

Created lazily by activity/admin/feed code. Stores one like per user per activity.

Relationships:

- Joins `user_activity` and `app_user`.
- Can create `user_notification` rows for the activity owner.

## Recommendation Feedback

Entity: `user_recommendation_feedback`

Stores explicit reader feedback on recommended Works.

Fields:

- User.
- Book, stored as the representative `book` row for the Work.
- Feedback value: `interesting` or `not_interested`.
- Recommendation source.
- Recommendation reason shown to the reader.
- Created and updated timestamps.

Relationships:

- Belongs to `app_user` and the representative `book` row for a Work.
- Used by the recommendations service to exclude Works hidden through `not_interested` feedback from future personal recommendations.
- Does not create public activity or profile content.

## Comments

Entity: `user_activity_comment`

Created lazily by activity/admin/feed code. Stores:

- Activity.
- Commenting user.
- Body.
- Created timestamp.

Relationships:

- Belongs to `user_activity` and `app_user`.
- Can create `user_notification` rows for the activity owner.

## Followers

Entity: `user_follow`

Stores follower/followed user pairs and creation time.

Relationships:

- Joins `app_user` to `app_user`.
- Powers follow counts, Following page, reader suggestions exclusions, and profile relationships.

## Notifications

Entity: `user_notification`

Created lazily by activity/admin/notification code. Stores:

- Recipient user.
- Actor user.
- Activity.
- Type: `activity_like` or `activity_comment`.
- Created time.
- Optional read time.

Relationships:

- Belongs to recipient user, actor user, and activity.

## Custom Shelves

Entity: `user_custom_shelf`

Stores reader-created shelves:

- User.
- Name and slug.
- Position.
- Icon.
- Created and updated timestamps.

Relationships:

- Belongs to `app_user`.
- Has custom shelf-book assignments.

## Custom Shelf Books

Entity: `user_custom_shelf_book`

Stores books assigned to custom shelves:

- User.
- Shelf.
- Book.
- Created timestamp.

Relationships:

- Joins `app_user`, `user_custom_shelf`, and the representative `book` row for a Work.

## Feedback Events

Entity: `feedback_submission_event`

Tracks feedback submissions for rate limiting:

- Optional user.
- IP hash.
- Feedback type.
- Created timestamp.

Relationships:

- May reference `app_user`.

## Feedback Submissions

Entity: `feedback_submission`

Stores beta feedback and bug reports for admin workflow:

- Tracking number.
- Optional user and follow-up email.
- Feedback type and optional severity.
- Status: New, Investigating, Needs More Info, Planned, Fixed, Closed.
- Subject, description, expected behavior, actual behavior, and steps to reproduce.
- Page URL, route, app version, git commit, browser, operating system, screen size, viewport size, color scheme, language, login state, and relevant book/author/collection/search/recommendation IDs.
- Diagnostic context JSON, including admin-only feature flags and recent client-side errors when available.
- Screenshot metadata/data for beta-scale review.
- Private admin notes, Needs Reply, Needs Reproduction, Duplicate, Duplicate Of, Resolved In Version, and resolution timestamp.

Privacy rule: feedback diagnostics must not include passwords, private journal content, or sensitive personal information. Admin notes are internal only and are never surfaced to readers.

## Settings

Settings are stored inside `app_user.profile_data.settings`, not as standalone tables. Current groups include:

- Privacy.
- Reading defaults.
- Notifications.
- Data controls.
- Import controls.
- Personalization.
- Guided tour settings:
  - `showHelpfulTips`.
  - `dismissedTips`.
  - `completedTips`.
  - `onboarding.welcomeCompleted`.
  - `onboarding.checklistDismissed`.
  - `onboarding.goalPromptDismissed`.
  - `onboarding.recommendationEducationDismissed`.
  - `onboarding.completedActions`.
  - `onboarding.celebratedMilestones`.

Guided tour and onboarding progress are per user and intentionally stored with settings because they are interface preferences, not community activity. Resetting guided tips clears dismissed/completed tip IDs without deleting onboarding progress or reading data. Restarting onboarding resets the onboarding state without changing shelves, ratings, reviews, journal entries, follows, goals, or activity.

## Discovery Signals

Community discovery does not use a standalone recommendation table. Home providers derive recommendations from existing data:

- Shelf entries and reader counts from `user_book`.
- Ratings and review counts from `user_book`.
- Recent shelf, finished, and rating activity from `user_activity`.
- Reviewer usernames from `app_user` for Recently Reviewed attribution.
- Review reactions from `user_activity_like` and `user_activity_comment`.
- Publication year and catalog metadata from `book`.

The provider layer ranks these aggregate signals in application code so each recommendation can expose a clear reason.

## Relationship Summary

- A user owns shelf entries, custom shelves, activity, progress events, auth state, profile data, follows, likes, comments, notifications, and feedback.
- A book belongs to the catalog and can be referenced by many users through shelf entries and activity.
- An author can have many books.
- A series can have many ordered book entries; entries can point to catalog books or known missing titles.
- Activity connects social interactions to a reader and book.
- Reviews are currently part of shelf entries, not separate objects.
- Custom shelves supplement the default shelf status model rather than replacing it.
