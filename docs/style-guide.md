# Dogeared Style Guide

This document is the source of truth for Dogeared product UI, design, and copy decisions. Future implementation prompts should explicitly reference `/docs/style-guide.md`.

## Brand Feel

Dogeared should feel:
- thoughtful
- literary
- welcoming
- community-focused
- calm
- human

Dogeared should evoke:
- an independent bookstore
- a local library
- a personal reading journal
- a community of readers

Dogeared should avoid feeling like:
- enterprise software
- social media
- a productivity tracker
- a gamified reading app

## Color System

Current palette and UI tokens from implementation (`src/assets/global.css`):

- `--palette-1`: `#f94144`
- `--palette-2`: `#f3722c`
- `--palette-3`: `#fbc789`
- `--palette-4`: `#f9844a`
- `--palette-5`: `#C8DEEB`
- `--palette-6`: `#bfd9ab`
- `--palette-7`: `#43aa8b`
- `--palette-8`: `#4d908e`
- `--palette-9`: `#577590`
- `--palette-10`: `#277da1`

Semantic tokens:

- Background: `--color-bg`, `--background-color` (`#C8DEEB`)
- Surface/Card: `--color-surface` (`#ffffff`)
- Border/Dividers: `--color-border` (`#577590`), `--color-divider` (`#ffffff`)
- Primary text: `--color-text` (`#222222`)
- Primary action: `--color-primary` (`#1f7a45`), hover `--color-primary-hover` (`#176339`)
- Links/secondary action: `--color-secondary` (`#1f5d87`), hover `--color-secondary-hover` (`#1b4f74`)
- Highlight/accent chips: `--color-highlight`, `--color-accent`
- Reading actions: use `--color-primary` family
- Ratings: `--color-rating` (`#f9844a`)
- Success state: use primary green family (`--color-primary`)
- Warning state: warm orange family (`--palette-2`, `--palette-4`)
- Error/destructive state: red family (`#991b1b`, `#8a1d1d`, `--palette-1`)
- Genre metadata: `--color-chip-genre`; use `Chip` with `kind="genre"` everywhere
- Topic metadata: `--color-chip-topic`; use `Chip` with `kind="topic"` everywhere

Genres and topics are separate metadata types. Do not render them with page-specific colors, and do not repeat chip metadata as plain text beneath the chip row.

## Typography

- App body and UI baseline: `"Outfit", sans-serif`
- Logo/brand treatment: `.special-font` uses `"Copse", serif`
- Page titles (`h1`): medium-heavy (`font-weight: 580`)
- Section titles (`h2`, `h3`): clear, compact, readable; preserve current heading scale
- Card titles: `~1rem`, wrap naturally, avoid truncation-only layouts
- Body text: compact literary tone with comfortable spacing
- Metadata text (`.meta`): small (`~0.82rem–0.9rem`) and lower contrast than primary copy
- Monospace usage: reserve for technical/diagnostic text only; not for core reading UI

## Layout Standards

- Base card radius: `12px` (`.book-card`)
- Secondary radius usage: `6px–10px` for covers/menus/inputs
- Spacing rhythm:
  - Tight: `0.2rem–0.4rem`
  - Default: `0.6rem–0.8rem`
  - Section gaps: `~0.75rem+`
- BookCard standard:
  - two-column desktop layout (`76px` cover + fluid content)
  - flexible content height; card grows with metadata/messages
  - no clipping of meaningful status text
- Borders:
  - avoid heavy card borders in primary flows
  - prefer subtle divider/border colors and elevation only where needed
- Responsive behavior:
  - stack to single-column lists/cards on mobile
  - preserve readable tap targets and non-overlapping menus
  - avoid horizontal overflow in all card subcomponents

## Button Standards

- Primary actions: solid green (`--color-primary`) with white text
- Secondary actions: lighter/outline styles and neutral backgrounds
- Destructive actions: red text/fill variants, explicit confirmation when destructive
- Shelf actions:
  - floating circular shelf trigger
  - menu options for default shelves + custom shelves + remove action
- Reading actions:
  - clear Save/Finish controls
  - inline progress update controls in currently-reading contexts

## Activity Feed Standards

Expected activity behavior:

- Shelf additions:
  - show event prefix + shelf context
  - include valid updated date when present
- Shelf removals:
  - remove from active shelf views immediately
  - preserve historical activity events
- Progress updates:
  - update progress display and prediction/momentum labels immediately
  - avoid stale risk text after save
- Ratings:
  - display in recent activity and detail surfaces
- Reviews/comments:
  - show user reflections/comments where activity is rendered
- Finished books:
  - support rating-only, comment-only, and rating+comment together without duplicate cards/events

## Accessibility Standards

- Focus:
  - visible focus ring (`:focus-visible`) with strong contrast (`3px` outline)
- Keyboard navigation:
  - all shelf, menu, rating, and activity controls must be keyboard reachable
- Touch targets:
  - minimum interactive target at least `24x24` currently; target `44x44` for primary mobile actions
- Contrast:
  - maintain readable contrast between background, text, and controls
  - avoid low-contrast metadata in critical interaction states

## Voice And Tone

Product copy should be:
- warm but concise
- literary and human
- clear over clever
- community-minded, not performative

Guidelines:
- Prefer “Currently Reading”, “Want to Read”, “Read” naming consistently.
- Use plain action feedback (“Saved to Read.”, “Removed from shelves.”).
- Avoid gamified language and growth-hack phrasing.

## Prompting Rule For Future Work

All future implementation prompts touching UI, UX, copy, or front-end behavior should include:

- “Use `/docs/style-guide.md` as the source of truth.”

If current implementation and prompt conflict, default to this style guide unless the prompt explicitly requests a deliberate style-guide update.
