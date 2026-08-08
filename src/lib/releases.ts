import type { NeonQueryFunction } from "@neondatabase/serverless";
import { withRuntimeCache } from "./runtimeCache";

export const RELEASE_STATUSES = ["draft", "published", "archived"] as const;
export type ReleaseStatus = typeof RELEASE_STATUSES[number];

export type ReleaseRecord = {
	id: number;
	version: string;
	title: string;
	summary: string;
	releaseDate: string;
	published: boolean;
	status: ReleaseStatus;
	highlights: string;
	bugFixes: string;
	knownIssues: string;
	migrationNotes: string;
	publishedAt: string;
	archivedAt: string;
	createdAt: string;
	updatedAt: string;
};

function normalizeText(value: unknown, maxLength = 2000) {
	return String(value || "").trim().slice(0, maxLength);
}

function normalizeStatus(value: unknown): ReleaseStatus {
	const status = normalizeText(value, 24);
	return RELEASE_STATUSES.includes(status as ReleaseStatus) ? status as ReleaseStatus : "draft";
}

function normalizeBoolean(value: unknown) {
	return value === true || value === "true" || value === "on" || value === "1";
}

export function releaseLines(value: unknown) {
	return normalizeText(value, 5000)
		.split(/\r?\n/)
		.map((line) => line.replace(/^[-*✓\s]+/, "").trim())
		.filter(Boolean);
}

export async function ensureReleaseSchema(sql: NeonQueryFunction<false, false>) {
	await sql`
		create table if not exists admin_release_note (
			id bigserial primary key,
			version text not null default '',
			title text not null default '',
			body text not null default '',
			published_at timestamptz,
			created_at timestamptz not null default now()
		)
	`;
	await sql`alter table admin_release_note add column if not exists summary text not null default ''`;
	await sql`alter table admin_release_note add column if not exists release_date date`;
	await sql`alter table admin_release_note add column if not exists published boolean not null default false`;
	await sql`alter table admin_release_note add column if not exists status text not null default 'draft'`;
	await sql`alter table admin_release_note add column if not exists highlights text not null default ''`;
	await sql`alter table admin_release_note add column if not exists bug_fixes text not null default ''`;
	await sql`alter table admin_release_note add column if not exists known_issues text not null default ''`;
	await sql`alter table admin_release_note add column if not exists migration_notes text not null default ''`;
	await sql`alter table admin_release_note add column if not exists archived_at timestamptz`;
	await sql`alter table admin_release_note add column if not exists updated_at timestamptz not null default now()`;
	await sql`
		update admin_release_note
		set summary = body
		where coalesce(summary, '') = ''
			and coalesce(body, '') <> ''
	`;
	await sql`
		update admin_release_note
		set published = true,
			status = 'published',
			release_date = coalesce(release_date, published_at::date)
		where published_at is not null
			and published = false
			and status = 'draft'
	`;
	await sql`create index if not exists idx_admin_release_note_published on admin_release_note(published_at desc, created_at desc)`;
	await sql`create index if not exists idx_admin_release_note_status_date on admin_release_note(status, release_date desc, created_at desc)`;
}

export async function loadReleases(sql: NeonQueryFunction<false, false>, input: { publishedOnly?: boolean; limit?: number } = {}) {
	await ensureReleaseSchema(sql);
	const publishedOnly = input.publishedOnly === true;
	const limit = Math.max(1, Math.min(100, Math.round(Number(input.limit || 30))));
	const rows = await sql<Array<any>>`
		select
			id,
			version,
			title,
			coalesce(nullif(summary, ''), body, '') as summary,
			release_date::text as release_date,
			published,
			status,
			highlights,
			bug_fixes,
			known_issues,
			migration_notes,
			published_at::text as published_at,
			archived_at::text as archived_at,
			created_at::text as created_at,
			updated_at::text as updated_at
		from admin_release_note
		where (${publishedOnly}::boolean = false or (published = true and status = 'published'))
		order by coalesce(release_date::timestamptz, published_at, created_at) desc, id desc
		limit ${limit}
	`;
	return rows.map(mapRelease);
}

export async function loadPublishedReleases(sql: NeonQueryFunction<false, false>, limit = 20) {
	const normalizedLimit = Math.max(1, Math.min(100, Math.round(Number(limit || 20))));
	return withRuntimeCache(`published-releases:${normalizedLimit}`, 60 * 1000, async () => {
		const rows = await sql<Array<any>>`
			select
				id,
				version,
				title,
				coalesce(nullif(summary, ''), body, '') as summary,
				release_date::text as release_date,
				published,
				status,
				highlights,
				bug_fixes,
				known_issues,
				migration_notes,
				published_at::text as published_at,
				archived_at::text as archived_at,
				created_at::text as created_at,
				updated_at::text as updated_at
			from admin_release_note
			where published = true
				and status = 'published'
			order by coalesce(release_date::timestamptz, published_at, created_at) desc, id desc
			limit ${normalizedLimit}
		`;
		return rows.map(mapRelease);
	});
}

export async function loadLatestPublishedRelease(sql: NeonQueryFunction<false, false>) {
	const releases = await loadPublishedReleases(sql, 1);
	return releases[0] || null;
}

export async function saveRelease(sql: NeonQueryFunction<false, false>, input: {
	id?: unknown;
	version: unknown;
	title: unknown;
	summary: unknown;
	releaseDate?: unknown;
	status?: unknown;
	published?: unknown;
	highlights?: unknown;
	bugFixes?: unknown;
	knownIssues?: unknown;
	migrationNotes?: unknown;
}) {
	await ensureReleaseSchema(sql);
	const id = Math.max(0, Math.round(Number(input.id || 0)));
	const version = normalizeText(input.version, 80);
	const title = normalizeText(input.title, 160);
	const summary = normalizeText(input.summary, 2000);
	const releaseDate = normalizeText(input.releaseDate, 20) || null;
	const status = normalizeStatus(input.status);
	const published = status === "published" || normalizeBoolean(input.published);
	if (!version || !title || !summary) {
		return { ok: false, message: "Version, title, and summary are required." };
	}
	if (id > 0) {
		await sql`
			update admin_release_note
			set version = ${version},
				title = ${title},
				summary = ${summary},
				body = ${summary},
				release_date = ${releaseDate}::date,
				published = ${published},
				status = ${status},
				highlights = ${normalizeText(input.highlights, 5000)},
				bug_fixes = ${normalizeText(input.bugFixes, 5000)},
				known_issues = ${normalizeText(input.knownIssues, 5000)},
				migration_notes = ${normalizeText(input.migrationNotes, 5000)},
				published_at = case when ${published} then coalesce(published_at, now()) else null end,
				archived_at = case when ${status} = 'archived' then coalesce(archived_at, now()) else null end,
				updated_at = now()
			where id = ${id}
		`;
		return { ok: true, message: "Release updated." };
	}
	await sql`
		insert into admin_release_note (
			version,
			title,
			summary,
			body,
			release_date,
			published,
			status,
			highlights,
			bug_fixes,
			known_issues,
			migration_notes,
			published_at,
			archived_at
		)
		values (
			${version},
			${title},
			${summary},
			${summary},
			${releaseDate}::date,
			${published},
			${status},
			${normalizeText(input.highlights, 5000)},
			${normalizeText(input.bugFixes, 5000)},
			${normalizeText(input.knownIssues, 5000)},
			${normalizeText(input.migrationNotes, 5000)},
			case when ${published} then now() else null end,
			case when ${status} = 'archived' then now() else null end
		)
	`;
	return { ok: true, message: published ? "Release published." : "Release saved." };
}

export async function publishRelease(sql: NeonQueryFunction<false, false>, id: unknown) {
	await ensureReleaseSchema(sql);
	const releaseId = Math.max(0, Math.round(Number(id || 0)));
	if (!releaseId) return { ok: false, message: "Release not found." };
	await sql`
		update admin_release_note
		set status = 'published',
			published = true,
			published_at = coalesce(published_at, now()),
			release_date = coalesce(release_date, now()::date),
			archived_at = null,
			updated_at = now()
		where id = ${releaseId}
	`;
	return { ok: true, message: "Release published." };
}

export async function archiveRelease(sql: NeonQueryFunction<false, false>, id: unknown) {
	await ensureReleaseSchema(sql);
	const releaseId = Math.max(0, Math.round(Number(id || 0)));
	if (!releaseId) return { ok: false, message: "Release not found." };
	await sql`
		update admin_release_note
		set status = 'archived',
			published = false,
			archived_at = coalesce(archived_at, now()),
			updated_at = now()
		where id = ${releaseId}
	`;
	return { ok: true, message: "Release archived." };
}

function mapRelease(row: any): ReleaseRecord {
	return {
		id: Math.max(0, Number(row?.id || 0)),
		version: normalizeText(row?.version, 80),
		title: normalizeText(row?.title, 160),
		summary: normalizeText(row?.summary, 2000),
		releaseDate: normalizeText(row?.release_date, 40),
		published: row?.published === true,
		status: normalizeStatus(row?.status),
		highlights: normalizeText(row?.highlights, 5000),
		bugFixes: normalizeText(row?.bug_fixes, 5000),
		knownIssues: normalizeText(row?.known_issues, 5000),
		migrationNotes: normalizeText(row?.migration_notes, 5000),
		publishedAt: normalizeText(row?.published_at, 80),
		archivedAt: normalizeText(row?.archived_at, 80),
		createdAt: normalizeText(row?.created_at, 80),
		updatedAt: normalizeText(row?.updated_at, 80)
	};
}
