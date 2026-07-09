import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin dashboard and users pages require admin session", () => {
	for (const path of ["src/pages/admin.astro", "src/pages/admin/analytics.astro", "src/pages/admin/users.astro", "src/pages/admin/users/[username].astro", "src/pages/admin/founding-readers.astro", "src/pages/admin/releases.astro"]) {
		const source = readFileSync(path, "utf8");
		assert.equal(source.includes("resolveAdminSession"), true);
		assert.equal(source.includes("if (!admin.isAdmin) return Astro.redirect(\"/\")"), true);
		assert.equal(source.includes('robots="noindex,nofollow"'), true);
	}
});

test("admin navigation is rendered only for admin sessions", () => {
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");
	assert.equal(layout.includes("resolveAdminSession"), true);
	assert.equal(layout.includes("isAdmin={isAdmin}"), true);
	assert.equal(nav.includes("isAdmin = false"), true);
	assert.equal(nav.includes("{isAdmin && ("), true);
	assert.equal(nav.includes("<h3 class=\"nav-group-title\">Admin</h3>"), true);
	assert.equal(nav.includes("Dashboard"), true);
	assert.equal(nav.includes("/admin/analytics"), true);
	assert.equal(nav.includes("/admin/feedback"), true);
	assert.equal(nav.includes("/admin/data-health"), true);
	assert.equal(nav.includes("/admin/founding-readers"), true);
	assert.equal(nav.includes("Founding Readers"), true);
	assert.equal(nav.includes("/admin/releases"), true);
	assert.equal(nav.includes("Releases"), true);
	assert.equal(nav.includes("/admin/operations"), true);
	assert.equal(nav.includes("/admin/users"), true);
});

test("admin overview displays real site statistics and quick links", () => {
	const page = readFileSync("src/pages/admin.astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	for (const label of [
		"Total books",
		"Total authors",
		"Total users",
		"Total shelf entries",
		"Total reviews",
		"Total comments",
		"Currently Reading",
		"Completed books"
	]) {
		assert.equal(page.includes(label), true);
	}
	assert.equal(page.includes('href: "/admin/data-health"'), true);
	assert.equal(page.includes('href: "/admin/analytics#community"'), true);
	assert.equal(page.includes('href: "/admin/feedback"'), true);
	assert.equal(page.includes('href: "/admin/founding-readers"'), true);
	assert.equal(page.includes("safeAdminLoad"), true);
	assert.equal(page.includes("formatNumber(link.value)"), true);
	assert.equal(page.includes("link.value.toLocaleString"), false);
	assert.equal(data.includes("loadAdminOverviewStats"), true);
	assert.equal(data.includes("loadAdminOperationsSummary"), true);
	assert.equal(data.includes("from user_activity_comment"), true);
});

test("admin operations center includes Founding Reader control surfaces", () => {
	const source = readFileSync("src/pages/admin/operations.astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const leftHand = readFileSync("src/components/LeftHand.astro", "utf8");
	assert.equal(source.includes("Recommendation Health"), true);
	assert.equal(source.includes("Import Health"), true);
	assert.equal(source.includes("System Health"), true);
	assert.equal(source.includes("Feature Flags"), true);
	assert.equal(source.includes("Announcement Banner"), true);
	assert.equal(source.includes("Release Notes"), false);
	assert.equal(source.includes("updateAdminFeedbackIssue"), true);
	assert.equal(data.includes("admin_feedback_issue"), true);
	assert.equal(data.includes("admin_feature_flag"), true);
	assert.equal(data.includes("admin_announcement"), true);
	assert.equal(data.includes("admin_release_note"), true);
	assert.equal(data.includes("coalesce(slug"), false);
	assert.equal(data.includes("alter table app_user add column if not exists updated_at"), true);
	assert.equal(layout.includes("loadActiveAnnouncement"), true);
	assert.equal(layout.includes("data-announcement-id"), true);
	assert.equal(layout.includes("allowAuthPrompt={allowAuthPrompt}"), true);
	assert.equal(layout.includes("allowGuidance={allowAuthPrompt}"), true);
	assert.equal(layout.includes('"/mission"'), false);
	assert.equal(leftHand.includes("allowAuthPrompt"), true);
	assert.equal(leftHand.includes("hidden={isAuthenticated || !allowAuthPrompt}"), true);
	assert.equal(leftHand.includes("{allowAuthPrompt && ("), true);
	assert.equal(readFileSync("src/components/ReaderGuidance.astro", "utf8").includes("allowGuidance"), true);
});

test("admin pages use defensive loaders and formatting", () => {
	const formatting = readFileSync("src/lib/adminFormatting.ts", "utf8");
	const dashboard = readFileSync("src/pages/admin.astro", "utf8");
	const analytics = readFileSync("src/pages/admin/analytics.astro", "utf8");
	const operations = readFileSync("src/pages/admin/operations.astro", "utf8");
	const feedback = readFileSync("src/pages/admin/feedback.astro", "utf8");
	const dataHealth = readFileSync("src/pages/admin/data-health.astro", "utf8");
	const users = readFileSync("src/pages/admin/users.astro", "utf8");
	const foundingReaders = readFileSync("src/pages/admin/founding-readers.astro", "utf8");
	const releases = readFileSync("src/pages/admin/releases.astro", "utf8");
	const detail = readFileSync("src/pages/admin/users/[username].astro", "utf8");
	for (const helper of ["formatNumber", "formatDate", "safePercent", "percentOf", "safeAdminLoad"]) {
		assert.equal(formatting.includes(`function ${helper}`), true);
	}
	for (const source of [dashboard, analytics, operations, feedback, dataHealth, users, foundingReaders, releases, detail]) {
		assert.equal(source.includes("safeAdminLoad"), true);
	}
	assert.equal(analytics.includes("emptyAdminProductAnalytics"), true);
	assert.equal(operations.includes("emptyAdminOperationsSummary"), true);
	assert.equal(feedback.includes("[admin.feedback.post.failed]"), true);
	assert.equal(dataHealth.includes("Publisher schema"), true);
	assert.equal(dataHealth.includes("warning-list"), true);
	assert.equal(users.includes("[admin.users.post.failed]"), true);
	assert.equal(detail.includes("[admin.user-detail.post.failed]"), true);
});

test("admin founding readers page exposes access controls and requested account operations", () => {
	const source = readFileSync("src/pages/admin/founding-readers.astro", "utf8");
	const redirect = readFileSync("src/pages/admin/beta-users.astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	const foundingReaders = readFileSync("src/lib/foundingReaders.ts", "utf8");
	const auth = readFileSync("src/pages/api/auth/request-magic-link.ts", "utf8");
	const migration = readFileSync("db/migrations/2026-07-09-founding-readers.sql", "utf8");
	assert.equal(redirect.includes('Astro.redirect("/admin/founding-readers", 301)'), true);
	assert.equal(source.includes("loadAdminBetaUsers"), true);
	assert.equal(source.includes("loadFoundingReaderAdminSummary"), true);
	assert.equal(source.includes("saveFoundingReaderConfig"), true);
	assert.equal(source.includes("updateFoundingReaderWaitlistStatus"), true);
	assert.equal(source.includes("Open"), true);
	assert.equal(source.includes("Waitlist"), true);
	assert.equal(source.includes("Invite Only"), true);
	assert.equal(source.includes("Automatically switch Open to Waitlist"), true);
	assert.equal(source.includes("Impersonate"), true);
	assert.equal(source.includes("Resend login"), true);
	assert.equal(source.includes("Deactivate"), true);
	assert.equal(source.includes("readingStreak"), true);
	assert.equal(data.includes("reading_streak"), true);
	assert.equal(foundingReaders.includes("founding_reader_config"), true);
	assert.equal(foundingReaders.includes("founding_reader_waitlist"), true);
	assert.equal(foundingReaders.includes("effectiveMode"), true);
	assert.equal(foundingReaders.includes("autoWaitlistAtCapacity"), true);
	assert.equal(auth.includes("resolveFoundingReaderAccess"), true);
	assert.equal(auth.includes("markFoundingReaderJoined"), true);
	assert.equal(auth.includes("waitlist: true"), true);
	assert.equal(migration.includes("founding_reader_config"), true);
	assert.equal(migration.includes("founding_reader_waitlist"), true);
});

test("admin releases page owns release workflow", () => {
	const page = readFileSync("src/pages/admin/releases.astro", "utf8");
	const releaseLib = readFileSync("src/lib/releases.ts", "utf8");
	const migration = readFileSync("db/migrations/2026-07-09-release-management-v1.sql", "utf8");
	const publicPage = readFileSync("src/pages/release-notes.astro", "utf8");
	const layout = readFileSync("src/layouts/Layout.astro", "utf8");
	const whatsNewModal = readFileSync("src/components/WhatsNewModal.astro", "utf8");
	const leftHand = readFileSync("src/components/LeftHand.astro", "utf8");
	assert.equal(page.includes("saveRelease"), true);
	assert.equal(page.includes("publishRelease"), true);
	assert.equal(page.includes("archiveRelease"), true);
	assert.equal(page.includes("Preview"), true);
	for (const field of ["version", "title", "summary", "release_date", "published", "highlights", "bug_fixes", "known_issues", "migration_notes"]) {
		assert.equal(releaseLib.includes(field), true);
		assert.equal(migration.includes(field), true);
	}
	assert.equal(publicPage.includes("loadPublishedReleases"), true);
	assert.equal(publicPage.includes("Highlights"), true);
	assert.equal(publicPage.includes("Bug fixes"), true);
	assert.equal(publicPage.includes("Known issues"), true);
	assert.equal(publicPage.includes('href="/roadmap"'), true);
	assert.equal(layout.includes("loadLatestPublishedRelease"), true);
	assert.equal(whatsNewModal.includes("data-whats-new-modal"), true);
	assert.equal(whatsNewModal.includes("dogeared:release-seen"), true);
	assert.equal(leftHand.includes("/release-notes"), true);
	assert.equal(leftHand.includes("DogEared Beta"), true);
});

test("admin users support search, detail counts, and safe deletion", () => {
	const list = readFileSync("src/pages/admin/users.astro", "utf8");
	const detail = readFileSync("src/pages/admin/users/[username].astro", "utf8");
	const data = readFileSync("src/lib/adminData.ts", "utf8");
	assert.equal(list.includes('name="q"'), true);
	assert.equal(list.includes("Books on shelves"), true);
	assert.equal(list.includes("Shelf entries"), false);
	assert.equal(list.includes(">Shelves<"), false);
	assert.equal(list.includes("data-delete-user-list-form"), true);
	assert.equal(list.includes('name="userId"'), true);
	assert.equal(list.includes("Current admin"), true);
	assert.equal(list.includes("Catalog books and authors are preserved"), true);
	assert.equal(data.includes("searchAdminUsers"), true);
	assert.equal(data.includes("lower(coalesce(u.email, '')) like"), true);
	assert.equal(data.includes("shelfEntryCount"), true);
	assert.equal(data.includes("as shelf_entry_count"), true);
	assert.equal(data.includes("shelfCount"), false);
	assert.equal(detail.includes('name="confirmUsername"'), true);
	assert.equal(detail.includes("Shelf entries"), true);
	assert.equal(detail.includes("Total shelves"), false);
	assert.equal(detail.includes("Catalog books and authors are preserved"), true);
	assert.equal(detail.includes("Admins cannot delete their own account"), true);
	assert.equal(detail.includes("window.confirm"), true);
	assert.equal(data.includes("targetId === actorId"), true);
	assert.equal(data.includes("sql.transaction"), true);
	assert.equal(data.includes("delete from auth_session"), true);
	assert.equal(data.includes("delete from user_book"), true);
	assert.equal(data.includes("delete from app_user"), true);
	assert.equal(data.includes("password"), false);
	assert.equal(data.includes("token_hash text not null unique"), true);
});

test("custom shelf dropdown options match built-in option styling", () => {
	const source = readFileSync("src/components/ShelfDropdown.astro", "utf8");
	assert.equal(source.includes(".shelf-menu [data-custom-shelf-options]"), true);
	assert.equal(source.includes("display: contents"), true);
	assert.equal(source.includes("background: transparent !important"), true);
	assert.equal(source.includes("box-shadow: none"), true);
});

test("temporary feedback messages avoid layout shifts and announce status", () => {
	const rating = readFileSync("src/components/RatingControl.astro", "utf8");
	const shelf = readFileSync("src/components/ShelfDropdown.astro", "utf8");
	const index = readFileSync("src/pages/index.astro", "utf8");
	const book = readFileSync("src/pages/book.astro", "utf8");
	const following = readFileSync("src/pages/following.astro", "utf8");
	const readerCard = readFileSync("src/lib/readerCard.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const global = readFileSync("src/assets/global.css", "utf8");
	assert.equal(rating.includes('role="status" aria-live="polite"'), true);
	assert.equal(rating.includes(".rating-feedback[hidden]"), true);
	assert.equal(rating.includes("min-height: 1rem"), true);
	assert.equal(shelf.includes('role="status" aria-live="polite"'), true);
	assert.equal(shelf.includes(".shelf-feedback[hidden]"), true);
	assert.equal(shelf.includes(".shelf-feedback.is-error"), true);
	assert.equal(shelf.includes(".shelf-feedback.is-busy"), true);
	assert.equal(shelf.includes("min-height: 2.1rem"), true);
	assert.equal(shelf.includes("width: 100%"), true);
	for (const source of [`${index}\n${readerCard}\n${global}`, `${book}\n${global}`, `${following}\n${readerCard}\n${global}`, `${profile}\n${global}`]) {
		assert.equal(source.includes('role="status" aria-live="polite"'), true);
		assert.equal(source.includes("[hidden]"), true);
		assert.equal(source.includes("visibility: hidden"), true);
	}
});
