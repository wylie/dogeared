# Pre-Release Checklist

Use this checklist before private beta releases and production deploys.

## Schema

- Confirm all migrations in `db/migrations/` have been applied to the target database.
- Confirm `db/neon-schema.sql` and migrations agree on core columns used by runtime queries.
- Verify beta support tables exist before launch-critical flows depend on them:
  - `user_custom_shelf`
  - `user_custom_shelf_book`
  - `feedback_submission`
  - `product_analytics_event`
  - `admin_feedback_issue`
  - `admin_feature_flag`
  - `admin_announcement`
  - `admin_release_note`
- Treat lazy schema creation as a development safety net, not the primary production migration path.

## Runtime

- Run the production build.
- Run the full test suite.
- Run linting and formatting commands when scripts exist.
- Start the app locally or in preview.
- Navigate the primary routes:
  - Home
  - Discover
  - Search
  - Books
  - Authors
  - Collections
  - Book detail
  - Profile
  - Following
  - My Reading Life
  - Reading Journal
  - Settings
  - Admin
  - Feedback
- Verify zero SSR errors, runtime errors, unhandled promise rejections, and browser console errors.

## Global UI

- Verify the login prompt appears only on reader/product surfaces where account creation or sign-in is an expected next step.
- Verify informational pages such as Mission, Privacy, Roadmap, and Support do not mount the global login modal.
- Verify authenticated and admin pages do not show logged-out onboarding prompts.
- Verify floating Feedback and Support actions remain visible, readable, keyboard accessible, and do not obscure critical page controls.
- Verify announcement banners only render when the announcement feature flag is enabled and an active announcement exists.

## Quality

- Run Lighthouse against Home and at least one content detail page.
- Confirm Accessibility remains at 100 or document any unavoidable third-party/browser-extension warnings.
- Review desktop and mobile layouts for horizontal overflow, clipped controls, and layout shifts.
- Confirm responsive behavior for BookCards, navigation, floating actions, modals, and admin tables.
