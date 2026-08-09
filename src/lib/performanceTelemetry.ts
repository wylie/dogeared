import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getNeonSql } from "./neon";
import { withRuntimeCache } from "./runtimeCache";
import { resolveAppVersion } from "./versionInfo";

type Sql = NeonQueryFunction<false, false>;

export type PerformanceSpanInput = {
	name: string;
	durationMs: number;
	startMs?: number;
	parentName?: string;
	status?: string;
};

export type PerformanceEventInput = {
	operationName: string;
	totalMs: number;
	success?: boolean;
	route?: string;
	httpStatus?: number;
	externalProvider?: string;
	spans?: Record<string, number> | PerformanceSpanInput[];
	releaseVersion?: string;
	environment?: string;
	metadata?: Record<string, unknown>;
};

export type PerformancePeriodKey = "1h" | "24h" | "7d" | "30d";

export type PerformanceSummary = {
	count: number;
	p50: number;
	p75: number;
	p95: number;
	p99: number;
	errorRate: number;
	slowCount: number;
};

export type PerformanceWorkflowSummary = PerformanceSummary & {
	key: string;
	label: string;
	trendPercent: number;
	targetMs: number;
	status: "Healthy" | "Needs attention" | "Slow";
};

export type PerformanceRouteSummary = PerformanceSummary & {
	operationName: string;
	route: string;
	trendPercent: number;
};

export type PerformanceBreakdownRow = {
	operationName: string;
	workflowLabel: string;
	spanName: string;
	count: number;
	avg: number;
	p50: number;
	p95: number;
	shareOfTotalP95: number;
};

export type ExternalServiceSummary = {
	provider: string;
	callCount: number;
	p50: number;
	p95: number;
	failureRate: number;
	timeoutCount: number;
};

export type SlowOperationRow = {
	id: number;
	createdAt: string;
	operationName: string;
	route: string;
	totalMs: number;
	success: boolean;
	httpStatus: number;
	releaseVersion: string;
	dominantSpan: string;
	dominantSpanMs: number;
	timeoutDetail: string;
	retryCount: number;
};

export type ReleaseComparisonRow = {
	releaseVersion: string;
	operationName: string;
	count: number;
	p95: number;
	previousReleaseP95: number;
	changePercent: number;
};

export type PerformanceOperationSpan = {
	name: string;
	durationMs: number;
	startMs: number | null;
	parentName: string;
	status: "OK" | "Needs attention" | "Slow";
	shareOfTotal: number;
};

export type PerformanceOperationSpanSummary = {
	name: string;
	durationMs: number;
	shareOfTotal: number;
	calls: number;
	status: "OK" | "Needs attention" | "Slow";
	parentName: string;
};

export type PerformanceMetadataItem = {
	label: string;
	value: string;
};

export type PerformanceOperationDetail = {
	id: number;
	createdAt: string;
	operationName: string;
	route: string;
	totalMs: number;
	success: boolean;
	httpStatus: number;
	releaseVersion: string;
	environment: string;
	externalProvider: string;
	dominantSpan: PerformanceOperationSpanSummary | null;
	timeoutDetail: string;
	retryCount: number;
	hasWaterfallOffsets: boolean;
	spans: PerformanceOperationSpan[];
	spanSummaries: PerformanceOperationSpanSummary[];
	metadataItems: PerformanceMetadataItem[];
};

export type AdminPerformanceAnalytics = {
	generatedAt: string;
	period: PerformancePeriodKey;
	periodLabel: string;
	summary: PerformanceSummary;
	workflows: PerformanceWorkflowSummary[];
	routes: PerformanceRouteSummary[];
	breakdowns: PerformanceBreakdownRow[];
	externalServices: ExternalServiceSummary[];
	slowOperations: SlowOperationRow[];
	releases: ReleaseComparisonRow[];
	targets: Array<{ operationName: string; label: string; p95TargetMs: number; slowMs: number }>;
};

export const PERFORMANCE_PERIODS: Record<PerformancePeriodKey, { label: string; hours: number }> = {
	"1h": { label: "Last hour", hours: 1 },
	"24h": { label: "Last 24 hours", hours: 24 },
	"7d": { label: "Last 7 days", hours: 24 * 7 },
	"30d": { label: "Last 30 days", hours: 24 * 30 }
};

const CORE_WORKFLOWS = [
	{ key: "search", label: "Search", operations: ["search.books"], targetMs: 1200, slowMs: 2500 },
	{ key: "progress", label: "Save Progress", operations: ["progress.save"], targetMs: 750, slowMs: 1500 },
	{ key: "shelf", label: "Shelf Mutations", operations: ["shelf.mutate"], targetMs: 1200, slowMs: 2500 },
	{ key: "page", label: "Page Rendering", operations: ["page.profile", "page.reading-life", "page.search", "page.book-detail", "page.author-detail", "page.discover"], targetMs: 1600, slowMs: 3000 },
	{ key: "navigation", label: "Navigation Feedback", operations: ["navigation.feedback"], targetMs: 120, slowMs: 300 },
	{ key: "external", label: "External Book APIs", operations: ["external.google-books", "external.open-library"], targetMs: 1200, slowMs: 2500 }
];

const OPERATION_LABELS = new Map<string, string>([
	["search.books", "Book Search"],
	["progress.save", "Save Progress"],
	["shelf.mutate", "Shelf Mutation"],
	["page.profile", "Profile"],
	["page.reading-life", "My Reading Life"],
	["page.search", "Search Page"],
	["page.book-detail", "Book Detail"],
	["page.author-detail", "Author Detail"],
	["page.discover", "Discover"],
	["navigation.feedback", "Navigation Feedback"],
	["external.google-books", "Google Books"],
	["external.open-library", "Open Library"]
]);

const SLOW_OPERATION_DEFAULT_MS = 2500;
const RAW_RETENTION_DAYS = 45;
let schemaReady: Promise<void> | null = null;

function normalizeText(value: unknown, max = 160) {
	return String(value || "").trim().slice(0, max);
}

function normalizeOperationName(value: unknown) {
	return normalizeText(value, 96)
		.toLowerCase()
		.replace(/[^a-z0-9_.:-]+/g, ".")
		.replace(/^[._:-]+|[._:-]+$/g, "");
}

function normalizeRoute(value: unknown) {
	const route = normalizeText(value, 180);
	if (!route || !route.startsWith("/") || route.startsWith("//")) return "";
	return route.replace(/\?.*$/, "");
}

function normalizeDuration(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.round(parsed * 10) / 10);
}

function normalizeOptionalDuration(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return Math.round(parsed * 10) / 10;
}

function normalizeHttpStatus(value: unknown) {
	const parsed = Math.floor(Number(value || 0));
	if (!Number.isFinite(parsed)) return 0;
	return parsed >= 100 && parsed <= 599 ? parsed : 0;
}

function normalizeEnvironment(value: unknown) {
	return normalizeText(value || import.meta.env.VERCEL_ENV || import.meta.env.MODE || "development", 40)
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-");
}

function normalizeMetadata(source: Record<string, unknown> | undefined) {
	const out: Record<string, unknown> = {};
	for (const [rawKey, rawValue] of Object.entries(source || {})) {
		const key = normalizeText(rawKey, 64).replace(/[^a-zA-Z0-9_-]+/g, "");
		if (!key) continue;
		if (typeof rawValue === "number") {
			const value = Number(rawValue);
			if (Number.isFinite(value)) out[key] = Math.round(value * 10) / 10;
		} else if (typeof rawValue === "boolean") {
			out[key] = rawValue;
		} else {
			const value = normalizeText(rawValue, 80);
			if (value && !/@/.test(value)) out[key] = value;
		}
	}
	return out;
}

function normalizeSpanStatus(value: unknown, durationMs: number, totalMs = 0): PerformanceOperationSpan["status"] {
	const explicit = normalizeText(value, 40).toLowerCase();
	if (explicit === "slow") return "Slow";
	if (explicit === "needs attention" || explicit === "needs-attention") return "Needs attention";
	if (explicit === "ok" || explicit === "healthy") return "OK";
	if (totalMs > 0 && durationMs >= totalMs * 0.5 && durationMs >= 500) return "Slow";
	if (durationMs >= 1000) return "Needs attention";
	return "OK";
}

function normalizeSpans(input: PerformanceEventInput["spans"]) {
	const spans = Array.isArray(input)
		? input.map((span) => {
			const name = normalizeOperationName(span.name).replace(/[.:_-]+/g, " ");
			const durationMs = normalizeDuration(span.durationMs);
			const startMs = normalizeOptionalDuration(span.startMs);
			const parentName = normalizeOperationName(span.parentName).replace(/[.:_-]+/g, " ");
			const status = normalizeSpanStatus(span.status, durationMs);
			return {
				name,
				durationMs,
				...(startMs === null ? {} : { startMs }),
				...(parentName ? { parentName } : {}),
				status
			};
		})
		: Object.entries(input || {}).map(([name, cumulativeMs]) => ({
			name: normalizeOperationName(name).replace(/[.:_-]+/g, " "),
			cumulativeMs: normalizeDuration(cumulativeMs)
		}))
			.sort((a, b) => a.cumulativeMs - b.cumulativeMs)
			.map((span, index, list) => ({
				name: span.name,
				startMs: normalizeDuration(list[index - 1]?.cumulativeMs || 0),
				durationMs: Math.max(0, normalizeDuration(span.cumulativeMs - (list[index - 1]?.cumulativeMs || 0))),
				status: normalizeSpanStatus("", Math.max(0, normalizeDuration(span.cumulativeMs - (list[index - 1]?.cumulativeMs || 0))))
			}));
	return spans
		.filter((span) => span.name && span.durationMs >= 0)
		.slice(0, 24);
}

function toNumber(value: unknown) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toPercent(value: unknown) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 10) / 10) : 0;
}

function performanceSampleRate() {
	const parsed = Number(import.meta.env.PERFORMANCE_TELEMETRY_SAMPLE_RATE || "1");
	if (!Number.isFinite(parsed)) return 1;
	return Math.max(0, Math.min(1, parsed));
}

function shouldRecord(input: {
	operationName: string;
	totalMs: number;
	success: boolean;
	httpStatus: number;
}) {
	if (!input.success) return true;
	if (input.httpStatus >= 500) return true;
	if (input.totalMs >= slowThresholdForOperation(input.operationName)) return true;
	return Math.random() < performanceSampleRate();
}

function slowThresholdForOperation(operationName: string) {
	const workflow = CORE_WORKFLOWS.find((item) => item.operations.includes(operationName));
	return workflow?.slowMs || SLOW_OPERATION_DEFAULT_MS;
}

function statusForWorkflow(p95: number, targetMs: number) {
	if (p95 <= 0) return "Healthy" as const;
	if (p95 <= targetMs) return "Healthy" as const;
	if (p95 <= targetMs * 1.5) return "Needs attention" as const;
	return "Slow" as const;
}

function trendPercent(current: number, previous: number) {
	if (current <= 0 || previous <= 0) return 0;
	return Math.round(((previous - current) / previous) * 1000) / 10;
}

function operationLabel(operationName: string) {
	return OPERATION_LABELS.get(operationName) || operationName.replace(/[._-]+/g, " ");
}

function dominantSpan(spans: unknown): { name: string; durationMs: number } {
	const list = Array.isArray(spans) ? spans as Array<Record<string, unknown>> : [];
	return list.reduce((best, span) => {
		const durationMs = toNumber(span.durationMs);
		if (durationMs <= best.durationMs) return best;
		return { name: normalizeText(span.name, 80), durationMs };
	}, { name: "", durationMs: 0 });
}

function normalizeStoredSpans(spans: unknown, totalMs: number): PerformanceOperationSpan[] {
	const list = Array.isArray(spans) ? spans as Array<Record<string, unknown>> : [];
	return list
		.map((span) => {
			const name = normalizeText(span.name, 80);
			const durationMs = normalizeDuration(span.durationMs);
			const startMs = normalizeOptionalDuration(span.startMs);
			const parentName = normalizeText(span.parentName, 80);
			return {
				name,
				durationMs,
				startMs,
				parentName,
				status: normalizeSpanStatus(span.status, durationMs, totalMs),
				shareOfTotal: totalMs > 0 ? toPercent((durationMs / totalMs) * 100) : 0
			};
		})
		.filter((span) => span.name && span.durationMs >= 0)
		.slice(0, 48);
}

function summarizeStoredSpans(spans: PerformanceOperationSpan[]): PerformanceOperationSpanSummary[] {
	const byName = new Map<string, PerformanceOperationSpanSummary>();
	for (const span of spans) {
		const key = `${span.parentName}::${span.name}`;
		const existing = byName.get(key);
		if (existing) {
			existing.durationMs = normalizeDuration(existing.durationMs + span.durationMs);
			existing.shareOfTotal = normalizeDuration(existing.shareOfTotal + span.shareOfTotal);
			existing.calls += 1;
			if (span.status === "Slow" || existing.status === "Slow") existing.status = "Slow";
			else if (span.status === "Needs attention" || existing.status === "Needs attention") existing.status = "Needs attention";
			continue;
		}
		byName.set(key, {
			name: span.name,
			durationMs: span.durationMs,
			shareOfTotal: span.shareOfTotal,
			calls: 1,
			status: span.status,
			parentName: span.parentName
		});
	}
	return Array.from(byName.values()).sort((a, b) => b.durationMs - a.durationMs || a.name.localeCompare(b.name));
}

function safePerformanceMetadataItems(metadata: unknown): PerformanceMetadataItem[] {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
	const safeKeys = new Set([
		"providerTimeoutCount",
		"providerTimeouts",
		"localTimeoutCount",
		"canonicalTimeoutCount",
		"canonicalCandidateCount",
		"canonicalResolvedCount",
		"canonicalDbQueryCount",
		"canonicalDogEaredCandidateCount",
		"canonicalComparisonCount",
		"canonicalCacheHits",
		"canonicalCacheMisses",
		"canonicalCandidateSetTruncated",
		"retryCount",
		"timeout",
		"clientAborted",
		"hasExistingCatalogBook",
		"databaseQueryCount",
		"queryCount",
		"cacheHits",
		"cacheMisses"
	]);
	const items: PerformanceMetadataItem[] = [];
	for (const [rawKey, rawValue] of Object.entries(metadata as Record<string, unknown>)) {
		const key = normalizeText(rawKey, 64).replace(/[^a-zA-Z0-9_-]+/g, "");
		const lower = key.toLowerCase();
		const countLike = /(?:count|counts|queries|comparisons|candidates|resolved|timeouts|retries|hits|misses)$/.test(lower);
		if (!safeKeys.has(key) && !countLike) continue;
		if (typeof rawValue === "number") {
			items.push({ label: key, value: normalizeDuration(rawValue).toLocaleString() });
		} else if (typeof rawValue === "boolean") {
			items.push({ label: key, value: rawValue ? "true" : "false" });
		} else {
			const value = normalizeText(rawValue, 80);
			if (value && !/@/.test(value) && !value.startsWith("/") && !/[{}[\]]/.test(value)) {
				items.push({ label: key, value });
			}
		}
	}
	return items.slice(0, 18);
}

function timeoutDetailFromMetadata(metadata: Record<string, unknown>) {
	const providerTimeouts = normalizeText(metadata.providerTimeouts, 80);
	const providerTimeoutCount = toNumber(metadata.providerTimeoutCount);
	const localTimeoutCount = toNumber(metadata.localTimeoutCount);
	const canonicalTimeoutCount = toNumber(metadata.canonicalTimeoutCount);
	return providerTimeouts
		? `Provider timeout: ${providerTimeouts}`
		: (canonicalTimeoutCount > 0
			? `Canonical timeout: ${canonicalTimeoutCount}`
			: (localTimeoutCount > 0
				? `Local timeout: ${localTimeoutCount}`
				: (providerTimeoutCount > 0 ? `Provider timeout: ${providerTimeoutCount}` : "")));
}

export function normalizePerformancePeriod(value: unknown): PerformancePeriodKey {
	const key = normalizeText(value, 10) as PerformancePeriodKey;
	return key in PERFORMANCE_PERIODS ? key : "24h";
}

export async function ensurePerformanceTelemetrySchema(sql: Sql) {
	if (!schemaReady) {
		schemaReady = (async () => {
			await sql`
				create table if not exists performance_event (
					id bigserial primary key,
					operation_name text not null,
					route text not null default '',
					total_ms numeric not null default 0,
					success boolean not null default true,
					http_status int not null default 0,
					release_version text not null default '',
					environment text not null default '',
					external_provider text not null default '',
					spans jsonb not null default '[]'::jsonb,
					metadata jsonb not null default '{}'::jsonb,
					created_at timestamptz not null default now()
				)
			`;
			await Promise.all([
				sql`create index if not exists idx_performance_event_created on performance_event(created_at desc)`,
				sql`create index if not exists idx_performance_event_operation_created on performance_event(operation_name, created_at desc)`,
				sql`create index if not exists idx_performance_event_route_created on performance_event(route, created_at desc)`,
				sql`create index if not exists idx_performance_event_release_created on performance_event(release_version, created_at desc)`,
				sql`create index if not exists idx_performance_event_provider_created on performance_event(external_provider, created_at desc)`,
				sql`create index if not exists idx_performance_event_slow_created on performance_event(created_at desc, total_ms desc)`
			]);
		})();
	}
	try {
		await schemaReady;
	} catch (error) {
		schemaReady = null;
		throw error;
	}
}

export async function recordPerformanceEvent(sql: Sql, input: PerformanceEventInput) {
	const operationName = normalizeOperationName(input.operationName);
	const totalMs = normalizeDuration(input.totalMs);
	const success = input.success !== false;
	const httpStatus = normalizeHttpStatus(input.httpStatus);
	if (!operationName || totalMs <= 0) return false;
	if (!shouldRecord({ operationName, totalMs, success, httpStatus })) return false;
	await ensurePerformanceTelemetrySchema(sql);
	await sql`
		insert into performance_event (
			operation_name,
			route,
			total_ms,
			success,
			http_status,
			release_version,
			environment,
			external_provider,
			spans,
			metadata
		)
		values (
			${operationName},
			${normalizeRoute(input.route)},
			${totalMs},
			${success},
			${httpStatus},
			${normalizeText(input.releaseVersion || resolveAppVersion(), 80)},
			${normalizeEnvironment(input.environment)},
			${normalizeOperationName(input.externalProvider).replace(/[._:-]+/g, "-")},
			${JSON.stringify(normalizeSpans(input.spans))}::jsonb,
			${JSON.stringify(normalizeMetadata(input.metadata))}::jsonb
		)
	`;
	return true;
}

export function recordPerformanceEventSafe(sqlOrInput: Sql | PerformanceEventInput, maybeInput?: PerformanceEventInput) {
	let sql: Sql;
	let input: PerformanceEventInput;
	try {
		sql = maybeInput ? sqlOrInput as Sql : getNeonSql();
		input = maybeInput || sqlOrInput as PerformanceEventInput;
	} catch (error) {
		if (import.meta.env.DEV) {
			console.warn("[performance.telemetry.failed]", error instanceof Error ? error.message : error);
		}
		return;
	}
	void recordPerformanceEvent(sql, input).catch((error) => {
		if (import.meta.env.DEV) {
			console.warn("[performance.telemetry.failed]", error instanceof Error ? error.message : error);
		}
	});
}

export async function prunePerformanceTelemetry(sql: Sql, retentionDays = RAW_RETENTION_DAYS) {
	await ensurePerformanceTelemetrySchema(sql);
	await sql`
		delete from performance_event
		where created_at < now() - (${Math.max(1, Math.floor(retentionDays))} * interval '1 day')
	`;
}

function emptySummary(): PerformanceSummary {
	return { count: 0, p50: 0, p75: 0, p95: 0, p99: 0, errorRate: 0, slowCount: 0 };
}

export function emptyAdminPerformanceAnalytics(period: PerformancePeriodKey = "24h"): AdminPerformanceAnalytics {
	return {
		generatedAt: new Date().toISOString(),
		period,
		periodLabel: PERFORMANCE_PERIODS[period].label,
		summary: emptySummary(),
		workflows: [],
		routes: [],
		breakdowns: [],
		externalServices: [],
		slowOperations: [],
		releases: [],
		targets: CORE_WORKFLOWS.map((workflow) => ({
			operationName: workflow.key,
			label: workflow.label,
			p95TargetMs: workflow.targetMs,
			slowMs: workflow.slowMs
		}))
	};
}

async function loadAdminPerformanceAnalyticsUncached(
	sql: Sql,
	period: PerformancePeriodKey,
	sort: string,
	slowPage: number
): Promise<AdminPerformanceAnalytics> {
	await ensurePerformanceTelemetrySchema(sql);
	const hours = PERFORMANCE_PERIODS[period].hours;
	const slowOffset = Math.max(0, (slowPage - 1) * 25);
	const slowThreshold = SLOW_OPERATION_DEFAULT_MS;
	const sortKey = sort === "traffic" || sort === "errors" ? sort : "p95";

	const summaryRows = await sql<Array<{ count: number; p50: number | null; p75: number | null; p95: number | null; p99: number | null; errors: number; slow_count: number }>>`
		select
			count(*)::int as count,
			percentile_cont(0.5) within group (order by total_ms)::numeric as p50,
			percentile_cont(0.75) within group (order by total_ms)::numeric as p75,
			percentile_cont(0.95) within group (order by total_ms)::numeric as p95,
			percentile_cont(0.99) within group (order by total_ms)::numeric as p99,
			count(*) filter (where not success or http_status >= 500)::int as errors,
			count(*) filter (where total_ms >= ${slowThreshold})::int as slow_count
		from performance_event
		where created_at >= now() - (${hours} * interval '1 hour')
	`;
	const summaryRow = summaryRows[0];
	const summaryCount = toNumber(summaryRow?.count);
	const summary: PerformanceSummary = {
		count: summaryCount,
		p50: toNumber(summaryRow?.p50),
		p75: toNumber(summaryRow?.p75),
		p95: toNumber(summaryRow?.p95),
		p99: toNumber(summaryRow?.p99),
		errorRate: summaryCount > 0 ? toPercent((toNumber(summaryRow?.errors) / summaryCount) * 100) : 0,
		slowCount: toNumber(summaryRow?.slow_count)
	};

	const workflowRows = await sql<Array<{
		workflow_key: string;
		count: number;
		p50: number | null;
		p75: number | null;
		p95: number | null;
		p99: number | null;
		errors: number;
		slow_count: number;
		prev_p95: number | null;
	}>>`
		with mapped as (
			select
				case
					when operation_name = 'search.books' then 'search'
					when operation_name = 'progress.save' then 'progress'
					when operation_name = 'shelf.mutate' then 'shelf'
					when operation_name like 'page.%' then 'page'
					when operation_name = 'navigation.feedback' then 'navigation'
					when operation_name like 'external.%' then 'external'
					else 'other'
				end as workflow_key,
				*
			from performance_event
			where created_at >= now() - (${hours} * interval '1 hour')
		),
		previous as (
			select
				case
					when operation_name = 'search.books' then 'search'
					when operation_name = 'progress.save' then 'progress'
					when operation_name = 'shelf.mutate' then 'shelf'
					when operation_name like 'page.%' then 'page'
					when operation_name = 'navigation.feedback' then 'navigation'
					when operation_name like 'external.%' then 'external'
					else 'other'
				end as workflow_key,
				percentile_cont(0.95) within group (order by total_ms)::numeric as prev_p95
			from performance_event
			where created_at >= now() - (${hours * 2} * interval '1 hour')
				and created_at < now() - (${hours} * interval '1 hour')
			group by 1
		)
		select
			m.workflow_key,
			count(*)::int as count,
			percentile_cont(0.5) within group (order by m.total_ms)::numeric as p50,
			percentile_cont(0.75) within group (order by m.total_ms)::numeric as p75,
			percentile_cont(0.95) within group (order by m.total_ms)::numeric as p95,
			percentile_cont(0.99) within group (order by m.total_ms)::numeric as p99,
			count(*) filter (where not m.success or m.http_status >= 500)::int as errors,
			count(*) filter (where m.total_ms >= ${slowThreshold})::int as slow_count,
			coalesce(p.prev_p95, 0)::numeric as prev_p95
		from mapped m
		left join previous p on p.workflow_key = m.workflow_key
		where m.workflow_key <> 'other'
		group by m.workflow_key, p.prev_p95
	`;
	const workflows = CORE_WORKFLOWS.map((workflow) => {
		const row = workflowRows.find((item) => item.workflow_key === workflow.key);
		const count = toNumber(row?.count);
		const p95 = toNumber(row?.p95);
		return {
			key: workflow.key,
			label: workflow.label,
			count,
			p50: toNumber(row?.p50),
			p75: toNumber(row?.p75),
			p95,
			p99: toNumber(row?.p99),
			errorRate: count > 0 ? toPercent((toNumber(row?.errors) / count) * 100) : 0,
			slowCount: toNumber(row?.slow_count),
			trendPercent: trendPercent(p95, toNumber(row?.prev_p95)),
			targetMs: workflow.targetMs,
			status: statusForWorkflow(p95, workflow.targetMs)
		};
	});

	const routeRows = await sql<Array<{
		operation_name: string;
		route: string;
		requests: number;
		p50: number | null;
		p95: number | null;
		p99: number | null;
		errors: number;
		error_rate: number | null;
		slow_count: number;
		prev_p95: number | null;
	}>>`
		with current_routes as (
			select
				operation_name,
				coalesce(nullif(route, ''), operation_name) as route,
				count(*)::int as requests,
				percentile_cont(0.5) within group (order by total_ms)::numeric as p50,
				percentile_cont(0.95) within group (order by total_ms)::numeric as p95,
				percentile_cont(0.99) within group (order by total_ms)::numeric as p99,
				count(*) filter (where not success or http_status >= 500)::int as errors,
				(count(*) filter (where not success or http_status >= 500)::numeric / greatest(count(*), 1)) * 100 as error_rate,
				count(*) filter (where total_ms >= ${slowThreshold})::int as slow_count
			from performance_event
			where created_at >= now() - (${hours} * interval '1 hour')
			group by operation_name, coalesce(nullif(route, ''), operation_name)
		),
		previous_routes as (
			select
				operation_name,
				coalesce(nullif(route, ''), operation_name) as route,
				percentile_cont(0.95) within group (order by total_ms)::numeric as prev_p95
			from performance_event
			where created_at >= now() - (${hours * 2} * interval '1 hour')
				and created_at < now() - (${hours} * interval '1 hour')
			group by operation_name, coalesce(nullif(route, ''), operation_name)
		)
		select c.*, coalesce(p.prev_p95, 0)::numeric as prev_p95
		from current_routes c
		left join previous_routes p on p.operation_name = c.operation_name and p.route = c.route
		order by
			case when ${sortKey} = 'traffic' then requests end desc nulls last,
			case when ${sortKey} = 'errors' then error_rate end desc nulls last,
			case when ${sortKey} = 'p95' then p95 end desc nulls last,
			requests desc,
			p95 desc
		limit 50
	`;
	const routes = routeRows.map((row) => ({
		operationName: row.operation_name,
		route: row.route,
		count: toNumber(row.requests),
		p50: toNumber(row.p50),
		p95: toNumber(row.p95),
		p99: toNumber(row.p99),
		errorRate: toPercent(row.error_rate),
		slowCount: toNumber(row.slow_count),
		trendPercent: trendPercent(toNumber(row.p95), toNumber(row.prev_p95))
	}));

	const breakdownRows = await sql<Array<{
		operation_name: string;
		span_name: string;
		count: number;
		avg_ms: number | null;
		p50_ms: number | null;
		p95_ms: number | null;
		total_p95: number | null;
	}>>`
		with event_spans as (
			select
				pe.operation_name,
				pe.total_ms,
				span->>'name' as span_name,
				nullif(span->>'durationMs', '')::numeric as span_ms
			from performance_event pe
			cross join lateral jsonb_array_elements(pe.spans) span
			where pe.created_at >= now() - (${hours} * interval '1 hour')
				and jsonb_typeof(pe.spans) = 'array'
		),
		total_p95 as (
			select operation_name, percentile_cont(0.95) within group (order by total_ms)::numeric as total_p95
			from performance_event
			where created_at >= now() - (${hours} * interval '1 hour')
			group by operation_name
		)
		select
			es.operation_name,
			es.span_name,
			count(*)::int as count,
			avg(es.span_ms)::numeric as avg_ms,
			percentile_cont(0.5) within group (order by es.span_ms)::numeric as p50_ms,
			percentile_cont(0.95) within group (order by es.span_ms)::numeric as p95_ms,
			max(tp.total_p95)::numeric as total_p95
		from event_spans es
		join total_p95 tp on tp.operation_name = es.operation_name
		where es.span_name <> ''
		group by es.operation_name, es.span_name
		order by es.operation_name asc, p95_ms desc
		limit 80
	`;
	const breakdowns = breakdownRows.map((row) => {
		const p95 = toNumber(row.p95_ms);
		const totalP95 = toNumber(row.total_p95);
		return {
			operationName: row.operation_name,
			workflowLabel: operationLabel(row.operation_name),
			spanName: row.span_name,
			count: toNumber(row.count),
			avg: toNumber(row.avg_ms),
			p50: toNumber(row.p50_ms),
			p95,
			shareOfTotalP95: totalP95 > 0 ? toPercent((p95 / totalP95) * 100) : 0
		};
	});

	const externalRows = await sql<Array<{
		provider: string;
		call_count: number;
		p50: number | null;
		p95: number | null;
		failures: number;
		timeouts: number;
	}>>`
		select
			coalesce(nullif(external_provider, ''), replace(operation_name, 'external.', '')) as provider,
			count(*)::int as call_count,
			percentile_cont(0.5) within group (order by total_ms)::numeric as p50,
			percentile_cont(0.95) within group (order by total_ms)::numeric as p95,
			count(*) filter (where not success or http_status >= 500)::int as failures,
			count(*) filter (where metadata->>'timeout' = 'true' or http_status = 408)::int as timeouts
		from performance_event
		where created_at >= now() - (${hours} * interval '1 hour')
			and (operation_name like 'external.%' or external_provider <> '')
		group by coalesce(nullif(external_provider, ''), replace(operation_name, 'external.', ''))
		order by p95 desc nulls last, call_count desc
	`;
	const externalServices = externalRows.map((row) => ({
		provider: row.provider,
		callCount: toNumber(row.call_count),
		p50: toNumber(row.p50),
		p95: toNumber(row.p95),
		failureRate: toNumber(row.call_count) > 0 ? toPercent((toNumber(row.failures) / toNumber(row.call_count)) * 100) : 0,
		timeoutCount: toNumber(row.timeouts)
	}));

	const slowRows = await sql<Array<{
		id: number;
		created_at: string;
		operation_name: string;
		route: string;
		total_ms: number;
		success: boolean;
		http_status: number;
		release_version: string;
		spans: unknown;
		metadata: unknown;
	}>>`
		select
			id,
			created_at::text as created_at,
			operation_name,
			route,
			total_ms::numeric as total_ms,
			success,
			http_status,
			release_version,
			spans,
			metadata
		from performance_event
		where created_at >= now() - (${hours} * interval '1 hour')
			and (total_ms >= ${slowThreshold} or not success or http_status >= 500)
		order by created_at desc, total_ms desc
		limit 25
		offset ${slowOffset}
	`;
	const slowOperations = slowRows.map((row) => {
		const span = dominantSpan(row.spans);
		const metadata = row.metadata && typeof row.metadata === "object"
			? row.metadata as Record<string, unknown>
			: {};
		return {
			id: Number(row.id || 0),
			createdAt: row.created_at,
			operationName: row.operation_name,
			route: row.route,
			totalMs: toNumber(row.total_ms),
			success: row.success !== false,
			httpStatus: normalizeHttpStatus(row.http_status),
			releaseVersion: normalizeText(row.release_version, 80),
			dominantSpan: span.name,
			dominantSpanMs: span.durationMs,
			timeoutDetail: timeoutDetailFromMetadata(metadata),
			retryCount: toNumber(metadata.retryCount)
		};
	});

	const releaseRows = await sql<Array<{
		release_version: string;
		operation_name: string;
		count: number;
		p95: number | null;
	}>>`
		select
			coalesce(nullif(release_version, ''), 'unknown') as release_version,
			operation_name,
			count(*)::int as count,
			percentile_cont(0.95) within group (order by total_ms)::numeric as p95
		from performance_event
		where created_at >= now() - interval '30 days'
			and operation_name in ('search.books', 'progress.save', 'shelf.mutate', 'page.profile', 'page.reading-life', 'page.search', 'page.book-detail', 'page.author-detail', 'page.discover', 'navigation.feedback')
		group by coalesce(nullif(release_version, ''), 'unknown'), operation_name
		order by max(created_at) desc, release_version desc, operation_name asc
		limit 60
	`;
	const releases = releaseRows.map((row, index, list) => {
		const previous = list.slice(index + 1).find((item) => item.operation_name === row.operation_name);
		const p95 = toNumber(row.p95);
		const previousP95 = toNumber(previous?.p95);
		return {
			releaseVersion: row.release_version,
			operationName: row.operation_name,
			count: toNumber(row.count),
			p95,
			previousReleaseP95: previousP95,
			changePercent: trendPercent(p95, previousP95)
		};
	});

	return {
		generatedAt: new Date().toISOString(),
		period,
		periodLabel: PERFORMANCE_PERIODS[period].label,
		summary,
		workflows,
		routes,
		breakdowns,
		externalServices,
		slowOperations,
		releases,
		targets: CORE_WORKFLOWS.map((workflow) => ({
			operationName: workflow.key,
			label: workflow.label,
			p95TargetMs: workflow.targetMs,
			slowMs: workflow.slowMs
		}))
	};
}

export async function loadAdminPerformanceAnalytics(
	sql: Sql,
	options: { period?: unknown; sort?: unknown; slowPage?: unknown } = {}
) {
	const period = normalizePerformancePeriod(options.period);
	const sort = normalizeText(options.sort, 20);
	const slowPage = Math.max(1, Number(options.slowPage || 1) || 1);
	return withRuntimeCache(
		`admin:performance:v1:${period}:${sort}:${slowPage}`,
		30_000,
		() => loadAdminPerformanceAnalyticsUncached(sql, period, sort, slowPage)
	);
}

export async function loadPerformanceOperationDetail(
	sql: Sql,
	id: unknown
): Promise<PerformanceOperationDetail | null> {
	const eventId = Math.floor(Number(id || 0));
	if (!Number.isFinite(eventId) || eventId <= 0) return null;
	await ensurePerformanceTelemetrySchema(sql);
	const rows = await sql<Array<{
		id: number;
		created_at: string;
		operation_name: string;
		route: string;
		total_ms: number;
		success: boolean;
		http_status: number;
		release_version: string;
		environment: string;
		external_provider: string;
		spans: unknown;
		metadata: unknown;
	}>>`
		select
			id,
			created_at::text as created_at,
			operation_name,
			route,
			total_ms::numeric as total_ms,
			success,
			http_status,
			release_version,
			environment,
			external_provider,
			spans,
			metadata
		from performance_event
		where id = ${eventId}
		limit 1
	`;
	const row = rows[0];
	if (!row) return null;
	const totalMs = toNumber(row.total_ms);
	const metadata = row.metadata && typeof row.metadata === "object"
		? row.metadata as Record<string, unknown>
		: {};
	const spans = normalizeStoredSpans(row.spans, totalMs);
	const spanSummaries = summarizeStoredSpans(spans);
	const dominant = spanSummaries[0] || null;
	return {
		id: Number(row.id || 0),
		createdAt: row.created_at,
		operationName: normalizeText(row.operation_name, 96),
		route: normalizeRoute(row.route) || normalizeText(row.route, 120),
		totalMs,
		success: row.success !== false,
		httpStatus: normalizeHttpStatus(row.http_status),
		releaseVersion: normalizeText(row.release_version, 80),
		environment: normalizeText(row.environment, 40),
		externalProvider: normalizeText(row.external_provider, 80),
		dominantSpan: dominant,
		timeoutDetail: timeoutDetailFromMetadata(metadata),
		retryCount: toNumber(metadata.retryCount),
		hasWaterfallOffsets: spans.some((span) => span.startMs !== null),
		spans,
		spanSummaries,
		metadataItems: safePerformanceMetadataItems(metadata)
	};
}
