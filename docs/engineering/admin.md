# Admin

Admin functionality is implemented through server-rendered Astro pages and helper functions in `src/lib/admin.ts` and `src/lib/adminData.ts`.

## Access

Admins are signed-in users whose lowercased username appears in the `ADMIN_USERNAMES` environment variable. If the variable is absent, the default allowed username is `wylie`.

Non-admin users are redirected from admin pages to `/`.

Current limitation:

- There is no role table, permissions table, or multi-role admin UI. Access is username allow-list based.

## Admin Navigation

Admin routes:

- `/admin`: overview.
- `/admin/analytics`: aggregate product analytics.
- `/admin/beta-users`: beta reader control surface.
- `/admin/collections`: editorial collection management.
- `/admin/data-health`: data health.
- `/admin/feedback`: beta feedback triage.
- `/admin/operations`: beta operations control center for feedback workflow, recommendation/import/system health, feature flags, announcements, and release notes.
- `/admin/users`: user search and management.
- `/admin/users/[username]`: user detail and delete flow.

The Admin Overview quick-links point admins to the operational drill-down pages and public context pages where useful.

## Defensive Rendering

Admin pages must degrade gracefully. Operational data is useful during beta, but it should never be required for the page itself to render.

Rules:

- Use `src/lib/adminFormatting.ts` for defensive display helpers such as `formatNumber`, `formatDate`, `safePercent`, `percentOf`, `safeText`, and `safeArray`.
- Wrap admin data loads in `safeAdminLoad` when a failed query should not block the rest of the page.
- Render a lightweight in-page warning for the failed card, table, or section.
- Use neutral fallbacks such as `0`, `—`, `Unknown`, or `No data`.
- Avoid calling `.toLocaleString()`, `.toLocaleDateString()`, `.map()`, or object properties on values that may be null or undefined.
- Log admin load failures in development only. Do not expose raw database errors in production UI.
- POST actions should use `try/catch`; failed admin actions should show a clear status message instead of throwing.

Expected behavior:

- One failed analytics widget does not prevent the Admin Overview from rendering.
- Empty databases render empty states and zeros.
- Partial migrations render warnings where relevant while still showing unaffected sections.
- Admin pages remain `noindex,nofollow`.

## Release Operations

Before a private beta release, admins and maintainers should use `docs/release-checklist.md`.

Release readiness expects:

- Migrations applied before deploy.
- Zero SSR/runtime/browser console errors on primary routes.
- Successful tests and production build.
- Lighthouse, accessibility, and responsive checks.
- Verification that global login prompts, floating actions, feedback, support, and announcements render only where intended.

## Current Dashboard

Route: `/admin`

Shows:

- Total books.
- Total authors.
- Total users.
- Total shelf entries.
- Total reviews.
- Total comments.
- Total Currently Reading entries.
- Total completed books.
- New users this week.
- New books added this week.
- Reviews added this week.

Data comes from `loadAdminOverviewStats`.

## Collection Management

Route: `/admin/collections`

Admins can:

- Create editorial collections.
- Edit title, slug, subtitle, description, editorial introduction, hero image, category, and sort order.
- Add ordered books by book ID.
- Add optional editor notes and featured quotes per book.
- Publish collections.
- Archive collections.
- Mark published collections as featured for Home.

Publication states:

- `draft`: editable and hidden from public readers.
- `published`: visible on collection pages, Home when featured, Search, and author pages.
- `archived`: retained for admin history but hidden from public readers.

Current limitations:

- The editor is a simple form, not a rich CMS.
- Book ordering uses line-based input rather than drag-and-drop.
- There are no curator profiles, preview approvals, media uploads, partnership fields, or audit logs yet.

## Metadata Health

Route: `/admin/data-health`

Shows metadata coverage and gaps:

- Total books.
- Total authors.
- Missing author.
- Missing cover.
- Missing published year.
- Missing synopsis.
- Missing ISBN.
- Missing page count.
- Missing publisher.
- Books with/without genres.
- Authors without bio/photo.

It also lists unresolved page-count and publisher gaps.

## Import Health

Route: `/admin/data-health`

Shows reliability proxies for imports and shelf consistency:

- Total user-book rows.
- Active readers.
- Entries without total pages.
- Finished books without date.
- Currently Reading entries with zero progress.

## Duplicate Risk

Route: `/admin/data-health`

Shows duplicate catalog groups by canonical work key, including sample title/author and latest update time.

## Backfill Movement

Route: `/admin/data-health`

Shows books and authors updated in the last 24 hours and 7 days.

Current limitation:

- The page reports backfill movement but does not run backfill jobs. Backfills are exposed as scripts in `package.json`.

## User Management

Route: `/admin/users`

Admins can:

- Search by username or email.
- View joined date, last activity, shelf entry count, and review count.
- Open user detail.
- Delete users from the list with confirmation.

Route: `/admin/users/[username]`

Admins can view:

- Account identifiers.
- Joined and last-activity dates.
- Shelf entry count.
- Want to Read count.
- Currently Reading count.
- Read count.
- Review count.
- Comment count.
- Followers count.
- Following count.

Admins can delete the user from this page after typing a confirmation username.

## Delete Users

Admin delete-user logic removes reader-owned data:

- Notifications where the user is recipient or actor.
- Activity likes.
- Activity comments.
- Feedback submission events.
- Pending email changes.
- Magic links.
- Sessions.
- Reading progress events.
- Reading journal entries.
- Custom shelf book rows.
- Custom shelves.
- Follow relationships.
- Activity rows.
- Shelf entries.
- User account.

Catalog books and authors are preserved.

Safety behavior:

- Admins cannot delete their own account from the admin user detail page.
- Delete forms require confirmation prompts in the UI.

## Permissions

Current permission model:

- `resolveAdminSession` resolves current session.
- It loads the user's username.
- It compares the username to `ADMIN_USERNAMES`.
- Admin pages redirect if `isAdmin` is false.

No finer-grained permissions are implemented.

## Future Expansion Points

Reasonable future admin expansions based on current structure:

- Role/permission table instead of username allow-list.
- Read/write admin audit log.
- Backfill execution controls with job status.
- Notification moderation.
- Feedback management dashboard.
- Review/comment moderation.
- Rich editorial collection CMS with curator profiles, seasonal scheduling, and audit history.
- Catalog merge tools for duplicate books.
- Safer self-service account deletion parity with admin deletion semantics.
