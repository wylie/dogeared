import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import {
	addGuidedTourTip,
	DEFAULT_GUIDED_TOUR_SETTINGS,
	loadGuidedTourStatus,
	mergeGuidedTourSettings,
	normalizeGuidedTipId,
	normalizeGuidedTourSettings
} from "../../../lib/guidedTour";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function updateGuidedTourSettings(sql: ReturnType<typeof getNeonSql>, userId: string, settings: unknown) {
	const normalized = normalizeGuidedTourSettings(settings);
	await sql`
		update app_user
		set profile_data = jsonb_set(
			jsonb_set(coalesce(profile_data, '{}'::jsonb), '{settings}', coalesce(profile_data->'settings', '{}'::jsonb), true),
			'{settings,guidedTour}',
			${JSON.stringify(normalized)}::jsonb,
			true
		)
		where id = ${userId}::uuid
	`;
	return normalized;
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to load guidance." });
		const sql = getNeonSql();
		const status = await loadGuidedTourStatus(sql, session.userId);
		return json(200, { ok: true, ...status });
	} catch (error) {
		return json(500, {
			error: "Failed to load guidance.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};

export const POST: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to update guidance." });
		const body = await request.json().catch(() => ({})) as {
			action?: unknown;
			tipId?: unknown;
			showHelpfulTips?: unknown;
		};
		const action = String(body.action || "").trim();
		const sql = getNeonSql();
		const current = await loadGuidedTourStatus(sql, session.userId);
		let settings = current.settings;

		if (action === "dismiss" || action === "complete") {
			const tipId = normalizeGuidedTipId(body.tipId);
			if (!tipId) return json(400, { error: "Unknown guided tip." });
			settings = addGuidedTourTip(settings, tipId, action === "complete" ? "completedTips" : "dismissedTips");
		} else if (action === "set-enabled") {
			settings = mergeGuidedTourSettings(settings, { showHelpfulTips: body.showHelpfulTips !== false });
		} else if (action === "reset") {
			settings = { ...DEFAULT_GUIDED_TOUR_SETTINGS };
		} else {
			return json(400, { error: "Unknown guidance action." });
		}

		const saved = await updateGuidedTourSettings(sql, session.userId, settings);
		const refreshed = await loadGuidedTourStatus(sql, session.userId);
		return json(200, { ok: true, settings: saved, stats: refreshed.stats });
	} catch (error) {
		return json(500, {
			error: "Failed to update guidance.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
