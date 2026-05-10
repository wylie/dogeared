# Release Process

Dogeared uses semantic versioning and GitHub Releases.

## Versioning

- `PATCH` releases, such as `0.1.1`, are for bug fixes, copy changes, and small UI polish.
- `MINOR` releases, such as `0.2.0`, are for user-facing features and finished roadmap items.
- `MAJOR` releases, such as `1.0.0`, are for major launch milestones, breaking behavior changes, or data changes that need special coordination.

While Dogeared is pre-1.0, minor releases can contain larger product changes.

## Prepare a Release

1. Choose the version bump:

   ```sh
   npm run release:patch
   npm run release:minor
   npm run release:major
   ```

2. Move the relevant notes from `CHANGELOG.md` under a new dated version heading.

3. Run the release check:

   ```sh
   npm run release:check
   ```

4. Commit the version and changelog changes:

   ```sh
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "Release v0.1.0"
   ```

5. Tag the release:

   ```sh
   git tag -a v0.1.0 -m "v0.1.0"
   ```

6. Push the commit and tag:

   ```sh
   git push origin main
   git push origin v0.1.0
   ```

7. Create a GitHub Release from the tag and paste the matching changelog section into the release notes. GitHub can also generate commit-based notes using `.github/release.yml`.

## Security + Dependency Maintenance Rhythm

Use this regular loop to keep risk low and updates small:

1. Let Dependabot open weekly PRs for `npm` and GitHub Actions updates.
2. Review and merge low-risk updates quickly, grouped by ecosystem where possible.
3. Run local checks before merge:

   ```sh
   npm run deps:audit
   npm run release:check
   ```

4. Use the `Security and Dependency Maintenance` workflow as the scheduled guardrail:
   - runs weekly,
   - runs dependency review on PRs,
   - fails on high/critical production dependency vulnerabilities,
   - uploads outdated dependency reports as artifacts.

## Changelog Format

Use these headings when they apply:

- `Added`
- `Changed`
- `Fixed`
- `Removed`
- `Security`

Keep changelog entries user-facing. Internal refactors only need to be included when they affect release risk, deployment, or maintenance.
