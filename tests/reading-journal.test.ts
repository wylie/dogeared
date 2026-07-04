import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	canAccessJournalEntry,
	journalCharacterCount,
	journalHasContent,
	normalizeJournalInput,
	normalizeJournalVisibility,
	parseJournalTags
} from "../src/lib/readingJournal.ts";

test("journal helpers normalize visibility and private content", () => {
	assert.equal(normalizeJournalVisibility("public"), "public");
	assert.equal(normalizeJournalVisibility("friends"), "friends");
	assert.equal(normalizeJournalVisibility("unknown"), "private");

	const input = normalizeJournalInput({
		bookId: "42",
		startedThoughts: "  Started **strong**  ",
		favoriteQuote: " quote ",
		wouldReread: "true",
		personalTags: "Quiet, favorite, quiet"
	});

	assert.equal(input.bookId, 42);
	assert.equal(input.startedThoughts, "Started **strong**");
	assert.equal(input.favoriteQuote, "quote");
	assert.equal(input.wouldReread, true);
	assert.deepEqual(input.personalTags, ["Quiet", "favorite"]);
	assert.equal(input.visibility, "private");
	assert.equal(journalHasContent(input), true);
	assert.equal(journalCharacterCount(input), "Started **strong**quoteQuiet, favorite".length);
});

test("journal tag parsing prevents duplicate personal tags", () => {
	assert.deepEqual(parseJournalTags(["Book Club", "book club", "  Quotes  ", ""]), ["Book Club", "Quotes"]);
});

test("journal privacy only permits the owning reader for now", () => {
	const entry = { userId: "user-a", visibility: "public" as const };
	assert.equal(canAccessJournalEntry(entry, "user-a"), true);
	assert.equal(canAccessJournalEntry(entry, "user-b"), false);
	assert.equal(canAccessJournalEntry(entry, ""), false);
});

test("journal database schema supports future visibility states", () => {
	const schema = readFileSync("db/neon-schema.sql", "utf8");
	const migration = readFileSync("db/migrations/2026-07-04-reading-journal.sql", "utf8");

	assert.match(schema, /create table if not exists reading_journal_entry/);
	assert.match(schema, /started_thoughts/);
	assert.match(schema, /mid_book_notes/);
	assert.match(schema, /finished_thoughts/);
	assert.match(schema, /favorite_quote/);
	assert.match(schema, /would_reread/);
	assert.match(schema, /recommended_to/);
	assert.match(schema, /personal_tags text\[\]/);
	assert.match(schema, /visibility in \('private', 'friends', 'public', 'shared'\)/);
	assert.match(migration, /idx_reading_journal_user_updated/);
});

test("journal API enforces authentication, ownership, CRUD, and search", () => {
	const api = readFileSync("src/pages/api/journal/entries.ts", "utf8");
	const service = readFileSync("src/lib/readingJournal.ts", "utf8");

	assert.match(api, /resolveUserBySession/);
	assert.match(api, /export const GET/);
	assert.match(api, /export const POST/);
	assert.match(api, /export const DELETE/);
	assert.match(api, /searchJournalEntries/);
	assert.match(api, /403/);
	assert.match(service, /from user_book/);
	assert.match(service, /Add this book to your shelf before journaling/);
	assert.match(service, /j\.started_thoughts ilike/);
	assert.match(service, /unnest\(j\.personal_tags\)/);
});

test("journal UI is wired into book, profile, navigation, and autosave", () => {
	const bookPage = readFileSync("src/pages/book.astro", "utf8");
	const profilePage = readFileSync("src/pages/profile/[username].astro", "utf8");
	const journalPage = readFileSync("src/pages/journal.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");

	assert.match(bookPage, /Reading Journal/);
	assert.match(bookPage, /data-journal-panel/);
	assert.match(bookPage, /dogeared:journal-draft/);
	assert.match(bookPage, /Recovered an unsaved local draft/);
	assert.match(bookPage, /\/api\/journal\/entries/);
	assert.match(profilePage, /Recent Journal Entries/);
	assert.match(profilePage, /isOwnerViewer && \(/);
	assert.match(journalPage, /Search your own notes/);
	assert.match(journalPage, /robots="noindex,nofollow"/);
	assert.match(nav, /Reading Journal/);
	assert.match(nav, /isJournalPage/);
});
