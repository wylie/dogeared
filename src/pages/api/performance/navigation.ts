import type { APIRoute } from "astro";
import { recordPerformanceEventSafe, type PerformanceSpanInput } from "../../../lib/performanceTelemetry";

export const prerender = false;

const ALLOWED_ROUTES = new Set([
	"/",
	"/search",
	"/reading-life",
	"/journal",
	"/discover",
	"/following",
	"/notifications",
	"/settings",
	"/books",
	"/authors",
	"/book",
	"/author/[slug]",
	"/profile/[username]",
	"/admin/[section]"
]);

function normalizeDuration(value: unknown, fallback = 0) {
	const duration = Math.round(Number(value || fallback));
	if (!Number.isFinite(duration)) return fallback;
	return Math.max(0, Math.min(60_000, duration));
}

function normalizeRoute(value: unknown) {
	const route = String(value || "").trim().split("?")[0].slice(0, 96);
	if (!route || !route.startsWith("/") || route.startsWith("//")) return "";
	if (ALLOWED_ROUTES.has(route)) return route;
	if (route.startsWith("/author/")) return "/author/[slug]";
	if (route.startsWith("/profile/")) return "/profile/[username]";
	if (route.startsWith("/admin/")) return "/admin/[section]";
	return "";
}

function normalizeSpans(value: unknown): PerformanceSpanInput[] {
	if (!Array.isArray(value)) return [];
	return value.slice(0, 4).map((span) => {
		const record = span && typeof span === "object" ? span as Record<string, unknown> : {};
		return {
			name: String(record.name || "").trim().slice(0, 80),
			durationMs: normalizeDuration(record.durationMs)
		};
	}).filter((span) => span.name && span.durationMs >= 0);
}

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const route = normalizeRoute(body.route);
	const totalMs = normalizeDuration(body.totalMs);
	if (!route || totalMs <= 0) {
		return Response.json({ ok: false, error: "Unsupported navigation telemetry." }, { status: 400 });
	}

	const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
		? body.metadata as Record<string, unknown>
		: {};
	const skeletonVisibleMs = normalizeDuration(metadata.skeletonVisibleMs);

	recordPerformanceEventSafe({
		operationName: "navigation.feedback",
		route,
		totalMs,
		success: body.success !== false,
		httpStatus: body.success === false ? 499 : 200,
		spans: normalizeSpans(body.spans),
		metadata: {
			feedbackShown: metadata.feedbackShown === true,
			skeletonVisibleMs,
			reason: String(metadata.reason || "").trim().slice(0, 40)
		}
	});

	return Response.json({ ok: true });
};
