import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { recordProductAnalyticsEventSafe } from "../../../lib/productAnalytics";

export const prerender = false;

const allowedEvents = new Set([
	"page_view",
	"feature_view",
	"recommendation_impression",
	"recommendation_click",
	"recommendation_add_to_shelf"
]);

function normalizeText(value: unknown, max = 160) {
	return String(value || "").trim().slice(0, max);
}

function normalizeEventName(value: unknown) {
	return normalizeText(value, 80)
		.toLowerCase()
		.replace(/[^a-z0-9_:-]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function normalizeMetadata(source: unknown) {
	if (!source || typeof source !== "object" || Array.isArray(source)) return {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
		const safeKey = normalizeText(key, 64).replace(/[^a-zA-Z0-9_-]+/g, "");
		if (!safeKey) continue;
		if (typeof value === "number" || typeof value === "boolean") out[safeKey] = value;
		else {
			const text = normalizeText(value, 180);
			if (text) out[safeKey] = text;
		}
	}
	return out;
}

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const eventName = normalizeEventName(body.eventName || body.event);
	if (!allowedEvents.has(eventName)) {
		return Response.json({ ok: false, error: "Unsupported analytics event." }, { status: 400 });
	}

	const session = await resolveUserBySession(request).catch(() => null);
	const sql = getNeonSql();
	const ok = await recordProductAnalyticsEventSafe(sql, {
		eventName,
		eventGroup: normalizeText(body.eventGroup, 80),
		userId: session?.userId || "",
		route: normalizeText(body.route, 180),
		source: normalizeText(body.source, 120),
		subjectType: normalizeText(body.subjectType, 80),
		subjectId: normalizeText(body.subjectId, 120),
		query: normalizeText(body.query, 240),
		resultCount: Number(body.resultCount || 0) || 0,
		metadata: normalizeMetadata(body.metadata)
	});

	return Response.json({ ok });
};
