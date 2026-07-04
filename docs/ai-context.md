## Project Overview

Dogeared is a social reading and book-tracking platform inspired by Goodreads.

Primary goals:

- Track reading progress
- Manage shelves
- Write reviews and ratings
- Discover books
- View friend activity
- Build a reader-focused community

The platform is intentionally community-first and does not rely on advertising.

---

## Technology

- Astro
- TypeScript
- Vercel
- Neon Postgres
- Tailwind CSS

---

## Product Principles

### Reader First

Every feature should help readers:

- Find books
- Read books
- Finish books
- Discuss books

Avoid adding features that distract from reading.

---

### Simplicity

Prefer simple interfaces over feature-heavy interfaces.

If a solution requires additional complexity, justify it.

---

### Reliability

Shelf updates, ratings, reviews, and reading progress must be highly reliable.

User trust is more important than adding new features.

---

## Reading Progress Rules

A user can:

- Want To Read
- Currently Reading
- Finished
- Custom shelves

Finished books should never remain in Currently Reading.

DNF is planned but not currently a persisted default shelf status in the active shelf API.

---

## Prediction Rules

Reading predictions should only appear when sufficient data exists.

Never display:

- At Risk
- Behind Schedule
- Finish Predictions

when:

- the user has only one progress update
- there is insufficient reading history
- confidence is low

Fallback messaging should be short and neutral.

Preferred:

"Reading pattern forming"

Avoid:

"Too early to estimate your reading pace accurately."

---

## Reviews

A review consists of:

- Optional star rating
- Optional written review

Reviews should appear:

- On book detail pages
- In profile activity
- In review sections

Users should always see their own reviews.

---

## Activity Feed

Activity should prioritize:

1. Reviews
2. Ratings
3. Finished books
4. Progress updates

Low-value activity should be minimized.

---

## Development Rules

Important:

- Minimize repository exploration.
- Avoid unrelated refactors.
- Preserve existing design patterns.
- Prefer targeted fixes.
- Add tests for bug fixes.
- Run tests before completion.

---

## Commit Rules

Create logical commits.

Do not push.

Allow user review before push.
