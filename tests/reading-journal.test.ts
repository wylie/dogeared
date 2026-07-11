import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
	canAccessJournalEntry,
	formatReadingPosition,
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
		entryTitle: "  Chapter note ",
		body: "  Started **strong**  ",
		readingPositionType: "chapter",
		readingPositionValue: "4",
		mood: "curious",
		wouldReread: "true",
		personalTags: "Quiet, favorite, quiet"
	});

	assert.equal(input.bookId, 42);
	assert.equal(input.entryTitle, "Chapter note");
	assert.equal(input.body, "Started **strong**");
	assert.equal(input.readingPositionType, "chapter");
	assert.equal(input.readingPositionValue, "4");
	assert.equal(input.pageNumber, null);
	assert.equal(input.chapterLocation, "4");
	assert.equal(input.mood, "curious");
	assert.equal(input.wouldReread, true);
	assert.deepEqual(input.personalTags, ["Quiet", "favorite"]);
	assert.equal(input.visibility, "private");
	assert.equal(journalHasContent(input), true);
	assert.equal(journalCharacterCount(input), "Started **strong**Quiet, favorite".length);
});

test("journal position model stores one reading position at a time", () => {
	const page = normalizeJournalInput({
		bookId: "42",
		body: "Page note",
		readingPositionType: "page",
		readingPositionValue: "20",
		progressSnapshot: "58",
		chapterLocation: "Chapter 4"
	});
	assert.equal(page.readingPositionType, "page");
	assert.equal(page.readingPositionValue, "20");
	assert.equal(page.pageNumber, 20);
	assert.equal(page.progressSnapshot, null);
	assert.equal(page.chapterLocation, "");
	assert.equal(formatReadingPosition(page.readingPositionType, page.readingPositionValue), "Page 20");

	const percent = normalizeJournalInput({
		bookId: "42",
		body: "Halfway",
		readingPositionType: "percent",
		readingPositionValue: "58"
	});
	assert.equal(percent.progressSnapshot, 58);
	assert.equal(formatReadingPosition(percent.readingPositionType, percent.readingPositionValue), "58%");
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
	assert.match(schema, /create table if not exists reading_journal_note/);
	assert.match(schema, /entry_title/);
	assert.match(schema, /body text not null default ''/);
	assert.match(schema, /entry_at timestamptz/);
	assert.match(schema, /progress_snapshot/);
	assert.match(schema, /page_number/);
	assert.match(schema, /chapter_location/);
	assert.match(schema, /reading_position_type/);
	assert.match(schema, /reading_position_value/);
	assert.match(schema, /mood/);
	assert.match(schema, /started_thoughts/);
	assert.match(schema, /mid_book_notes/);
	assert.match(schema, /finished_thoughts/);
	assert.match(schema, /favorite_quote/);
	assert.match(schema, /would_reread/);
	assert.match(schema, /recommended_to/);
	assert.match(schema, /personal_tags text\[\]/);
	assert.match(schema, /visibility in \('private', 'friends', 'public', 'shared'\)/);
	assert.match(migration, /idx_reading_journal_user_updated/);
	assert.match(migration, /idx_reading_journal_note_user_entry/);
});

test("journal API enforces authentication, ownership, CRUD, and search", () => {
	const api = readFileSync("src/pages/api/journal/entries.ts", "utf8");
	const service = readFileSync("src/lib/readingJournal.ts", "utf8");

	assert.match(api, /resolveUserBySession/);
	assert.match(api, /export const GET/);
	assert.match(api, /export const POST/);
	assert.match(api, /export const DELETE/);
	assert.match(api, /searchJournalEntries/);
	assert.match(api, /saveJournalNote/);
	assert.match(api, /deleteJournalNote/);
	assert.match(api, /date/);
	assert.match(api, /offset/);
	assert.match(api, /403/);
	assert.match(service, /from user_book/);
	assert.match(service, /Add this book to your shelf before journaling/);
	assert.match(service, /!normalized\.body/);
	assert.match(service, /j\.body ilike/);
	assert.match(service, /j\.entry_at::date/);
	assert.match(service, /offset \$/);
	assert.match(service, /unnest\(j\.personal_tags\)/);
});

test("journal UI is wired into book, private journal page, navigation, and autosave", () => {
	const bookPage = readFileSync("src/pages/book.astro", "utf8");
	const profilePage = readFileSync("src/pages/profile/[username].astro", "utf8");
	const journalPage = readFileSync("src/pages/journal.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");

	assert.match(bookPage, /Reading Journal/);
	assert.match(bookPage, /data-journal-panel/);
	assert.match(bookPage, /dogeared:journal-draft/);
	assert.match(bookPage, /Recovered an unsaved local draft/);
	assert.match(bookPage, /Write Journal Entry/);
	assert.match(bookPage, /View all journal entries/);
	assert.match(bookPage, /Currently Reading to create new journal entries/);
	assert.match(bookPage, /\/api\/journal\/entries/);
	assert.doesNotMatch(profilePage, /Recent Journal Entries/);
	assert.doesNotMatch(profilePage, /loadRecentJournalEntries/);
	assert.match(profilePage, /Capture today's reading\?/);
	assert.match(profilePage, /Remember a thought before you move on/);
	assert.match(profilePage, /Write Journal Entry/);
	assert.match(profilePage, /progress-journal-prompt/);
	assert.match(profilePage, /progress-journal-button-primary/);
	assert.match(profilePage, /progress-journal-button-secondary/);
	assert.match(profilePage, /sessionStorage/);
	assert.match(profilePage, /border: var\(--border-subtle\)/);
	assert.match(profilePage, /background: rgba\(255, 255, 255, 0\.62\)/);
	assert.match(journalPage, /Search your own notes/);
	assert.match(journalPage, /New Entry/);
	assert.match(journalPage, /data-journal-entry-form/);
	assert.match(journalPage, /Search journal/);
	assert.match(journalPage, /<span>Book<\/span>/);
	assert.match(journalPage, /journal-owned-books/);
	assert.match(journalPage, /data-book-picker/);
	assert.match(journalPage, /<span>Date<\/span>/);
	assert.match(journalPage, /Reading position/);
	assert.match(journalPage, /readingPositionType/);
	assert.match(journalPage, /readingPositionValue/);
	assert.match(journalPage, /Journal Timeline/);
	assert.match(journalPage, /Create your first journal entry/);
	assert.match(journalPage, /data-action="view-journal-entry"/);
	assert.match(journalPage, /data-action="edit-journal-entry"/);
	assert.match(journalPage, /data-action="delete-journal-entry"/);
	assert.match(journalPage, /journal-pagination/);
	assert.match(journalPage, /robots="noindex,nofollow"/);
	assert.match(nav, /Reading Journal/);
	assert.match(nav, /routeMatches/);
	assert.match(nav, /showSectionLinks/);
});
