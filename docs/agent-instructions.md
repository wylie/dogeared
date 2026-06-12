# Agent Instructions

## Required Reading

Before performing any work, read:

1. docs/ai-context.md
2. docs/style-guide.md

These documents are the source of truth for product decisions, UX patterns, design conventions, and development rules.

---

## Working Principles

- Follow the product rules defined in ai-context.md.
- Follow the design system defined in style-guide.md.
- Preserve existing architecture whenever possible.
- Prefer consistency over introducing new patterns.
- Avoid unrelated refactors.
- Avoid large-scale rewrites unless explicitly requested.

---

## Development Approach

When implementing features or fixing bugs:

1. Identify the smallest reasonable change.
2. Reuse existing components and utilities whenever possible.
3. Maintain existing coding patterns.
4. Keep implementations simple and maintainable.
5. Minimize repository exploration.

Do not spend time searching unrelated areas of the codebase.

---

## Bug Fixes

For bug fixes:

- Identify root cause first.
- Fix the underlying issue rather than symptoms.
- Add or update tests when appropriate.
- Verify the fix does not introduce regressions.

---

## User Experience Priorities

Prioritize:

1. Reliability
2. Clarity
3. Reading experience
4. Performance
5. New features

Reliability is more important than feature expansion.

---

## Testing

Before completing work:

- Run relevant tests.
- Run linting if applicable.
- Verify TypeScript passes if applicable.
- Resolve any errors introduced by the change.

---

## Commits

Create logical commits describing completed work.

Do not push.

Leave all commits local for user review.

---

## When Unsure

If requirements are ambiguous:

- Stop.
- Explain the uncertainty.
- Propose options.
- Wait for clarification before proceeding.

## Prompt Shortcuts

"Follow standard workflow"

Means:

- Read ai-context.md
- Read style-guide.md
- Follow all instructions in this file
- Run appropriate tests
- Create logical commits
- Do not push

"Bug batch"

Means:

- Complete all checked work requested from bug-batch.md
- Work through items in order
- Create logical commits
- Do not push

"Investigate only"

Means:

- Determine root cause
- Identify affected files
- Propose fix
- Do not modify code