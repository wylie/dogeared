import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProgressInputMode, normalizeProgressUpdateInput } from "../src/lib/readingProgress.ts";

test("page progress updates keep canonical current page", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "154",
		totalPages: 597,
		progressType: "page"
	});
	assert.equal(result.valid, true);
	assert.equal(result.currentPage, 154);
	assert.equal(result.mode, "page");
	assert.equal(Math.round(result.percent), Math.round((154 / 597) * 100));
});

test("percentage progress updates normalize into canonical current page", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "31",
		totalPages: 597,
		progressType: "percent"
	});
	assert.equal(result.valid, true);
	assert.equal(result.currentPage, 185);
	assert.equal(result.mode, "percent");
	assert.equal(result.normalizedText, "31%");
});

test("percentage progress accepts valid low and boundary values", () => {
	for (const value of ["0", "1", "2", "14", "25", "50", "99", "100"]) {
		const result = normalizeProgressUpdateInput({
			rawValue: value,
			totalPages: 400,
			progressType: "Percentage"
		});
		assert.equal(result.valid, true, `${value}% should be valid`);
		assert.equal(result.mode, "percent");
		assert.equal(result.percent, Number(value));
		assert.equal(result.normalizedText, `${Number(value)}%`);
	}
});

test("percentage progress rejects out-of-range and nonnumeric values", () => {
	for (const value of ["-1", "101", "not a number", "Infinity"]) {
		const result = normalizeProgressUpdateInput({
			rawValue: value,
			totalPages: 400,
			progressType: "percent"
		});
		assert.equal(result.valid, false, `${value} should be invalid`);
		assert.equal(result.mode, "percent");
	}
});

test("percentage updates require total pages to avoid saving zero progress", () => {
	const result = normalizeProgressUpdateInput({
		rawValue: "31",
		totalPages: 0,
		progressType: "percent"
	});
	assert.equal(result.valid, false);
	assert.equal(result.currentPage, 0);
});

test("chapter, location, and audio inputs still normalize through the same canonical page field", () => {
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "Chapter 4",
		totalPages: 400,
		progressType: "chapter"
	}).currentPage, 4);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "Location 1234",
		totalPages: 400,
		progressType: "location"
	}).currentPage, 400);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "1h 20m",
		totalPages: 400,
		progressType: "audio"
	}).currentPage, 120);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "Chapter -4",
		totalPages: 400,
		progressType: "chapter"
	}).valid, false);
});

test("page progress rejects negative and nonnumeric values", () => {
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "154",
		totalPages: 400,
		progressType: "Page Number"
	}).valid, true);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "-1",
		totalPages: 400,
		progressType: "page"
	}).valid, false);
	assert.equal(normalizeProgressUpdateInput({
		rawValue: "page ten",
		totalPages: 400,
		progressType: "page"
	}).valid, false);
});

test("profile progress save never exposes internal invalid labels", () => {
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(profile, /class="progress-inline-feedback"/);
	assert.match(profile, /aria-describedby=\{`progress-inline-feedback-\$\{item\.bookId\}`\}/);
	assert.match(profile, /surfaceProgressSaveError\(input, "Enter a valid progress value\."\)/);
	assert.match(profile, /input\.setAttribute\("aria-invalid", "true"\)/);
	assert.match(profile, /input\.focus\(\)/);
	assert.doesNotMatch(profile, /progressSave\.textContent = "Invalid"/);
	assert.doesNotMatch(profile, /progressSave\.textContent = "Retry"/);
});

test("profile progress updater uses shared canonical progress normalization", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(source.includes('import { normalizeProgressUpdateInput } from "../../lib/readingProgress.ts";'), true);
	assert.equal(source.includes("const parsed = normalizeProgressUpdateInput({"), true);
	assert.equal(source.includes("function resolveProgressTotalPages(button, card)"), true);
	assert.match(source, /const totalPages = resolveProgressTotalPages\(progressSave, card\)/);
	assert.equal(source.includes("function parseProgressInput("), false);
});

test("profile percent progress validates against the effective stored or catalog total pages", () => {
	const summary = readFileSync("src/lib/readingSummary.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");

	assert.match(summary, /coalesce\(nullif\(ub\.total_pages, 0\), nullif\(b\.page_count, 0\), 0\)::int as total_pages/);
	assert.match(profile, /positiveDatasetNumber\(button\?\.dataset\?\.totalPages\)/);
	assert.match(profile, /card instanceof HTMLElement \? positiveDatasetNumber\(card\.dataset\.momentumTotalPages\) : 0/);
});

test("progress input mode normalization uses the supported persisted enum", () => {
	for (const mode of ["page", "percent", "chapter", "location", "audio"] as const) {
		assert.equal(normalizeProgressInputMode(mode), mode);
	}
	assert.equal(normalizeProgressInputMode("Percentage"), "percent");
	assert.equal(normalizeProgressInputMode("percentage"), "percent");
	assert.equal(normalizeProgressInputMode("Page Number"), "page");
	assert.equal(normalizeProgressInputMode("Kindle Location"), "location");
	assert.equal(normalizeProgressInputMode("Audiobook Time"), "audio");
	assert.equal(normalizeProgressInputMode("pages"), "page");
	assert.equal(normalizeProgressInputMode(""), "page");
});

test("progress type is persisted through the shared shelf entry lifecycle", () => {
	const api = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const summary = readFileSync("src/lib/readingSummary.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const shelfClient = readFileSync("src/lib/shelfClient.ts", "utf8");
	const workNormalization = readFileSync("src/lib/workNormalization.ts", "utf8");

	assert.match(api, /alter table user_book add column if not exists preferred_progress_type text not null default 'page'/);
	assert.match(api, /preferredProgressType\?: unknown/);
	assert.match(api, /preferred_progress_type,\s+reading_format,\s+finished_date/);
	assert.match(api, /when \$\{preferredProgressType\}::text <> '' then \$\{preferredProgressType\}::text\s+else user_book\.preferred_progress_type/);
	assert.match(api, /preferredProgressType: (normalizeProgressInputMode\((persisted\.preferred_progress_type|preferredProgressType \|\| "page")\)|persistedPreferredProgressType)/);
	assert.match(api, /preferredProgressType: normalizeProgressInputMode\(row\.preferred_progress_type\)/);

	assert.match(summary, /ub\.preferred_progress_type/);
	assert.match(summary, /preferredProgressType: normalizeProgressInputMode\(row\.preferred_progress_type\)/);
	assert.match(profile, /data-preferred-progress-type/);
	assert.match(profile, /preferredProgressType: progressType/);
	assert.match(profile, /selected=\{\(item\.preferredProgressType \|\| "page"\) === "page"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "percent"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "chapter"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "location"\}/);
	assert.match(profile, /selected=\{item\.preferredProgressType === "audio"\}/);

	assert.match(shelfClient, /preferredProgressType\?: string/);
	assert.match(shelfClient, /preferredProgressType: String\(options\.preferredProgressType/);
	assert.match(workNormalization, /preferred_progress_type/);
});

test("reading progress saves use the dedicated narrow API path", () => {
	const api = readFileSync("src/pages/api/reading/progress.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const shelfClient = readFileSync("src/lib/shelfClient.ts", "utf8");

	assert.match(api, /where ub\.user_id = \$\{session\.userId\}::uuid\s+and ub\.book_id = \$\{bookId\}\s+and ub\.status = 'reading'/);
	assert.match(api, /update user_book\s+set\s+current_page = \$\{nextCurrentPage\}/);
	assert.match(api, /insert into user_reading_progress_event/);
	assert.match(api, /if \(progressEventRecorded\) \{\s+await createReadingMilestoneNotifications/);
	assert.match(api, /const summary = await loadReaderReadingSummary\(sql, session\.userId\)/);
	assert.match(api, /progress:\s+\{\s+bookId/);
	assert.match(api, /momentumScore: summary\.momentumScore/);
	assert.match(api, /readingStreakDays: summary\.readingStreakDays/);

	assert.match(profile, /fetch\("\/api\/reading\/progress"/);
	assert.match(profile, /const appliedSummary = applyAuthoritativeReadingSummary\(result\?\.data\?\.summary\)/);
	assert.match(profile, /notifyReadingDataChanged\(\)/);
	assert.match(shelfClient, /export function notifyReadingDataChanged\(\)/);
});

test("progress save avoids the broad post-shelf refresh after direct save success", () => {
	const source = readFileSync("src/pages/profile/[username].astro", "utf8");
	const directSaveIndex = source.indexOf("const result = await saveReadingProgressUpdate({");
	assert.notEqual(directSaveIndex, -1);
	const directSaveBlock = source.slice(directSaveIndex, source.indexOf("} catch (error) {", directSaveIndex));

	assert.equal(directSaveBlock.includes("saveShelfEntryWithRetry"), false);
	assert.equal(directSaveBlock.includes("refreshProfileReadingUiAfterMutation"), false);
	assert.equal(directSaveBlock.includes("applyAuthoritativeReadingSummary"), true);
});

test("reading progress schema setup is memoized and indexed for user/book progress lookups", () => {
	const source = readFileSync("src/lib/readingSummary.ts", "utf8");

	assert.match(source, /let readingProgressSchemaReady: Promise<void> \| null = null/);
	assert.match(source, /if \(!readingProgressSchemaReady\) \{/);
	assert.match(source, /idx_progress_event_user_book on user_reading_progress_event\(user_id, book_id, recorded_at desc\)/);
	assert.match(source, /readingProgressSchemaReady = null/);
});

test("reading milestone notifications defer notification schema work until a milestone is awarded", () => {
	const source = readFileSync("src/lib/notifications.ts", "utf8");
	const milestoneStart = source.indexOf("export async function createReadingMilestoneNotifications");
	assert.notEqual(milestoneStart, -1);
	const milestoneBody = source.slice(milestoneStart);

	assert.equal(milestoneBody.includes("await ensureNotificationSchema(sql);"), false);
	assert.match(milestoneBody, /const resolveProfilePath = \(\) => \{/);
	assert.match(milestoneBody, /const profilePath = await resolveProfilePath\(\)/);
});
