# Glossary

## Activity

A historical event tied to a reader and book. Implemented activity types include Want to Read, Started Reading, Finished, and Rating. Routine reading progress updates are stored separately as progress events and do not create feed activity.

## Admin

A signed-in user whose username appears in `ADMIN_USERNAMES`. Admins can access admin routes.

## Annual Reading Goal

A reader's target number of finished books for the current year. DogEared calculates progress from finished books with finished dates in that year.

## Achievement

A persistent, non-competitive badge earned from a meaningful reading milestone. Achievements use a shared definition for key, type, title, description, icon, accent color token, criteria, repeatability, and related Work or Series behavior. Earned achievements store the reader, definition, earned date, optional related Work or Series, visibility, and display metadata.

## Canonical Work

The reader-facing literary Work DogEared uses as the primary catalog identity. A Work represents the intellectual book and owns shelves, ratings, reviews, reading progress, series membership, recommendations, search identity, author-page display, and Readers Also Enjoyed identity.

## Canonical Work Resolution

The shared metadata lookup process DogEared uses before creating catalog entries. It scores ISBNs, provider identifiers, source mappings, Edition keys, title, author, structured series position, page count, publication year, and existing relationships to decide whether an incoming search/import/enrichment result should reuse an existing Work or create a new one.

## Canonical Title

The published title stored on a canonical Work without redundant series or edition suffixes. DogEared only strips parenthetical series metadata when structured series name and book-position metadata already prove the suffix is duplicated.

Meaningful subtitles are part of the canonical title. DogEared does not discard text after a colon unless it is clearly edition metadata handled outside the Work.

## Author

A catalog entity representing a writer. Books may reference an author record through `author_id`.

## Book

A legacy catalog row and compatibility representative for a Work in DogEared. During Work/Edition v1, existing routes and relationships still use representative `book` rows, but product behavior should think in Works first.

## Edition

A specific publication or format beneath a Work, such as hardcover, paperback, ebook, audiobook, translated edition, large print, illustrated edition, or publisher-specific edition. Editions own ISBN, publisher, format, language, publication date, page count, edition cover, and external edition IDs. Editions do not own shelves, ratings, reviews, reading progress, or series membership.

## Book Source

A source mapping between a DogEared book and an external source such as Google Books, Open Library, or NYT.

## Duplicate Work Candidate

An admin-review suggestion that two or more DogEared Works may represent the same book. Candidates are scored from canonical title, author, series position, ISBNs, edition keys, external identifiers, and existing Work relationships, then either merged or ignored by an administrator.

## Comment

A short response on activity. Comments are stored as activity comments and are limited to 500 characters.

## Editorial Collection

A manually curated set of books with an editorial title, slug, description, introduction, hero image, category, publication state, and ordered books. Collections are meant to feel like bookseller recommendations rather than popularity rankings.

## Collection Entry

The relation between a collection and a book. It stores custom ordering, an optional editor note explaining why the book belongs, and an optional featured quote.

## Custom Shelf

A user-created shelf with a name, slug, icon, and position. Books are attached through custom shelf-book rows.

## DNF

"Did Not Finish." DNF is referenced in roadmap/import filtering, but it is not currently a persisted default shelf status in the active shelf API.

## Finished Date

The date a reader finished a book. It is stored on the shelf entry and used by the annual reading goal.

## Finished Reflection

The persisted review body stored on a finished shelf entry. It remains the underlying body field for public Reviews v2.

## Follow

A relationship where one reader follows another reader. Following powers follow counts, following management, and the Following activity feed.

## Genre

Catalog metadata stored in `book_genre`. Genre pages are implemented through `/related?kind=genre&value=...`.

## Guided First Experience

Optional first-run guidance for signed-in readers. It combines a Home welcome card, checklist, reading goal prompt, recommendation education, milestone cards, and contextual tips without trapping readers in a wizard.

## Feedback Report

A reader-submitted Founding Reader feedback item or bug report with a tracking number, type, optional severity, diagnostic context, optional screenshots, and admin-only workflow fields.

## Feedback Status

Admin triage state for a Feedback Report: New, Investigating, Needs More Info, Planned, Fixed, or Closed.

## Founding Reader

An early DogEared reader helping shape the product before broad public availability. Founding Reader language should replace "Beta Tester" in public-facing copy.

## Founding Reader Mode

The global access mode that controls new account creation without deployment. Open allows normal signup, Waitlist records access requests for admin approval, and Invite Only only allows approved or invited readers to join.

## Founding Reader Waitlist

An admin-managed access request with email, optional display name, requested time, approved time, invited time, joined time, declined time, and a status of Pending, Approved, Invited, Joined, or Declined.

## Product Analytics

First-party aggregate usage signals used by DogEared admins to improve the reader experience. Product analytics covers growth, reading actions, search quality, discovery performance, first-run funnel steps, and feature adoption without exposing private journal content or reader-level behavior reports.

## Guided Tip

A reusable callout with a title, explanation, optional icon, primary action, and dismiss control. Completion and dismissal are stored per user.

## Onboarding State

Per-user settings under `profile_data.settings.guidedTour.onboarding` that track welcome completion, checklist visibility, prompt dismissals, completed first-run actions, and celebrated milestones.

## Like

A reaction on activity. Readers cannot like their own activity. Likes can create notifications.

## Magic Link

An email sign-in link with a hashed token, expiration, and used timestamp.

## Journal Entry

A private note record owned by one reader. It can be linked to a shelved book or kept as a general journal note, and stores an optional title, required body, journal date/time, one optional reading position, optional mood, personal tags, visibility metadata, and timestamps.

## Reading Position

Optional location metadata on a journal entry. DogEared stores one position per entry as a type and value: Page, Percent, Chapter, or Location.

## Momentum Score

A profile signal for Currently Reading books based on page progress, recency, elapsed days, and progress update count. It avoids predictions when confidence is low.

## My Reading Life

A private reader-facing page that reflects a signed-in reader's finished books, pages, streaks, goal progress, timeline, reading calendar, genres, authors, fun statistics, and yearly summaries.

## Notification

A low-noise in-app update for meaningful community, reading, discovery, milestone, or system activity. Notifications store a category, type, title, body, icon, optional action URL, read state, soft-delete state, grouping key, actor count, and diagnostic metadata so repeated events can be grouped calmly.

## Personal Tags

Reader-defined tags on private journal entries. They are searchable by the owning reader and are separate from public catalog genres or topic tags.

## Profile Data

JSON stored on `app_user.profile_data`. It contains profile fields and settings such as privacy, reading defaults, notification preferences, guided-tour progress, import controls, and personalization.

## Reader

A DogEared user with an account and, usually, a username/profile.

## Recommendation Feedback

A private signal a signed-in reader gives on a recommended book. Current UI actions are Interesting and Hide. Hiding stores `not_interested` feedback and removes the book from future personal recommendation results.

## Release

A published or draft DogEared version note with version, title, summary, release date, publication state, highlights, bug fixes, known issues, and optional migration notes. Published releases appear on `/release-notes`, feed Roadmap Recently Shipped, and power the once-per-version What's New modal.

## Release Status

Admin lifecycle state for a Release: Draft, Published, or Archived. Only Published releases are visible to readers.

## Recommended For You

DogEared's personalized recommendation section. It uses transparent reader activity such as shelves, ratings, completed books, favorite genres, enjoyed authors, and similar books, with a visible reason on every card.

## Reading Progress Event

A stored forward page movement for a reader and Work, with from-page, to-page, page delta, and recorded time.

## Reading Journal

A private reader-facing notebook for capturing thoughts while reading. The journal is searchable and filterable from `/journal`, and book-linked entries appear on book pages only for the owning reader.

## Reading Timeline

A private chronological history of finished books inside My Reading Life. The legacy `/reading-timeline` route redirects to `/reading-life#timeline` for backwards compatibility.

## Reading Streak

A count of consecutive reading/progress days derived from recorded reading updates.

## Review

A public recommendation written after finishing a Work. Reviews can include a star rating, optional title, optional body, spoiler flag, and update timestamp. Reviews belong to the Work, not an Edition, and are distinct from private Reading Journal entries.

## Shelf

A collection/state for a reader's books. Implemented default shelf statuses are Want to Read, Currently Reading, and Read. Custom shelves provide additional organization.

## Shelf Entry

The user-Work relation, represented by `user_book`, that stores a reader's status, optional edition, rating, total pages, current page, finished date, public review metadata, first-added timestamp, and update timestamp.

## Series

A catalog entity for an ordered set of Works. Series can store name, description, cover image, total-book count, and ordered entries.

## Series Entry

A book's position inside a series. Series entries can reference a DogEared book or represent a known missing title, and can store book order, publication order, and chronological order.

## Status

The default shelf state on a shelf entry. Valid persisted values are `want_to_read`, `reading`, and `finished`.

## Topic

Catalog metadata stored in `book_tag`. Topic pages are implemented through `/related?kind=topic&value=...`.
