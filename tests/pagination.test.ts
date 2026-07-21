import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pagination component owns rounded controls, disabled states, and labels", () => {
	const source = readFileSync("src/components/Pagination.astro", "utf8");

	assert.match(source, /<nav class="pagination" aria-label=\{label\}>/);
	assert.match(source, /Page \{safeCurrentPage\} of \{safeTotalPages\}/);
	assert.match(source, /pagination-control is-disabled/);
	assert.match(source, /aria-disabled="true"/);
	assert.match(source, /href=\{previousHref\}/);
	assert.match(source, /href=\{nextHref\}/);
	assert.match(source, /aria-label=\{`\$\{previousLabel\}, page \$\{safeCurrentPage - 1\}`\}/);
	assert.match(source, /aria-label=\{`\$\{nextLabel\}, page \$\{safeCurrentPage \+ 1\}`\}/);
	assert.match(source, /border-radius: 999px/);
	assert.match(source, /background: var\(--color-nav-surface\)/);
	assert.match(source, /:focus-visible/);
	assert.match(source, /flex-wrap: nowrap/);
});

test("paginated reader and catalog pages use shared Pagination", () => {
	const authors = readFileSync("src/pages/authors.astro", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const followers = readFileSync("src/pages/profile/[username]/followers.astro", "utf8");
	const journal = readFileSync("src/pages/journal.astro", "utf8");

	for (const source of [authors, profile, followers, journal]) {
		assert.match(source, /import Pagination/);
		assert.match(source, /<Pagination/);
	}

	assert.match(authors, /label="Authors pagination"/);
	assert.match(authors, /previousHref=\{currentPage > 1 \? pageHref\(currentPage - 1\) : ""\}/);
	assert.match(authors, /nextHref=\{currentPage < totalPages \? pageHref\(currentPage \+ 1\) : ""\}/);
	assert.match(authors, /p\.set\("page", String\(nextPage\)\)/);
	assert.doesNotMatch(authors, /class="pager"/);

	assert.match(profile, /label="Recent activity pagination"/);
	assert.match(profile, /label="Currently Reading pagination"/);
	assert.match(profile, /label="Want to Read pagination"/);
	assert.match(profile, /label="Read shelf pagination"/);
	assert.doesNotMatch(profile, /section-pagination/);

	assert.match(followers, /label="Followers pagination"/);
	assert.doesNotMatch(followers, /class="pager"/);

	assert.match(journal, /label="Journal pagination"/);
	assert.match(journal, /countJournalEntries/);
	assert.match(journal, /totalPages = Math\.max\(1, Math\.ceil\(totalJournalEntries \/ pageSize\)\)/);
	assert.doesNotMatch(journal, /pageSize \+ 1/);
	assert.doesNotMatch(journal, /journal-pagination/);
});
