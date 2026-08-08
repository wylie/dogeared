import type { NeonQueryFunction } from "@neondatabase/serverless";

export const FOUNDING_READER_MODES = ["open", "waitlist", "invite_only"] as const;
export const WAITLIST_STATUSES = ["pending", "approved", "invited", "joined", "declined"] as const;

export type FoundingReaderMode = typeof FOUNDING_READER_MODES[number];
export type WaitlistStatus = typeof WAITLIST_STATUSES[number];

export type FoundingReaderConfig = {
	mode: FoundingReaderMode;
	effectiveMode: FoundingReaderMode;
	targetCapacity: number;
	autoWaitlistAtCapacity: boolean;
	currentReaders: number;
	capacityReached: boolean;
};

export type WaitlistEntry = {
	id: number;
	email: string;
	displayName: string;
	status: WaitlistStatus;
	requestedAt: string;
	approvedAt: string;
	invitedAt: string;
	joinedAt: string;
	declinedAt: string;
};

export type FoundingReaderAdminSummary = {
	config: FoundingReaderConfig;
	waitlistCount: number;
	pendingCount: number;
	statusCounts: Record<WaitlistStatus, number>;
	entries: WaitlistEntry[];
};

export const DEFAULT_FOUNDING_READER_CONFIG: FoundingReaderConfig = {
	mode: "open",
	effectiveMode: "open",
	targetCapacity: 100,
	autoWaitlistAtCapacity: true,
	currentReaders: 0,
	capacityReached: false
};

const ALLOWED_JOIN_STATUSES = new Set<WaitlistStatus>(["approved", "invited", "joined"]);

function normalizeText(value: unknown, maxLength = 240) {
	return String(value || "").trim().slice(0, maxLength);
}

export function normalizeFoundingReaderMode(value: unknown): FoundingReaderMode {
	const mode = normalizeText(value, 24);
	return FOUNDING_READER_MODES.includes(mode as FoundingReaderMode) ? mode as FoundingReaderMode : "open";
}

export function normalizeWaitlistStatus(value: unknown): WaitlistStatus {
	const status = normalizeText(value, 24);
	return WAITLIST_STATUSES.includes(status as WaitlistStatus) ? status as WaitlistStatus : "pending";
}

export function normalizeWaitlistEmail(value: unknown) {
	return String(value || "").trim().toLowerCase().slice(0, 320);
}

export async function ensureFoundingReaderSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists founding_reader_config (
			id integer primary key default 1 check (id = 1),
			mode text not null default 'open' check (mode in ('open', 'waitlist', 'invite_only')),
			target_capacity integer not null default 100 check (target_capacity > 0),
			auto_waitlist_at_capacity boolean not null default true,
			updated_at timestamptz not null default now()
		)
	`;
	await sql`
		insert into founding_reader_config (id, mode, target_capacity, auto_waitlist_at_capacity)
		values (1, 'open', 100, true)
		on conflict (id) do nothing
	`;
	await sql`
		create table if not exists founding_reader_waitlist (
			id bigserial primary key,
			email text not null,
			email_normalized text not null unique,
			display_name text not null default '',
			status text not null default 'pending' check (status in ('pending', 'approved', 'invited', 'joined', 'declined')),
			requested_at timestamptz not null default now(),
			approved_at timestamptz,
			invited_at timestamptz,
			joined_at timestamptz,
			declined_at timestamptz,
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_founding_reader_waitlist_status_requested on founding_reader_waitlist(status, requested_at desc)`;
	await sql`create index if not exists idx_founding_reader_waitlist_email_normalized on founding_reader_waitlist(email_normalized)`;
}

async function countCurrentReaders(sql: NeonQueryFunction<false, false>) {
	const rows = await sql<Array<{ count: number }>>`
		select count(*)::int as count
		from app_user
	`;
	return Math.max(0, Number(rows[0]?.count || 0));
}

export async function loadFoundingReaderConfig(sql: NeonQueryFunction<false, false>): Promise<FoundingReaderConfig> {
	await ensureFoundingReaderSchema(sql);
	return loadFoundingReaderConfigReadOnly(sql);
}

export async function loadFoundingReaderConfigReadOnly(sql: NeonQueryFunction<false, false>): Promise<FoundingReaderConfig> {
	const [configRows, currentReaders] = await Promise.all([
		sql<Array<{ mode: string; target_capacity: number; auto_waitlist_at_capacity: boolean }>>`
			select mode, target_capacity, auto_waitlist_at_capacity
			from founding_reader_config
			where id = 1
			limit 1
		`,
		countCurrentReaders(sql)
	]);
	const row = configRows[0];
	const targetCapacity = Math.max(1, Number(row?.target_capacity || DEFAULT_FOUNDING_READER_CONFIG.targetCapacity));
	const mode = normalizeFoundingReaderMode(row?.mode);
	const autoWaitlistAtCapacity = row?.auto_waitlist_at_capacity !== false;
	const capacityReached = currentReaders >= targetCapacity;
	const effectiveMode = mode === "open" && autoWaitlistAtCapacity && capacityReached ? "waitlist" : mode;
	return {
		mode,
		effectiveMode,
		targetCapacity,
		autoWaitlistAtCapacity,
		currentReaders,
		capacityReached
	};
}

export async function saveFoundingReaderConfig(
	sql: NeonQueryFunction<false, false>,
	input: { mode: unknown; targetCapacity: unknown; autoWaitlistAtCapacity: unknown }
) {
	await ensureFoundingReaderSchema(sql);
	const mode = normalizeFoundingReaderMode(input.mode);
	const targetCapacity = Math.max(1, Math.round(Number(input.targetCapacity || DEFAULT_FOUNDING_READER_CONFIG.targetCapacity)));
	const autoWaitlistAtCapacity = input.autoWaitlistAtCapacity === true || input.autoWaitlistAtCapacity === "on" || input.autoWaitlistAtCapacity === "true";
	await sql`
		update founding_reader_config
		set mode = ${mode},
			target_capacity = ${targetCapacity},
			auto_waitlist_at_capacity = ${autoWaitlistAtCapacity},
			updated_at = now()
		where id = 1
	`;
	return loadFoundingReaderConfig(sql);
}

export async function upsertFoundingReaderWaitlistRequest(
	sql: NeonQueryFunction<false, false>,
	input: { email: unknown; displayName?: unknown; status?: unknown }
) {
	await ensureFoundingReaderSchema(sql);
	const email = normalizeText(input.email, 320);
	const emailNormalized = normalizeWaitlistEmail(input.email);
	if (!emailNormalized) return null;
	const displayName = normalizeText(input.displayName, 120);
	const status = normalizeWaitlistStatus(input.status);
	const rows = await sql<Array<{
		id: number;
		email: string;
		display_name: string;
		status: string;
		requested_at: string;
		approved_at: string | null;
		invited_at: string | null;
		joined_at: string | null;
		declined_at: string | null;
	}>>`
		insert into founding_reader_waitlist (email, email_normalized, display_name, status)
		values (${email}, ${emailNormalized}, ${displayName}, ${status})
		on conflict (email_normalized) do update
		set email = excluded.email,
			display_name = case
				when excluded.display_name <> '' then excluded.display_name
				else founding_reader_waitlist.display_name
			end,
			status = case
				when founding_reader_waitlist.status in ('declined') then 'pending'
				else founding_reader_waitlist.status
			end,
			updated_at = now()
		returning id, email, display_name, status, requested_at::text, approved_at::text, invited_at::text, joined_at::text, declined_at::text
	`;
	return mapWaitlistEntry(rows[0]);
}

export async function markFoundingReaderJoined(sql: NeonQueryFunction<false, false>, email: unknown) {
	await ensureFoundingReaderSchema(sql);
	const emailNormalized = normalizeWaitlistEmail(email);
	if (!emailNormalized) return;
	await sql`
		update founding_reader_waitlist
		set status = 'joined',
			joined_at = coalesce(joined_at, now()),
			updated_at = now()
		where email_normalized = ${emailNormalized}
			and status in ('approved', 'invited', 'pending')
	`;
}

export async function resolveFoundingReaderAccess(sql: NeonQueryFunction<false, false>, email: unknown) {
	await ensureFoundingReaderSchema(sql);
	const config = await loadFoundingReaderConfig(sql);
	if (config.effectiveMode === "open") return { allowed: true, config, message: "" };
	const emailNormalized = normalizeWaitlistEmail(email);
	const rows = await sql<Array<{ status: string }>>`
		select status
		from founding_reader_waitlist
		where email_normalized = ${emailNormalized}
		limit 1
	`;
	const status = normalizeWaitlistStatus(rows[0]?.status);
	if (ALLOWED_JOIN_STATUSES.has(status)) return { allowed: true, config, message: "" };
	await upsertFoundingReaderWaitlistRequest(sql, { email, status: "pending" });
	const waitlistMessage = "Thanks for requesting access to DogEared's Founding Reader Program. We'll email you when your invitation is ready.";
	const inviteOnlyMessage = "DogEared is growing carefully with a small group of Founding Readers. We'll email you if an invitation opens.";
	return {
		allowed: false,
		config,
		message: config.effectiveMode === "invite_only" ? inviteOnlyMessage : waitlistMessage
	};
}

export async function updateFoundingReaderWaitlistStatus(
	sql: NeonQueryFunction<false, false>,
	input: { id: unknown; status: unknown }
) {
	await ensureFoundingReaderSchema(sql);
	const id = Math.max(0, Math.round(Number(input.id || 0)));
	const status = normalizeWaitlistStatus(input.status);
	if (!id) return;
	await sql`
		update founding_reader_waitlist
		set status = ${status},
			approved_at = case when ${status} = 'approved' then coalesce(approved_at, now()) else approved_at end,
			invited_at = case when ${status} = 'invited' then coalesce(invited_at, now()) else invited_at end,
			joined_at = case when ${status} = 'joined' then coalesce(joined_at, now()) else joined_at end,
			declined_at = case when ${status} = 'declined' then coalesce(declined_at, now()) else declined_at end,
			updated_at = now()
		where id = ${id}
	`;
}

export async function removeFoundingReaderWaitlistEntry(sql: NeonQueryFunction<false, false>, id: unknown) {
	await ensureFoundingReaderSchema(sql);
	const entryId = Math.max(0, Math.round(Number(id || 0)));
	if (!entryId) return;
	await sql`delete from founding_reader_waitlist where id = ${entryId}`;
}

export async function loadFoundingReaderAdminSummary(sql: NeonQueryFunction<false, false>): Promise<FoundingReaderAdminSummary> {
	await ensureFoundingReaderSchema(sql);
	const [config, countRows, entryRows] = await Promise.all([
		loadFoundingReaderConfig(sql),
		sql<Array<{ status: string; count: number }>>`
			select status, count(*)::int as count
			from founding_reader_waitlist
			group by status
		`,
		sql<Array<{
			id: number;
			email: string;
			display_name: string;
			status: string;
			requested_at: string;
			approved_at: string | null;
			invited_at: string | null;
			joined_at: string | null;
			declined_at: string | null;
		}>>`
			select id, email, display_name, status, requested_at::text, approved_at::text, invited_at::text, joined_at::text, declined_at::text
			from founding_reader_waitlist
			order by
				case status
					when 'pending' then 1
					when 'approved' then 2
					when 'invited' then 3
					when 'joined' then 4
					else 5
				end,
				requested_at desc
			limit 200
		`
	]);
	const statusCounts = Object.fromEntries(WAITLIST_STATUSES.map((status) => [status, 0])) as Record<WaitlistStatus, number>;
	for (const row of countRows) {
		statusCounts[normalizeWaitlistStatus(row.status)] = Math.max(0, Number(row.count || 0));
	}
	return {
		config,
		waitlistCount: WAITLIST_STATUSES.reduce((total, status) => total + statusCounts[status], 0),
		pendingCount: statusCounts.pending,
		statusCounts,
		entries: entryRows.map(mapWaitlistEntry)
	};
}

function mapWaitlistEntry(row: any): WaitlistEntry {
	return {
		id: Math.max(0, Number(row?.id || 0)),
		email: normalizeText(row?.email, 320),
		displayName: normalizeText(row?.display_name, 120),
		status: normalizeWaitlistStatus(row?.status),
		requestedAt: normalizeText(row?.requested_at),
		approvedAt: normalizeText(row?.approved_at),
		invitedAt: normalizeText(row?.invited_at),
		joinedAt: normalizeText(row?.joined_at),
		declinedAt: normalizeText(row?.declined_at)
	};
}
