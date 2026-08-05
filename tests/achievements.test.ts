import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	ACHIEVEMENT_DEFINITIONS,
	getReadingStreakAchievementDefinition,
	renderAchievementTitle
} from "../src/lib/achievements.ts";

test("achievement registry defines initial streak and series identities", () => {
	const streakIconByDays = new Map([
		[7, "eco"],
		[14, "filter_vintage"],
		[30, "local_fire_department"],
		[60, "bolt"],
		[100, "wb_sunny"],
		[365, "calendar_month"]
	]);
	for (const [days, icon] of streakIconByDays) {
		const definition = getReadingStreakAchievementDefinition(days);
		assert.equal(definition?.key, `reading_streak_${days}`);
		assert.equal(definition?.type, "reading_streak");
		assert.equal(definition?.iconIdentifier, icon);
		assert.equal(definition?.accentColorToken, `--achievement-streak-${days}`);
		assert.equal(definition?.criteria.streakDays, days);
		assert.equal(definition?.repeatable, false);
	}
	const series = ACHIEVEMENT_DEFINITIONS.find((definition) => definition.key === "series_completion");
	assert.equal(series?.type, "series_completion");
	assert.equal(series?.iconIdentifier, "auto_stories");
	assert.equal(series?.accentColorToken, "--achievement-series-completion");
	assert.equal(renderAchievementTitle(series!, { seriesName: "Wings of Fire" }), "Finished Wings of Fire");
	const yearlyGoal = ACHIEVEMENT_DEFINITIONS.find((definition) => definition.key === "yearly_reading_goal");
	assert.equal(yearlyGoal?.type, "yearly_goal");
	assert.equal(yearlyGoal?.iconIdentifier, "flag");
	assert.equal(yearlyGoal?.accentColorToken, "--achievement-yearly-goal");
	assert.equal(yearlyGoal?.repeatable, true);
});

test("achievement persistence prevents duplicate scoped awards", () => {
	const source = readFileSync("src/lib/achievements.ts", "utf8");
	assert.equal(source.includes("create table if not exists achievement_definition"), true);
	assert.equal(source.includes("create table if not exists user_achievement"), true);
	assert.equal(source.includes("scope_key text not null default ''"), true);
	assert.equal(source.includes("idx_user_achievement_unique_scope"), true);
	assert.equal(source.includes("on conflict do nothing"), true);
	assert.equal(source.includes("export async function awardAchievement"), true);
	assert.equal(source.includes("export async function loadEarnedAchievements"), true);
});

test("achievement notifications use registry metadata instead of separate visual constants", () => {
	const notifications = readFileSync("src/lib/notifications.ts", "utf8");
	assert.equal(notifications.includes("achievementVisual"), true);
	assert.equal(notifications.includes("achievementDefinitionKey"), true);
	assert.equal(notifications.includes("accentColorToken"), true);
	assert.equal(notifications.includes("awardAchievement(sql"), true);
	assert.equal(notifications.includes('getAchievementDefinition("yearly_reading_goal")'), true);
	assert.equal(notifications.includes("[3, 7, 14, 30, 50, 100]"), false);
	assert.equal(notifications.includes("reading_streak_milestone: local_fire_department"), false);
	assert.equal(notifications.includes("series_finished: auto_stories"), false);
});

test("profiles, notifications, and settings expose collectible achievement badges", () => {
	const profile = readFileSync("src/pages/profile/[username].astro", "utf8");
	const notifications = readFileSync("src/pages/notifications.astro", "utf8");
	const globalCss = readFileSync("src/assets/global.css", "utf8");
	const settings = readFileSync("src/pages/settings.astro", "utf8");
	const api = readFileSync("src/pages/api/account/preferences.ts", "utf8");
	assert.equal(profile.includes("loadEarnedAchievements"), true);
	assert.equal(profile.includes('id="achievements"'), true);
	assert.equal(profile.includes("profile-achievement-row"), true);
	assert.equal(profile.includes("profile-achievements-more"), true);
	assert.equal(profile.includes("achievements-section"), false);
	assert.equal(profile.includes("achievement-popover"), true);
	assert.equal(profile.includes("achievement-art achievement-art-large"), true);
	assert.equal(profile.includes("achievementAnchor"), true);
	assert.equal(notifications.includes("achievement-art achievement-art-small"), true);
	assert.equal(globalCss.includes(".achievement-art"), true);
	assert.equal(globalCss.includes("--achievement-yearly-goal"), true);
	assert.equal(settings.includes("show-achievements"), true);
	assert.equal(api.includes("showAchievements"), true);
});

test("achievement backfill is dry-run first and reports conflicts", () => {
	const script = readFileSync("scripts/backfill-achievements.mjs", "utf8");
	assert.equal(script.includes("--apply"), true);
	assert.equal(script.includes("Dry run complete"), true);
	assert.equal(script.includes("Eligible users"), true);
	assert.equal(script.includes("Existing/conflicting awards skipped"), true);
	assert.equal(script.includes("awardAchievement"), true);
});
