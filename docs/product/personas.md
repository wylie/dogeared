# Personas

## Casual Reader

Casual readers want a simple place to remember books they want to read and books they have finished.

Goals:

- Save books without maintaining a complex system.
- Quickly mark a book Currently Reading or Read.
- Rate a finished book.
- Keep a small profile and reading history.

How DogEared helps:

- Default shelves keep the model simple.
- Search and book detail pages make saving books direct.
- Reading goal and metrics remain optional context.
- Privacy controls let casual readers decide how public they want to be.

## Heavy Reader

Heavy readers maintain active shelves, ratings, reviews, and long-term history.

Goals:

- Track many books across statuses.
- Import existing history.
- Add ratings and short reflections.
- Use metrics to understand patterns.
- Organize books beyond default shelves.

How DogEared helps:

- Goodreads import supports large CSV migration.
- Custom shelves add personal organization.
- Profiles show Currently Reading, Want to Read, Read, and custom shelves.
- Metrics, streaks, momentum, and annual goals summarize progress without turning reading into competition.

## Book Club Reader

Book club readers want shared context and light discussion around what people are reading.

Goals:

- Follow other readers.
- See what trusted readers are reading or finishing.
- Comment on activity.
- Discover books through community activity.

How DogEared helps:

- Following feed gathers activity from followed readers.
- Likes and comments support small conversations.
- Reader suggestions and profiles help find people to follow.
- Book and activity surfaces keep the book at the center.

Current limitation:

- Dedicated book clubs, reading groups, and buddy reads are roadmap/future work.

## Librarian Or Curator

Librarians, booksellers, and curators care about discovery, metadata, authors, genres, and lists.

Goals:

- Explore authors and books.
- Browse genre/topic collections.
- See what readers are shelving.
- Maintain curated custom shelves.

How DogEared helps:

- Books, Authors, Author detail, and Related pages expose catalog structure.
- Genre pages show active books and related authors.
- Custom shelves can represent curated lists.
- Top-by-genre API reflects real shelf activity.

Current limitation:

- Public shareable reading lists are planned, not currently implemented as a dedicated feature.

## Administrator

Administrators maintain product reliability, data quality, and account safety.

Goals:

- Monitor total books, authors, users, shelves, reviews, comments, and active reading.
- Find metadata gaps and duplicate risks.
- Inspect import health.
- Search and manage user accounts.
- Delete abusive or test accounts without damaging catalog data.

How DogEared helps:

- Admin Overview gives site-level counts.
- Admin Data Health shows catalog and import diagnostics.
- Admin Users supports search and detail inspection.
- Delete-user tooling removes reader-owned data while preserving catalog books and authors.

Current limitation:

- Admin access is controlled by configured usernames rather than a full roles/permissions system.
