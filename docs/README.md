# DogEared Product Bible

This directory is the entry point for understanding DogEared as it exists today. The Product Bible is based on the current Astro routes, API endpoints, database schema, and product copy in the repository.

## Product

- [Product Overview](product/overview.md): What DogEared is, who it serves, core workflows, major product areas, and the current product snapshot.
- [Product Philosophy](product/philosophy.md): Values, product principles, and the behaviors DogEared intentionally avoids.
- [Features](product/features.md): User-facing features grouped by category, with status and known limitations.
- [Personas](product/personas.md): Intended users and how DogEared supports their goals.
- [Glossary](product/glossary.md): Product terms used across the application and documentation.

## Engineering

- [Architecture](engineering/architecture.md): High-level organization of pages, components, APIs, services, utilities, and data flow.
- [Routes](engineering/routes.md): Current page and API routes, including purpose, authentication requirements, and major components.
- [Database](engineering/database.md): Major data entities and relationships without dumping SQL.
- [Admin](engineering/admin.md): Admin access, dashboard capabilities, data-health tooling, user management, and expansion points.

## Source Notes

This documentation should be regenerated from the implementation when product behavior changes. Useful source areas:

- `src/pages/` for pages and API routes.
- `src/components/` for shared UI surfaces.
- `src/lib/` for product logic, data access, policies, and services.
- `db/neon-schema.sql` and `db/migrations/` for baseline schema.
- Lazy schema creation in API/helper files for newer tables not present in the baseline schema.
