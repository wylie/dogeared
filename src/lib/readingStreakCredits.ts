import type { NeonQueryFunction } from "@neondatabase/serverless";
import { calculateReadingStreak, dateKey } from "./readingLife.ts";

export type StreakCreditRecord = {
	id: number;
	date: string;
	reason: string;
	createdAt: string;
	createdByAdmin: string;
	createdByUsername: string;
};

export type StreakRepairDay = {
	date: string;
	hasReadingActivity: boolean;
	hasCredit: boolean;
	status: "reading" | "credit" | "both" | "gap";
};

export type StreakCreditRangePlan = {
	startDate: string;
	endDate: string;
	selectedDates: string[];
	readingActivityDates: string[];
	existingCreditDates: string[];
	datesRequiringCredit: string[];
};

export type AdminStreakRepairData = {
	currentStreakDays: number;
	qualifyingDateKeys: string[];
	readingActivityDateKeys: string[];
	streakCreditDateKeys: string[];
	gaps: string[];
	recentDays: StreakRepairDay[];
	credits: StreakCreditRecord[];
};

const MS_PER_DAY = 86400000;

let streakCreditSchemaReady: Promise<void> | null = null;

function normalizeText(value: unknown, max = 500) {
	return String(value || "").trim().slice(0, max);
}

function dateFromKey(key: string) {
	const date = new Date(`${key}T00:00:00Z`);
	return Number.isFinite(date.getTime()) ? date : null;
}

function dateKeyFromTime(time: number) {
	return new Date(time).toISOString().slice(0, 10);
}

export function normalizeStreakCreditDate(value: unknown) {
	const normalized = dateKey(value);
	if (!normalized) return "";
	return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export function normalizeStreakCreditReason(value: unknown) {
	return normalizeText(value, 240);
}

export function enumerateStreakDateRange(startDate: unknown, endDate: unknown) {
	const startKey = normalizeStreakCreditDate(startDate);
	const endKey = normalizeStreakCreditDate(endDate);
	const start = dateFromKey(startKey);
	const end = dateFromKey(endKey);
	if (!start || !end || start.getTime() > end.getTime()) return [];
	const dates: string[] = [];
	for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
		dates.push(dateKeyFromTime(time));
	}
	return dates;
}

export function mergeStreakDateKeys(readingDateKeys: unknown[], creditDateKeys: unknown[]) {
	return Array.from(new Set([
		...(Array.isArray(readingDateKeys) ? readingDateKeys : []),
		...(Array.isArray(creditDateKeys) ? creditDateKeys : [])
	].map(normalizeStreakCreditDate).filter(Boolean))).sort((a, b) => b.localeCompare(a));
}

export function planStreakCreditRange(input: {
	startDate: unknown;
	endDate: unknown;
	readingDateKeys?: unknown[];
	creditDateKeys?: unknown[];
}): StreakCreditRangePlan {
	const selectedDates = enumerateStreakDateRange(input.startDate, input.endDate);
	const readingSet = new Set((input.readingDateKeys || []).map(normalizeStreakCreditDate).filter(Boolean));
	const creditSet = new Set((input.creditDateKeys || []).map(normalizeStreakCreditDate).filter(Boolean));
	return {
		startDate: selectedDates[0] || "",
		endDate: selectedDates[selectedDates.length - 1] || "",
		selectedDates,
		readingActivityDates: selectedDates.filter((day) => readingSet.has(day)),
		existingCreditDates: selectedDates.filter((day) => creditSet.has(day)),
		datesRequiringCredit: selectedDates.filter((day) => !readingSet.has(day) && !creditSet.has(day))
	};
}

export function buildStreakRepairTimeline(input: {
	readingDateKeys: unknown[];
	creditDateKeys: unknown[];
	now?: Date;
	days?: number;
}) {
	const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
	const days = Math.max(1, Math.min(430, Math.round(Number(input.days || 45) || 45)));
	const today = normalizeStreakCreditDate(now);
	const todayDate = dateFromKey(today);
	if (!todayDate) return [];
	const readingSet = new Set((input.readingDateKeys || []).map(normalizeStreakCreditDate).filter(Boolean));
	const creditSet = new Set((input.creditDateKeys || []).map(normalizeStreakCreditDate).filter(Boolean));
	return Array.from({ length: days }, (_, index): StreakRepairDay => {
		const day = dateKeyFromTime(todayDate.getTime() - (index * MS_PER_DAY));
		const hasReadingActivity = readingSet.has(day);
		const hasCredit = creditSet.has(day);
		return {
			date: day,
			hasReadingActivity,
			hasCredit,
			status: hasReadingActivity && hasCredit ? "both" : hasReadingActivity ? "reading" : hasCredit ? "credit" : "gap"
		};
	});
}

export function findStreakGaps(input: {
	readingDateKeys: unknown[];
	creditDateKeys: unknown[];
	now?: Date;
	days?: number;
}) {
	const timeline = buildStreakRepairTimeline(input);
	const qualifying = new Set(mergeStreakDateKeys(input.readingDateKeys, input.creditDateKeys));
	const gaps: string[] = [];
	for (const day of timeline) {
		if (!qualifying.has(day.date)) gaps.push(day.date);
		else if (gaps.length > 0) break;
	}
	return gaps;
}

export async function ensureStreakCreditSchema(sql: NeonQueryFunction<false, false>) {
	if (!streakCreditSchemaReady) {
		streakCreditSchemaReady = (async () => {
			await sql`
				create table if not exists reader_streak_credit (
					id bigserial primary key,
					user_id uuid not null references app_user(id) on delete cascade,
					credit_date date not null,
					reason text not null default '',
					created_at timestamptz not null default now(),
					created_by_admin uuid references app_user(id) on delete set null,
					unique (user_id, credit_date)
				)
			`;
			await sql`create index if not exists idx_reader_streak_credit_user_date on reader_streak_credit(user_id, credit_date desc)`;
			await sql`create index if not exists idx_reader_streak_credit_admin_created on reader_streak_credit(created_by_admin, created_at desc)`;
		})();
	}
	try {
		await streakCreditSchemaReady;
	} catch (error) {
		streakCreditSchemaReady = null;
		throw error;
	}
}

export async function loadReadingActivityDateKeysForStreak(sql: NeonQueryFunction<false, false>, userId: string, lookbackDays = 430) {
	const limit = Math.max(30, Math.min(2000, Math.round(Number(lookbackDays || 430) || 430)));
	const rows = await sql<Array<{ activity_day: string }>>`
		with days as (
			select distinct recorded_at::date as day
			from user_reading_progress_event
			where user_id = ${userId}::uuid
				and recorded_at >= current_date - (${limit}::int * interval '1 day')
			union
			select distinct finished_date as day
			from user_book
			where user_id = ${userId}::uuid
				and status = 'finished'
				and finished_date is not null
				and finished_date >= current_date - (${limit}::int * interval '1 day')
		)
		select day::text as activity_day
		from days
		order by activity_day desc
	`;
	return rows.map((row) => normalizeStreakCreditDate(row.activity_day)).filter(Boolean);
}

export async function loadStreakCreditDateKeys(sql: NeonQueryFunction<false, false>, userId: string, lookbackDays = 430) {
	await ensureStreakCreditSchema(sql);
	const limit = Math.max(30, Math.min(2000, Math.round(Number(lookbackDays || 430) || 430)));
	const rows = await sql<Array<{ credit_day: string }>>`
		select credit_date::text as credit_day
		from reader_streak_credit
		where user_id = ${userId}::uuid
			and credit_date >= current_date - (${limit}::int * interval '1 day')
		order by credit_date desc
	`;
	return rows.map((row) => normalizeStreakCreditDate(row.credit_day)).filter(Boolean);
}

export async function loadCreditAwareStreakDateKeys(sql: NeonQueryFunction<false, false>, userId: string, lookbackDays = 430) {
	const [readingDateKeys, creditDateKeys] = await Promise.all([
		loadReadingActivityDateKeysForStreak(sql, userId, lookbackDays),
		loadStreakCreditDateKeys(sql, userId, lookbackDays)
	]);
	return mergeStreakDateKeys(readingDateKeys, creditDateKeys);
}

export async function calculateCurrentReadingStreakFromSql(sql: NeonQueryFunction<false, false>, userId: string, now = new Date()) {
	const keys = await loadCreditAwareStreakDateKeys(sql, userId, 430);
	return calculateReadingStreak(keys, now);
}

export async function loadStreakCredits(sql: NeonQueryFunction<false, false>, userId: string, limit = 100): Promise<StreakCreditRecord[]> {
	await ensureStreakCreditSchema(sql);
	const safeLimit = Math.max(1, Math.min(500, Math.round(Number(limit || 100) || 100)));
	const rows = await sql<Array<{
		id: number;
		credit_date: string;
		reason: string;
		created_at: string;
		created_by_admin: string | null;
		created_by_username: string | null;
	}>>`
		select
			rsc.id,
			rsc.credit_date::text as credit_date,
			rsc.reason,
			rsc.created_at::text as created_at,
			rsc.created_by_admin::text as created_by_admin,
			coalesce(admin_user.username, '') as created_by_username
		from reader_streak_credit rsc
		left join app_user admin_user on admin_user.id = rsc.created_by_admin
		where rsc.user_id = ${userId}::uuid
		order by rsc.credit_date desc
		limit ${safeLimit}
	`;
	return rows.map((row) => ({
		id: Math.max(0, Number(row.id || 0) || 0),
		date: normalizeStreakCreditDate(row.credit_date),
		reason: normalizeText(row.reason, 240),
		createdAt: normalizeText(row.created_at, 80),
		createdByAdmin: normalizeText(row.created_by_admin, 80),
		createdByUsername: normalizeText(row.created_by_username, 80)
	})).filter((row) => row.id > 0 && row.date);
}

export async function loadAdminStreakRepairData(sql: NeonQueryFunction<false, false>, userId: string, now = new Date()): Promise<AdminStreakRepairData> {
	await ensureStreakCreditSchema(sql);
	const [readingActivityDateKeys, streakCreditDateKeys, credits] = await Promise.all([
		loadReadingActivityDateKeysForStreak(sql, userId, 430),
		loadStreakCreditDateKeys(sql, userId, 430),
		loadStreakCredits(sql, userId, 100)
	]);
	const qualifyingDateKeys = mergeStreakDateKeys(readingActivityDateKeys, streakCreditDateKeys);
	return {
		currentStreakDays: calculateReadingStreak(qualifyingDateKeys, now),
		qualifyingDateKeys,
		readingActivityDateKeys,
		streakCreditDateKeys,
		gaps: findStreakGaps({ readingDateKeys: readingActivityDateKeys, creditDateKeys: streakCreditDateKeys, now, days: 120 }),
		recentDays: buildStreakRepairTimeline({ readingDateKeys: readingActivityDateKeys, creditDateKeys: streakCreditDateKeys, now, days: 45 }),
		credits
	};
}

export async function addStreakCreditsForRange(sql: NeonQueryFunction<false, false>, input: {
	userId: string;
	adminUserId: string;
	startDate: unknown;
	endDate: unknown;
	reason: unknown;
}) {
	await ensureStreakCreditSchema(sql);
	const reason = normalizeStreakCreditReason(input.reason);
	if (!reason) return { ok: false, message: "Enter a reason for the streak repair.", created: 0, plan: null as StreakCreditRangePlan | null };
	const [readingDateKeys, creditDateKeys] = await Promise.all([
		loadReadingActivityDateKeysForStreak(sql, input.userId, 2000),
		loadStreakCreditDateKeys(sql, input.userId, 2000)
	]);
	const plan = planStreakCreditRange({
		startDate: input.startDate,
		endDate: input.endDate,
		readingDateKeys,
		creditDateKeys
	});
	if (plan.selectedDates.length === 0) return { ok: false, message: "Choose a valid start and end date.", created: 0, plan };
	if (plan.datesRequiringCredit.length === 0) return { ok: true, message: "No missing dates needed streak credits.", created: 0, plan };
	const rows = await sql<Array<{ id: number }>>`
		insert into reader_streak_credit (user_id, credit_date, reason, created_by_admin)
		select ${input.userId}::uuid, day::date, ${reason}, ${input.adminUserId}::uuid
		from unnest(${plan.datesRequiringCredit}::text[]) as day
		on conflict (user_id, credit_date) do nothing
		returning id
	`;
	return {
		ok: true,
		message: `Created ${rows.length} streak ${rows.length === 1 ? "credit" : "credits"}.`,
		created: rows.length,
		plan
	};
}

export async function removeStreakCredit(sql: NeonQueryFunction<false, false>, input: {
	userId: string;
	creditId: unknown;
}) {
	await ensureStreakCreditSchema(sql);
	const creditId = Math.max(0, Number(input.creditId || 0) || 0);
	if (creditId <= 0) return { ok: false, message: "Choose a valid streak credit to remove." };
	const rows = await sql<Array<{ id: number }>>`
		delete from reader_streak_credit
		where id = ${creditId}
			and user_id = ${input.userId}::uuid
		returning id
	`;
	if (!rows[0]?.id) return { ok: false, message: "Streak credit not found." };
	return { ok: true, message: "Streak credit removed." };
}
