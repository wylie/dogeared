import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("reading format is stored on user_book with legacy Unknown support", () => {
	const schema = readFileSync("db/neon-schema.sql", "utf8");
	const migration = readFileSync("db/migrations/2026-08-09-reading-formats-v0-4-0.sql", "utf8");
	const shelfApi = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const progressApi = readFileSync("src/pages/api/reading/progress.ts", "utf8");
	const bookTable = schema.slice(
		schema.indexOf("create table if not exists book ("),
		schema.indexOf("create table if not exists book_work (")
	);

	assert.match(schema, /reading_format text not null default 'unknown' check \(reading_format in \('unknown', 'physical', 'ebook', 'audio'\)\)/);
	assert.match(migration, /alter table user_book\s+add column if not exists reading_format text not null default 'unknown'/);
	assert.match(migration, /user_book_reading_format_check/);
	assert.doesNotMatch(bookTable, /reading_format/);
	assert.match(shelfApi, /normalizeReadingFormat\(entry\.readingFormat\)/);
	assert.match(shelfApi, /when \$\{readingFormat\}::text in \('physical', 'ebook', 'audio'\) then \$\{readingFormat\}::text\s+else user_book\.reading_format/);
	assert.match(progressApi, /reading_format = case/);
	assert.match(progressApi, /readingFormat: normalizeReadingFormat\(updated\.reading_format \|\| existing\.reading_format\)/);
});

test("reader-initiated Currently Reading saves prompt for a one-click default Physical format", () => {
	const shelfClient = readFileSync("src/lib/shelfClient.ts", "utf8");
	const searchPage = readFileSync("src/pages/search.astro", "utf8");
	const bookPage = readFileSync("src/pages/book.astro", "utf8");
	const profilePage = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(shelfClient, /How are you reading this book\?/);
	assert.match(shelfClient, /Default is \$\{readingFormatLabel\(normalizedDefault\)\}/);
	assert.match(shelfClient, /data-reading-format="\$\{normalizedDefault === "unknown" \? "physical" : normalizedDefault\}"/);
	assert.match(shelfClient, /entry\.readingFormat = selected/);
	assert.match(searchPage, /prepareReadingFormatForShelfStatus\(draft, selectedStatus\)/);
	assert.match(bookPage, /prepareReadingFormatForShelfStatus\(entry, status\)/);
	assert.match(profilePage, /prepareReadingFormatForShelfStatus\(entry, status\)/);
});

test("BookCard accepts reading format data without rendering title-area format icons", () => {
	const bookCard = readFileSync("src/components/BookCard.astro", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(bookCard, /readingFormat\?: string/);
	assert.doesNotMatch(bookCard, /readingFormatIcon/);
	assert.doesNotMatch(bookCard, /reading-format-badge/);
	assert.doesNotMatch(bookCard, /readingFormatBadgeIcon/);
	assert.match(bookCard, /<div class="book-card-title-row">\s*<h3>/);
	assert.doesNotMatch(profile, /readingFormatBadgeData/);
	assert.doesNotMatch(profile, /querySelector\("\\.reading-format-badge"\)/);
});

test("Profile progress controls edit reading format without changing progress behavior", () => {
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(profile, /<select class="progress-inline-format" aria-label="Reading format">/);
	assert.match(profile, /const readingFormat = readingFormatInput instanceof HTMLSelectElement[\s\S]+normalizeReadingFormat\(readingFormatInput\.value\)/);
	assert.match(profile, /preferredProgressType: progressType,\s+readingFormat/);
	assert.match(profile, /updateReadingFormatUi\(card, nextReadingFormat\)/);
	assert.match(profile, /data-reading-format=\{item\.readingFormat \|\| "unknown"\}/);
});

test("My Reading Life displays and filters reading format history", () => {
	const readingLife = readFileSync("src/pages/reading-life.astro", "utf8");
	const helper = readFileSync("src/lib/readingLife.ts", "utf8");

	assert.match(helper, /export function buildReadingFormatMetrics/);
	assert.match(helper, /format\?: string/);
	assert.match(readingLife, /id="formats"/);
	assert.match(readingLife, /No reading format information yet\./);
	assert.match(readingLife, /name="format" aria-label="Reading format filter"/);
	assert.match(readingLife, /class="timeline-title-row"/);
	assert.match(readingLife, /readingFormatIcon\(book\.readingFormat\)/);
});
