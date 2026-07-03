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
- `/admin/data-health`: data health.
- `/admin/users`: user search and management.
- `/admin/users/[username]`: user detail and delete flow.

The Admin Overview quick-links also point admins to Metrics and Roadmap.

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
- Catalog merge tools for duplicate books.
- Safer self-service account deletion parity with admin deletion semantics.
