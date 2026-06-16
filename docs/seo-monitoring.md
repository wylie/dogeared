# SEO Monitoring

Use `/docs/style-guide.md` as the source of truth for public-facing copy changes.

## Monthly Search Console Review

Track these counts:

- Indexed pages.
- Soft 404.
- Crawled - currently not indexed.
- Discovered - currently not indexed.
- Duplicate, Google chose different canonical.
- Alternate page with proper canonical.
- Excluded by `noindex`.
- Blocked by `robots.txt`.
- Submitted sitemap URLs.
- Indexed sitemap URLs.

## Template Buckets

Group inspected URLs by template:

- Home: `/`
- Books directory: `/books`
- Book detail: `/book?bookId=*`
- Authors directory: `/authors`
- Author detail: `/author/*`
- Related landing: `/related`
- Related genre/topic: `/related?kind=genre|topic&value=*`
- Profiles: `/profile/*`
- Utility/private pages

## Monthly Checks

1. Submit or refresh `https://dogeared.app/sitemap.xml`.
2. Confirm `https://dogeared.app/robots.txt` returns `200`.
3. Export excluded URLs from Search Console.
4. Spot-check 5 indexed books, 5 authors, 5 related pages, and 5 public profiles.
5. Confirm each sample has one canonical URL matching the sitemap where applicable.
6. Confirm noindexed pages are intentionally excluded.
7. Check whether Soft 404 and Crawled Not Indexed URLs are mostly thin related pages.
8. Add recurring weak metadata values to `src/lib/indexing.ts`.
9. Review internal links from books to authors, genres, topics, and related books.
10. Record actions and counts in the SEO tracker.

## Escalation Rules

- If Soft 404 rises for related pages, raise the related threshold or remove links to the weakest metadata values.
- If duplicate canonicals rise for authors, inspect `/author?authorId=*` and `/author/*` redirects.
- If duplicate canonicals rise for genres/topics, normalize labels or move durable genres to clean `/genre/<slug>` URLs.
- If Crawled Not Indexed rises for books, improve synopsis, cover, reader counts, reviews, and related links.
- If public profiles are Crawled Not Indexed, only keep profiles indexable when they have meaningful public shelf content.

## Success Targets

- Fewer Soft 404 pages.
- Fewer Crawled Not Indexed related URLs.
- Fewer duplicate canonical author and genre URLs.
- Sitemap contains only canonical, indexable URLs.
- Book and author pages earn impressions for title, author, and genre queries.
- Crawl budget shifts away from utility URLs and weak metadata pages.
