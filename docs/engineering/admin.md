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
- `/admin/performance`: operational performance analytics.
- `/admin/founding-readers`: Founding Reader access, capacity, waitlist, and active reader control surface.
- `/admin/beta-users`: compatibility redirect to `/admin/founding-readers`.
- `/admin/releases`: release creation, editing, publishing, archiving, and previews.
- `/admin/collections`: editorial collection management.
- `/admin/data-health`: data health.
- `/admin/feedback`: Founding Reader feedback triage.
- `/admin/operations`: early-access operations control center for feedback workflow, recommendation/import/system health, feature flags, and announcements.
- `/admin/users`: user search and management.
- `/admin/users/[username]`: user detail and delete flow.

The Admin Overview quick-links point admins to the operational drill-down pages and public context pages where useful.

## Defensive Rendering

Admin pages must degrade gracefully. Operational data is useful during early access, but it should never be required for the page itself to render.

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

Before a Founding Reader or private release, admins and maintainers should use `docs/release-checklist.md`.

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

## Founding Reader Management

Route: `/admin/founding-readers`

Admins can:

- Switch DogEared between Open, Waitlist, and Invite Only access modes without deployment.
- Set target reader capacity.
- Enable or disable automatic Open-to-Waitlist behavior when capacity is reached.
- Review waitlist requests.
- Approve, invite, decline, or remove requests.
- Review active readers with onboarding and activity metrics.
- Use future-ready account actions: impersonate, resend login link, export, deactivate, and delete.

Data comes from `src/lib/foundingReaders.ts`, `founding_reader_config`, `founding_reader_waitlist`, and the active reader summary query in `loadAdminBetaUsers`.

Public-facing copy should use "Founding Reader" rather than "Beta Tester". Development or seed accounts should remain hidden from production reader surfaces under the shared public reader policy.

## Release Management

Route: `/admin/releases`

Admins can:

- Create draft releases.
- Edit version, title, summary, release date, highlights, bug fixes, known issues, and migration notes.
- Preview release content before publishing.
- Publish a release for readers.
- Archive a release when it should no longer appear publicly.

Published releases appear on `/release-notes`, feed the Roadmap Recently Shipped section, and drive the once-per-version What's New modal. Draft and archived releases remain admin-only.

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
- Format-aware Catalog Metadata records, including missing page counts, missing descriptions, missing audiobook duration, missing location/chapter counts, missing identifiers, missing Series position, malformed Work titles, potential duplicate Works, and progress-blocking normalization gaps.

## Catalog Metadata Editor

Route: `/admin/books/[workId]`

Admin-only Work and Edition editor reached from Data Health or the Book Detail admin shortcut.

Work-level fields:

- Title and canonical title.
- Primary author.
- Description, subjects, and genres.
- Series and Series position.
- Original publication year.
- Preferred cover URL.

Edition-level fields:

- Format.
- ISBN-10 and ISBN-13.
- Publisher.
- Publication date and year.
- Page count.
- Cover URL.
- Google Books and Open Library IDs.
- Language.
- Audiobook duration, stored as seconds in Edition metadata.
- Location count and chapter count, stored in Edition metadata.

Safety rules:

- Regular readers cannot access the route.
- Edits preserve shelves, reading progress, journal entries, ratings, reading formats, reading dates, finish dates, and activity.
- Manual changes update metadata provenance and manual override fields.
- Each save writes an `admin_catalog_audit_event`.
- The editor shows an impact preview before saving reader-adjacent catalog metadata.
- Data Health issue styling is applied only to affected controls. The editor keeps Work and Edition sections lightweight with headings, spacing, subtle dividers, shrink-safe grids, and full-width controls to avoid overflow.

## Catalog Metadata Health

Route: `/admin/data-health#catalog-metadata`

The Catalog Metadata queue is the single metadata review table. Raw health checks still run independently, but the page aggregates them into one row per affected Edition when an Edition-specific issue exists, or one row per Work for Work-level issues. Each row shows the cover, title, author, Work ID, Edition ID when available, a compact Needs attention list, the highest-severity issue as the row severity, format, source, updated date, and one Catalog Editor link.

The queue is server-paginated at 25 unique records per page and uses the shared `Pagination` component. Search, Issue, Severity, Format, Provider, and page state live in query parameters so admins can refresh, use Back, and return from an editor visit without losing context. Filter and quick-filter changes intentionally omit `catalog_page`, resetting the queue to Page 1.

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

## Performance Analytics

Route: `/admin/performance`

Admins can:

- Review measured operation volume, p50, p95, p99, error rate, and slow-operation count for the selected period.
- Compare Search, Save Progress, Shelf Mutations, Page Rendering, and External Book API workflow latency against workflow-specific targets.
- Sort route/API performance by slowest p95, highest traffic, or highest error rate.
- Inspect timing-span breakdowns for workflows such as Search, progress saves, shelf mutations, and page rendering.
- See Google Books and Open Library call counts, p50/p95 latency, failure rate, and timeout count.
- Review recent slow or failed operations with release version and dominant span.
- Open a request detail view for slow operations with a summary, bottleneck callout, waterfall, nested span breakdown, sanitized diagnostic counts, and sortable span table.
- Compare p95 latency by release to spot regressions or verify optimization work.

Data comes from `src/lib/performanceTelemetry.ts` and the `performance_event` table.

Privacy and reliability rules:

- Performance telemetry is operational, not product analytics.
- Recording must be fire-and-forget and must not materially slow the measured request.
- Normal successful requests may be sampled; errors and unusually slow operations are always retained.
- Raw request traces are retained for 45 days; aggregate percentile and span summaries can be used for longer-term release review.
- Events must not store search queries, book titles, journal content, emails, usernames, profile content, authorization data, raw SQL, database credentials, or sensitive payloads.
- Empty periods should explain that telemetry will populate with traffic instead of rendering zero values as measured health.

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
