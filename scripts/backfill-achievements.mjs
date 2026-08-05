import { neon } from "@neondatabase/serverless";
import {
	ACHIEVEMENT_DEFINITIONS,
	awardAchievement,
	ensureAchievementSchema
} from "../src/lib/achievements.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limitArg = process.argv.slice(2).find((arg) => arg.startsWith("--limit="));
const reportLimit = limitArg ? Math.max(0, Number(limitArg.split("=")[1]) || 0) : 50;

if (!databaseUrl) throw new Error("Missing DATABASE_URL.");

const sql = neon(databaseUrl);

function text(value) {
	return String(value ?? "").trim();
}

function number(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

const streakDefinitions = ACHIEVEMENT_DEFINITIONS
	.filter((definition) => definition.type === "reading_streak")
	.map((definition) => ({
		key: definition.key,
		days: number(definition.criteria.streakDays)
	}))
	.filter((definition) => definition.days > 0)
	.sort((a, b) => a.days - b.days);

async function userAchievementTableExists() {
	const rows = await sql`select to_regclass('public.user_achievement')::text as table_name`;
	return !!text(rows[0]?.table_name);
}

async function loadExistingScopes() {
	if (!(await userAchievementTableExists())) return new Set();
	const rows = await sql`
		select
			user_id::text as user_id,
			definition_key,
			coalesce(related_series_id, 0)::int as related_series_id,
			coalesce(related_book_id, 0)::int as related_book_id
		from user_achievement
	`;
	return new Set(rows.map((row) => [
		text(row.user_id),
		text(row.definition_key),
		number(row.related_series_id),
		number(row.related_book_id)
	].join(":")));
}

function scopeKey(plan) {
	return [
		text(plan.userId),
		text(plan.definitionKey),
		number(plan.relatedSeriesId),
		number(plan.relatedBookId)
	].join(":");
}

async function planStreakAwards() {
	const thresholds = streakDefinitions.map((definition) => definition.days);
	const rows = await sql`
		with days as (
			select distinct user_id, recorded_at::date as day
			from user_reading_progress_event
		),
		numbered as (
			select
				user_id,
				day,
				day - (row_number() over (partition by user_id order by day))::int as grp
			from days
		),
		streak_days as (
			select
				user_id,
				day,
				row_number() over (partition by user_id, grp order by day)::int as streak_day
			from numbered
		)
		select
			user_id::text as user_id,
			streak_day::int as days,
			min(day)::text as earned_date
		from streak_days
		where streak_day = any(${thresholds}::int[])
		group by user_id, streak_day
		order by user_id, streak_day
	`;
	return rows.map((row) => {
		const days = number(row.days);
		return {
			userId: text(row.user_id),
			definitionKey: `reading_streak_${days}`,
			earnedAt: text(row.earned_date),
			metadata: { streakDays: days, backfilled: true },
			label: `${days} day reading streak`
		};
	});
}

async function planSeriesAwards() {
	const rows = await sql`
		select
			ub.user_id::text as user_id,
			s.id::int as series_id,
			s.name as series_name,
			max(coalesce(ub.finished_date, ub.updated_at::date))::text as earned_date,
			count(sb.book_id)::int as total_books,
			count(ub.book_id) filter (where ub.status = 'finished')::int as finished_books
		from series s
		join series_book sb on sb.series_id = s.id and sb.book_id is not null
		join user_book ub on ub.book_id = sb.book_id and ub.status = 'finished'
		group by ub.user_id, s.id, s.name
		having count(sb.book_id) > 1
			and count(ub.book_id) filter (where ub.status = 'finished') = count(sb.book_id)
		order by ub.user_id, s.name
	`;
	return rows.map((row) => ({
		userId: text(row.user_id),
		definitionKey: "series_completion",
		relatedSeriesId: number(row.series_id),
		earnedAt: text(row.earned_date),
		metadata: {
			seriesId: number(row.series_id),
			seriesName: text(row.series_name),
			totalBooks: number(row.total_books),
			finishedBooks: number(row.finished_books),
			backfilled: true
		},
		label: `finished ${text(row.series_name) || "series"}`
	}));
}

const existing = await loadExistingScopes();
const planned = [...await planStreakAwards(), ...await planSeriesAwards()];
const newAwards = planned.filter((plan) => !existing.has(scopeKey(plan)));
const conflicts = planned.filter((plan) => existing.has(scopeKey(plan)));
const eligibleUsers = new Set(newAwards.map((plan) => plan.userId));

console.log(`Achievement backfill ${apply ? "apply" : "dry run"}`);
console.log(`Eligible users: ${eligibleUsers.size}`);
console.log(`Achievements to create: ${newAwards.length}`);
console.log(`Existing/conflicting awards skipped: ${conflicts.length}`);

for (const plan of newAwards.slice(0, reportLimit)) {
	console.log(`- ${plan.userId}: ${plan.label} (${plan.definitionKey}) earned ${plan.earnedAt || "unknown date"}`);
}
if (newAwards.length > reportLimit) {
	console.log(`... ${newAwards.length - reportLimit} additional awards omitted from report.`);
}

if (!apply) {
	console.log("Dry run complete. Re-run with --apply to create achievements.");
	process.exit(0);
}

await ensureAchievementSchema(sql);
let created = 0;
let skipped = 0;
for (const plan of newAwards) {
	const award = await awardAchievement(sql, {
		userId: plan.userId,
		definitionKey: plan.definitionKey,
		relatedSeriesId: plan.relatedSeriesId,
		relatedBookId: plan.relatedBookId,
		earnedAt: plan.earnedAt,
		metadata: plan.metadata
	});
	if (award?.inserted) created += 1;
	else skipped += 1;
}

console.log("Achievement backfill complete.");
console.log(`Created: ${created}`);
console.log(`Skipped during apply: ${skipped + conflicts.length}`);
