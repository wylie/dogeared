# DogEared

DogEared exists to create a better place for readers.

It is built for people who love books, who want to track what they read, discover what’s next, and share those experiences with others.

DogEared is not driven by ads, algorithms, or profit. It is free to use, supported by optional donations, and designed with a focus on simplicity, usefulness, and respect for its users.

We believe books are for everyone. No book should be hidden, restricted, or left behind because of trends, systems, or gatekeeping.

This is a space for readers, built and maintained with care, where the goal is not growth at all costs, but something better, a tool that stays useful, thoughtful, and true to the people who use it.

## Vercel + Neon Data Structure

DogEared now includes a Neon-ready schema for app-driven genre lists.
The catalog layer is designed to persist normalized book metadata and source identifiers only. Avoid storing or re-serving full third-party payloads unless the provider terms explicitly allow it.

### Files

- `db/neon-schema.sql`: core tables + `get_top_books_by_genre(...)` ranking function.
- `src/lib/catalog.ts`: catalog-source helpers for source mapping persistence.
- `src/lib/neon.ts`: Vercel server runtime Neon client.
- `src/pages/api/lists/top.ts`: API route for Top books by genre.

### Environment Variables

Set this in local `.env` and in Vercel Project Settings:

- `DATABASE_URL`: Neon pooled connection string.
- `GOOGLE_BOOKS_API_KEY`: existing key for search/suggest routes.
- `BREVO_API_KEY`: API key for DogEared magic-link email delivery.
- `BREVO_FROM_EMAIL`: verified sender email used for magic-link emails.
- `BREVO_FROM_NAME`: optional sender name for magic-link emails.

### Quick Setup

1. Create a Neon project and copy its pooled `DATABASE_URL`.
2. Run `db/neon-schema.sql` in Neon SQL Editor.
3. Add `DATABASE_URL` to Vercel.
4. Deploy to Vercel.
5. Query top list route:
   - `/api/lists/top?genre=fantasy`
   - Optional: `limit` (1-50), `windowDays` (1-3650)

### Top List Strategy

`get_top_books_by_genre(...)` ranks titles from real user shelves:

- `reading` weighted highest
- `finished` weighted medium
- `want_to_read` weighted baseline
- plus unique reader count

## Support DogEared

If you find DogEared useful and want to help it grow, this is a simple way to do that.

<a href="https://www.buymeacoffee.com/wylie">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60">
</a>
