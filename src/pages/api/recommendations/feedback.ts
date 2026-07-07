import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { addOnboardingAction, loadGuidedTourStatus, normalizeGuidedTourSettings } from "../../../lib/guidedTour";
import { getNeonSql } from "../../../lib/neon";
import { ensureRecommendationSchema } from "../../../lib/recommendations";
import { recordProductAnalyticsEventSafe } from "../../../lib/productAnalytics";

export const prerender = false;

function normalizeBookId(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.floor(parsed);
}

function normalizeFeedback(value: unknown) {
	const text = String(value || "").trim();
	return text === "interesting" || text === "not_interested" ? text : "";
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return Response.json({ error: "You must be logged in to save recommendation feedback." }, { status: 401 });
		const body = await request.json().catch(() => ({}));
		const bookId = normalizeBookId(body?.bookId);
		const feedback = normalizeFeedback(body?.feedback);
		const source = String(body?.source || "").trim().slice(0, 80);
		const reason = String(body?.reason || "").trim().slice(0, 280);
		if (!bookId || !feedback) return Response.json({ error: "Missing recommendation feedback." }, { status: 400 });

		const sql = getNeonSql();
		await ensureRecommendationSchema(sql);
		await sql`
			insert into user_recommendation_feedback (user_id, book_id, feedback, source, reason, created_at, updated_at)
			values (${session.userId}::uuid, ${bookId}, ${feedback}, ${source}, ${reason}, now(), now())
			on conflict (user_id, book_id) do update set
				feedback = excluded.feedback,
				source = excluded.source,
				reason = excluded.reason,
				updated_at = now()
		`;
		await recordProductAnalyticsEventSafe(sql, {
			eventName: "recommendation_feedback",
			eventGroup: "discovery",
			userId: session.userId,
			route: "/discover",
			source: feedback,
			subjectType: "book",
			subjectId: bookId,
			metadata: {
				recommendationSource: source,
				hasReason: !!reason
			}
		});
		const guidance = await loadGuidedTourStatus(sql, session.userId);
		const nextGuidance = normalizeGuidedTourSettings(addOnboardingAction(guidance.settings, "first-recommendation-interaction"));
		await sql`
			update app_user
			set profile_data = jsonb_set(
				jsonb_set(coalesce(profile_data, '{}'::jsonb), '{settings}', coalesce(profile_data->'settings', '{}'::jsonb), true),
				'{settings,guidedTour}',
				${JSON.stringify(nextGuidance)}::jsonb,
				true
			)
			where id = ${session.userId}::uuid
		`;
		return Response.json({ ok: true });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "Failed to save recommendation feedback." }, { status: 500 });
	}
};
