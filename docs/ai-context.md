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

## Founding Reader Data Policy

Production-facing reader surfaces must not show development or seed accounts.

This applies to:

- recommendations
- followers and following
- public profile discovery
- public book activity
- reviews
- comments
- notifications

DogEared should exclude accounts that are deleted, hidden, suspended, private where public visibility is required, or marked internally as test, seed, fixture, internal, placeholder, or development data. This includes common flag variants such as `is_test`, `is_seed`, `is_fixture`, `is_internal`, and equivalent camelCase names.

Usernames that clearly identify seed/development accounts, such as `test`, `demo`, `seed`, `fixture`, `placeholder`, `codex-progress-test`, and admin seed users, should not appear in production recommendations or public social surfaces.

If development seed accounts are useful for local QA, gate them behind development-only behavior. Do not fill empty recommendation space with test users. Use a friendly empty state instead.

Recommendation filtering lives in the shared public reader policy so pages do not invent their own exclusion rules.

---

## Admin Operations

The Admin area is DogEared's Founding Reader operations hub.

Admin architecture:

- `/admin` is the executive dashboard with concise operational cards and drill-down links.
- `/admin/founding-readers` is the Founding Reader control surface for access mode, waitlist approvals, capacity, onboarding, activity, and future account operations.
- `/admin/users` remains the direct account management surface for search, detail review, and deletion.
- `/admin/data-health` owns catalog and import-quality diagnostics.
- `/admin/operations` owns feedback triage, recommendation health, import/system status, feature flags, announcements, and release notes.

Operational pages must be admin-only and marked `noindex,nofollow`.

Founding Reader operations should favor honest signals over vanity metrics. If instrumentation does not exist yet, show the gap clearly instead of displaying fake values.

Founding Reader access:

- DogEared supports Open, Waitlist, and Invite Only modes without deployment.
- Open allows normal magic-link account creation.
- Waitlist records access requests and lets admins approve or invite readers before account creation.
- Invite Only explains that DogEared is growing carefully and records access requests without creating accounts.
- Capacity can automatically treat Open as Waitlist when active readers reach the configured target.
- Founding Reader configuration lives in `founding_reader_config`; access requests live in `founding_reader_waitlist`.

Feedback workflow:

- Feedback submissions create admin feedback issues.
- Issues support status, future assignee, internal notes, resolution version, and duplicate marking.
- Admin notes are never public-facing.

Feature flags:

- Flags are simple admin-managed toggles for rollout planning.
- A disabled flag should be treated as the default unless product code explicitly reads and honors that flag.
- New flags should include a human-readable label and description.

Announcements:

- Admins can create draft, active, and archived announcements.
- App-wide rendering should be controlled by an announcement feature flag.
- Announcements should be dismissible by default.

Release notes:

- Release notes are lightweight early-access history, not marketing pages.
- Notes should describe meaningful user-facing or operational changes in concise language.

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
