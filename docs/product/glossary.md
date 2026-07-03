# Glossary

## Activity

A historical event tied to a reader and book. Implemented activity types include Want to Read, Currently Reading, Finished, and Rating.

## Admin

A signed-in user whose username appears in `ADMIN_USERNAMES`. Admins can access admin routes.

## Annual Reading Goal

A reader's target number of finished books for the current year. DogEared calculates progress from finished books with finished dates in that year.

## Author

A catalog entity representing a writer. Books may reference an author record through `author_id`.

## Book

A catalog entity for a title/work in DogEared. Book records store metadata such as author, ISBNs, Google Books ID, synopsis, cover, language, page count, publisher, published year, genres, tags, and source links.

## Book Source

A source mapping between a DogEared book and an external source such as Google Books, Open Library, or NYT.

## Comment

A short response on activity. Comments are stored as activity comments and are limited to 500 characters.

## Custom Shelf

A user-created shelf with a name, slug, icon, and position. Books are attached through custom shelf-book rows.

## DNF

"Did Not Finish." DNF is referenced in roadmap/import filtering, but it is not currently a persisted default shelf status in the active shelf API.

## Finished Date

The date a reader finished a book. It is stored on the shelf entry and used by the annual reading goal.

## Finished Reflection

The written review/reflection stored on a finished shelf entry. It is capped at 280 characters by the shelf API.

## Follow

A relationship where one reader follows another reader. Following powers follow counts, following management, and the Following activity feed.

## Genre

Catalog metadata stored in `book_genre`. Genre pages are implemented through `/related?kind=genre&value=...`.

## Like

A reaction on activity. Readers cannot like their own activity. Likes can create notifications.

## Magic Link

An email sign-in link with a hashed token, expiration, and used timestamp.

## Momentum Score

A profile signal for Currently Reading books based on page progress, recency, elapsed days, and progress update count. It avoids predictions when confidence is low.

## Notification

A record created when another reader likes or comments on a user's activity. Current notification types are `activity_like` and `activity_comment`.

## Profile Data

JSON stored on `app_user.profile_data`. It contains profile fields and settings such as privacy, reading defaults, notification preferences, import controls, and personalization.

## Reader

A DogEared user with an account and, usually, a username/profile.

## Reading Progress Event

A stored forward page movement for a reader and book, with from-page, to-page, page delta, and recorded time.

## Reading Streak

A count of consecutive reading/progress days derived from recorded reading updates.

## Review

DogEared's current review model is a finished-book reflection, optionally paired with a rating.

## Shelf

A collection/state for a reader's books. Implemented default shelf statuses are Want to Read, Currently Reading, and Read. Custom shelves provide additional organization.

## Shelf Entry

The user-book relation that stores a reader's status, rating, total pages, current page, finished date, finished reflection, first-added timestamp, and update timestamp.

## Series

A catalog entity for an ordered set of books. Series can store name, description, cover image, total-book count, and ordered entries.

## Series Entry

A book's position inside a series. Series entries can reference a DogEared book or represent a known missing title, and can store book order, publication order, and chronological order.

## Status

The default shelf state on a shelf entry. Valid persisted values are `want_to_read`, `reading`, and `finished`.

## Topic

Catalog metadata stored in `book_tag`. Topic pages are implemented through `/related?kind=topic&value=...`.
