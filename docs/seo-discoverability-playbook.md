# SEO Discoverability Playbook

This is the operating checklist for growing organic discovery after the SEO foundation pass.

## 1) Google Search Console Setup

1. Add domain property in Google Search Console.
2. Verify ownership:
   - Preferred: DNS TXT record at domain level.
   - Alternate: set `PUBLIC_GOOGLE_SITE_VERIFICATION` and deploy.
3. Submit sitemap: `https://<your-domain>/sitemap.xml`.
4. Inspect and request indexing for:
   - `/`
   - 5 book URLs (`/book?bookId=...`)
   - 5 author URLs (`/author/<slug>`)
   - 3 public profiles (`/profile/<username>`)

## 2) Weekly KPI Review (Search Console)

Track these every week in a sheet:

- `Impressions` (site total)
- `Clicks` (site total)
- `CTR` (site total)
- `Average position` (site total)
- Top pages by impressions (top 20)
- Top queries by impressions (top 20)
- Coverage counts:
  - Indexed
  - Crawled - currently not indexed
  - Discovered - currently not indexed
  - Excluded by `noindex`

## 3) Page Template KPI Cuts

Group pages by template and track trend:

- Home: `/`
- Books: `/book?bookId=*`
- Authors: `/author/*`
- Profiles: `/profile/*`
- Related: `/related?kind=genre|topic&value=*`

For each template, monitor:

- impressions
- clicks
- CTR
- average position

## 4) Actions Based on KPI Signals

- High impressions + low CTR:
  - Improve title and meta description for that template.
- Low impressions + decent CTR:
  - Add more internal links to those pages from high-traffic pages.
- Rising impressions, flat clicks:
  - Improve snippet quality, structured data completeness, and title intent match.
- Large excluded/discovered counts:
  - Audit URL hygiene and canonical usage.

## 5) Monthly Technical Checks

1. Validate `robots.txt` and `sitemap.xml` are returning `200`.
2. Ensure sitemap contains fresh URLs for books/authors/profiles.
3. Spot-check canonicals on:
   - `/book`
   - `/author`
   - `/related`
   - `/profile/<username>`
4. Verify `noindex` pages are intentionally blocked (settings/following/metrics/admin/search results).
