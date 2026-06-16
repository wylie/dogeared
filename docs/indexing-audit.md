# Indexing Audit

Source of truth for product tone and UI language: `/docs/style-guide.md`.

## Indexing Strategy

Dogeared should optimize for indexing quality, not raw page count. Google should primarily discover pages that help readers find books, authors, genres, topics, public reader profiles, and public product context.

## Should Be Indexed

- `/`: home and primary discovery surface.
- `/books`: curated public book discovery.
- `/authors`: public author directory.
- `/author/<slug>`: canonical author pages with books and reader activity.
- `/book?bookId=<id>`: canonical Dogeared book records with shelf activity.
- `/related`: related landing page for popular public discovery clusters.
- `/related?kind=genre&value=<value>`: only when the collection passes quality thresholds.
- `/related?kind=topic&value=<value>`: only when the collection passes quality thresholds.
- `/profile/<username>`: only public profiles with public shelf or activity content.
- `/roadmap` and `/mission`: public product context.

## Should Not Be Indexed

- `/search`: user-entered search results.
- `/settings`, `/welcome`, `/following`, `/myreads`, `/feed`, `/metrics`, `/admin/*`: private, utility, or internal pages.
- `/api/*`: machine endpoints.
- `/author?authorId=<id>`: legacy resolver, redirected to `/author/<slug>`.
- `/related?kind=author&value=<name>`: duplicate of the canonical author page.
- `/related?kind=book&value=<title>`: duplicate of the canonical book page.
- Thin related genre/topic URLs with fewer than 5 books, fewer than 3 unique authors, and no clear discovery value.
- Weak metadata topics such as `Large Type Books`, `Form`, `Internet`, and `Legislators' spouses`.
- External preview book URLs without a canonical Dogeared book record.

## Current Issues Found

- The sitemap included `/metrics`, even though the page is `noindex`.
- The sitemap listed authors as `/author?authorId=...` while clean `/author/<slug>` pages also existed.
- `/author/[slug]` redirected canonical authors back to the query-string route, creating duplicate canonical risk.
- Related URLs were indexable by default, including empty, thin, duplicate, and weak metadata pages.
- Topic related pages were allowed by URL policy but did not load topic-specific books, making many topic URLs thin.
- Public profile pages could be indexable with a username alone, even if they had no shelf/activity content.
- Book pages for external lookup previews could be indexable before they had a canonical Dogeared record.

## Fixes Applied

- Added shared indexing rules in `src/lib/indexing.ts`.
- Consolidated canonical author URLs on `/author/<slug>`.
- Converted `/author?authorId=...` into a 301 resolver to the clean author URL.
- Added related-page thresholds:
  - index when a genre/topic has 5+ books, or 3+ unique authors, or a known discovery genre with reader activity;
  - noindex weak, thin, author, and book related URLs;
  - keep noindexed related URLs crawlable with `noindex,follow` so link equity can pass to books/authors.
- Added topic book loading to `/related`.
- Removed `/metrics` from sitemap.
- Changed sitemap author URLs to clean slugs.
- Limited sitemap book URLs to shelved canonical book records.
- Added only indexable genre/topic related URLs to the sitemap.
- Required public profiles to have shelf/activity content before `index,follow`.
- Set external book preview pages to `noindex,follow`.

## Canonical Rules

- Home: `/`.
- Books directory: `/books`.
- Authors directory: `/authors`.
- Author detail: `/author/<slug>`.
- Book detail: `/book?bookId=<id>`.
- Related landing: `/related`.
- Related genre/topic: normalized `/related?kind=<genre|topic>&value=<Canonical Value>`.
- Duplicate related author: canonical author page.
- Duplicate related book: canonical book page.

## Robots And Blocks

Keep blocking:

- `/api/`
- `/admin/`
- `/search`
- `/settings`
- `/following`
- `/myreads`
- `/feed`
- `/metrics`

Do not block canonical public discovery pages. Prefer `noindex,follow` over robots blocking for duplicate/thin public HTML pages that contain useful links.

## Long-Term Recommendations

- Promote major genres to clean URLs such as `/genre/science-fiction` when the app has a dedicated genre template.
- Consider clean topic URLs only for curated, durable topics.
- Keep Open Library and other imported metadata behind thresholds before exposing crawlable links.
- Review Search Console exclusions monthly and add new weak metadata terms to the indexing policy when patterns repeat.
