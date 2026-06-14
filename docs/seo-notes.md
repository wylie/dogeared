# SEO Notes

## Root Cause

Google Search Console's breadcrumb warning came from `BreadcrumbList` JSON-LD emitting relative `item` URLs like `/`, `/books`, and `/author?...` instead of fully-qualified canonical URLs. A few non-breadcrumb schema `url` fields were using the same relative-path pattern, and some pages rendered breadcrumb UI without matching JSON-LD.

## Affected Pages

- Books
- Authors
- Book detail
- Author detail
- Related / genre detail
- Profile
- Profile followers
- Roadmap / support

## Fix Implemented

- Added shared helpers in `src/lib/seo.ts` for site URL resolution, absolute URL generation, and guarded breadcrumb schema generation.
- Replaced page-level breadcrumb builders with the shared helper.
- Converted affected structured-data `url` fields to absolute canonical URLs.
- Added defensive handling so invalid breadcrumb entries are skipped instead of being emitted.
- Enabled development logging when breadcrumb URL generation fails.

## Future Structured-Data Considerations

- Keep JSON-LD URL generation on the shared SEO helper path.
- Do not emit relative URLs in schema fields.
- Add schema tests when new breadcrumb-bearing pages are introduced.
- Keep the production site URL configured consistently across runtime and build environments.
