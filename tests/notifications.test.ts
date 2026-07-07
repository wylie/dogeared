import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notification service owns the v1 model, grouping, preferences, and admin stats", () => {
	const source = readFileSync("src/lib/notifications.ts", "utf8");
	for (const type of [
		"user_follow",
		"activity_like",
		"activity_comment",
		"activity_reply",
		"reading_goal_completed",
		"reading_streak_milestone",
		"series_finished",
		"discovery_want_to_read_trending",
		"author_new_book",
		"import_completed",
		"goodreads_import_completed"
	]) {
		assert.equal(source.includes(`"${type}"`), true);
	}
	for (const category of ["community", "reading", "discovery", "milestones", "system"]) {
		assert.equal(source.includes(`"${category}"`), true);
	}
	assert.equal(source.includes("export async function createNotification"), true);
	assert.equal(source.includes("group_key text not null"), true);
	assert.equal(source.includes("actor_count int not null"), true);
	assert.equal(source.includes("deleted_at timestamptz null"), true);
	assert.equal(source.includes("normalizeNotificationPreferences"), true);
	assert.equal(source.includes("isCategoryEnabled"), true);
	assert.equal(source.includes("loadAdminNotificationStats"), true);
	assert.equal(source.includes("createReadingMilestoneNotifications"), true);
	assert.equal(source.includes("now() - ${windowInterval}::interval"), true);
});

test("notification center is private, grouped, actionable, and accessible", () => {
	const page = readFileSync("src/pages/notifications.astro", "utf8");
	assert.equal(page.includes("resolveUserBySession"), true);
	assert.equal(page.includes("Astro.redirect(\"/\")"), true);
	assert.equal(page.includes('robots="noindex,nofollow"'), true);
	for (const label of ["Today", "This Week", "Earlier"]) {
		assert.equal(page.includes(label), true);
	}
	for (const action of ["mark_all_read", "mark_read", "delete", "open"]) {
		assert.equal(page.includes(`value="${action}"`), true);
	}
	assert.equal(page.includes("You're all caught up."), true);
	assert.equal(page.includes("As you interact with other readers, important updates will appear here."), true);
	assert.equal(page.includes('aria-live="polite"'), true);
	assert.equal(page.includes("loadNotifications"), true);
	assert.equal(page.includes("markNotificationRead"), true);
	assert.equal(page.includes("markAllNotificationsRead"), true);
	assert.equal(page.includes("deleteNotification"), true);
});

test("navigation shows a subtle unread notification badge outside profile", () => {
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	assert.equal(nav.includes("left-hand-notifications-item"), true);
	assert.equal(nav.includes('href={isNotificationsPage ? undefined : \'/notifications\'}'), true);
	assert.equal(nav.includes("left-hand-notification-badge"), true);
	assert.equal(nav.includes("/api/notifications/count"), true);
	assert.equal(nav.includes("dogeared:notifications-updated"), true);
	assert.equal(profile.includes('id="notifications"'), false);
	assert.equal(profile.includes("notificationIntent"), false);
});

test("settings include in-app notification category preferences", () => {
	const settings = readFileSync("src/pages/settings.astro", "utf8");
	const api = readFileSync("src/pages/api/account/preferences.ts", "utf8");
	for (const id of [
		"notification-category-community",
		"notification-category-reading",
		"notification-category-discovery",
		"notification-category-milestones",
		"notification-category-system"
	]) {
		assert.equal(settings.includes(id), true);
	}
	assert.equal(settings.includes("categories:"), true);
	assert.equal(api.includes("categories: {"), true);
	assert.equal(api.includes("notificationCategories"), true);
});

test("notification event generators use the shared service", () => {
	const like = readFileSync("src/pages/api/activity/like.ts", "utf8");
	const comments = readFileSync("src/pages/api/activity/comments.ts", "utf8");
	const follow = readFileSync("src/pages/api/follow/index.ts", "utf8");
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const shelf = readFileSync("src/pages/api/shelf/entries.ts", "utf8");
	const count = readFileSync("src/pages/api/notifications/count.ts", "utf8");
	const api = readFileSync("src/pages/api/notifications/index.ts", "utf8");
	assert.equal(like.includes("createNotification"), true);
	assert.equal(like.includes("activity_like"), true);
	assert.equal(comments.includes("activity_comment"), true);
	assert.equal(comments.includes("activity_reply"), true);
	assert.equal(follow.includes("user_follow"), true);
	assert.equal(profile.includes("user_follow"), true);
	assert.equal(shelf.includes("createReadingMilestoneNotifications"), true);
	assert.equal(count.includes("loadUnreadNotificationCount"), true);
	assert.equal(api.includes("loadNotifications"), true);
});

test("admin notification dashboard and documentation describe operational scope", () => {
	const page = readFileSync("src/pages/admin/notifications.astro", "utf8");
	const overview = readFileSync("docs/product/overview.md", "utf8");
	const features = readFileSync("docs/product/features.md", "utf8");
	const routes = readFileSync("docs/engineering/routes.md", "utf8");
	const database = readFileSync("docs/engineering/database.md", "utf8");
	assert.equal(page.includes("resolveAdminSession"), true);
	assert.equal(page.includes('robots="noindex,nofollow"'), true);
	for (const label of ["Notifications sent today", "Unread notifications", "Most Common Types", "Volume Over Time", "Failed notification jobs"]) {
		assert.equal(page.includes(label), true);
	}
	assert.equal(overview.includes("dedicated low-noise notification center"), true);
	assert.equal(features.includes("Supported v1 event types"), true);
	assert.equal(routes.includes("/admin/notifications"), true);
	assert.equal(database.includes("Group key"), true);
});
