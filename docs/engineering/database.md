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

## Books

Entity: `book`

Stores local catalog records:

- Canonical work key.
- Title and primary author text.
- Optional `author_id`.
- ISBN-13, ISBN-10, Google Books ID.
- Synopsis, cover URL, language, page count, publisher, published year.
- Created and updated timestamps.

Relationships:

- May reference `author`.
- Has zero or more source records, genres, topic tags, collection entries, shelf entries, reading journal entries, activity rows, and progress events.

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
- A series-book entry may reference a catalog `book`, or may represent a missing/not-yet-cataloged title.
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
- A collection-book entry belongs to a catalog `book`.
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
- Status: `want_to_read`, `reading`, or `finished`.
- Rating.
- Total pages and current page.
- Finished date.
- Finished reflection.
- First-added and updated timestamps.

Relationships:

- Joins `app_user` and `book`.
- Source of ratings, reviews, shelf counts, reading progress, profile shelves, metrics, and admin user counts.

Current limitation:

- DNF is not a valid persisted status in the current table/API model.

## Reading Journal Entries

Entity: `reading_journal_entry`

Stores a private reader notebook entry for one user and one book:

- User and book.
- Started thoughts.
- Mid-book notes.
- Finished thoughts.
- Favorite quote.
- Would-reread flag.
- Recommended-to notes.
- Personal tags.
- Visibility value.
- Extensible metadata.
- Created and updated timestamps.

Relationships:

- Joins `app_user` and `book`.
- Requires the reader to have the book on a default shelf before creating or updating the journal entry.
- Used by the book page Reading Journal section and the private `/journal` search page.

Current limitation:

- The table supports `private`, `friends`, `public`, and `shared` visibility values for future expansion, but current access policy only exposes entries to the owning reader.

## Reading Progress Events

Entity: `user_reading_progress_event`

Created lazily by shelf/admin code. Stores forward reading movement:

- User and book.
- From page, to page, page delta.
- Recorded timestamp.

Relationships:

- Belongs to `app_user` and `book`.
- Used by profile momentum/streak, metrics, and My Reading Life calendar/streak summaries.

## My Reading Life And Timeline Data

My Reading Life does not introduce a new persistence table. It derives its summaries from existing entities:

- `user_book` for finished books, current books, ratings, pages, finished dates, and reflections.
- `user_reading_progress_event` for reading activity dates and page movement.
- `book`, `author`, `book_genre`, and `series_book`/`series` for catalog, author, genre, and series context.
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

Relationships:

- Belongs to `app_user` and `book`.
- Has likes, comments, and notifications.
- Feeds profiles, book pages, following feed, settings recent activity, and public activity API.

## Reviews

Reviews are not a separate table today. They are finished reflections stored on `user_book.finished_reflection`, optionally with `user_book.rating`.

Relationships:

- Shown through book-review helpers and profile/activity surfaces.

## Likes

Entity: `user_activity_like`

Created lazily by activity/admin/feed code. Stores one like per user per activity.

Relationships:

- Joins `user_activity` and `app_user`.
- Can create `user_notification` rows for the activity owner.

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

- Joins `app_user`, `user_custom_shelf`, and `book`.

## Feedback Events

Entity: `feedback_submission_event`

Tracks feedback submissions for rate limiting and reporting:

- Optional user.
- IP hash.
- Feedback type.
- Created timestamp.

Relationships:

- May reference `app_user`.

## Settings

Settings are stored inside `app_user.profile_data.settings`, not as standalone tables. Current groups include:

- Privacy.
- Reading defaults.
- Notifications.
- Data controls.
- Import controls.
- Personalization.

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
