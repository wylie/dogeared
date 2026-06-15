# SEO and Sharing

This document describes Dogeared's metadata, social preview, and installable icon assets. Visual decisions follow `/docs/style-guide.md`.

## Metadata Architecture

- `src/lib/seo.ts` resolves canonical URLs, page titles, descriptions, and social image URLs.
- `src/layouts/Layout.astro` emits canonical, Open Graph, Twitter card, icon, manifest, and structured-data tags.
- Pages pass meaningful titles and descriptions to `Layout`. Book and author pages use their cover or portrait when one is available, with `/public/og-image.png` as the shared fallback.
- Production canonical URLs resolve against `https://dogeared.app/`.

## Asset Locations

- Open Graph fallback: `/public/og-image.png` at 1200x630.
- Future OG artwork reference: `/docs/assets/og-image-artwork-reference.png`.
- Apple touch icon: `/public/apple-touch-icon.png` at 180x180.
- SVG favicon: `/public/favicon.svg`.
- ICO favicon: `/public/favicon.ico` at 32x32.
- Android/manifest icons: `/public/icons/icon-192.png` and `/public/icons/icon-512.png`.
- Web app manifest: `/public/manifest.webmanifest`.

## Replacing Artwork

1. Keep the same filenames so metadata and installed shortcuts do not break.
2. Export `og-image.png` as a 1200x630 PNG with the Dogeared name readable at small preview sizes.
3. Export `apple-touch-icon.png` as a 180x180 opaque PNG with safe padding; iOS applies its own corner mask.
4. Export manifest icons as opaque 192x192 and 512x512 PNGs with enough padding for maskable icon crops.
5. Run `npm test`, `npm run build`, and inspect the built files under `dist/client/`.

The current OG image is the active exact-logo placeholder. The artwork reference was generated as a calm independent-bookstore scene using the style-guide palette and can be used as a background for future final artwork.

## CI Findings

### Required Secret Failure

The `Metadata Backfills` workflow maps `secrets.DATABASE_URL` to the job environment and previously failed with only `Missing DATABASE_URL secret.` The workflow has no alternate credential source, so that message means the repository Actions secret is absent or empty. The local `.env` value and Vercel environment values are not available to GitHub Actions.

Add `DATABASE_URL` under **Repository Settings > Secrets and variables > Actions**, then rerun the workflow. `GOOGLE_BOOKS_API_KEY` remains optional for backfill stages that can skip external enrichment. Secret validation remains strict and now emits a GitHub error annotation with the configuration path.

### Production Audit Failure

The audit failed because the locked production graph included:

- `GHSA-gv7w-rqvm-qjhr`, a high-severity `esbuild` advisory affecting versions before 0.28.1.
- `GHSA-fx2h-pf6j-xcff`, a high-severity Vite advisory affecting Vite through 7.3.4.

The previous `path-to-regexp` allowlist did not cover these new findings. Its advisory, `GHSA-9wv6-86v2-598j`, is now fixed through the patched 6.3.0 release instead of being suppressed. Dependencies are updated and constrained to patched versions. The audit now explicitly uses `--omit=dev`, blocks every high/critical production finding, and prints advisory details without an allowlist.

### Workflow Upgrades

All workflows use Node 24-backed action majors: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6`, `actions/github-script@v8`, and `actions/dependency-review-action@v5`. CI runs `scripts/validate-ci-config.mjs` to prevent older Node 20-based majors from returning.
