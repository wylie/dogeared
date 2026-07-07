import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import {
	addOnboardingAction,
	addOnboardingCelebration,
	addGuidedTourTip,
	DEFAULT_GUIDED_TOUR_SETTINGS,
	loadGuidedTourStatus,
	mergeOnboardingState,
	mergeGuidedTourSettings,
	ONBOARDING_ACTION_IDS,
	ONBOARDING_MILESTONE_IDS,
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
			actionId?: unknown;
			milestoneId?: unknown;
			readingGoal?: unknown;
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
			const currentOnboarding = normalizeGuidedTourSettings(settings).onboarding;
			settings = { ...DEFAULT_GUIDED_TOUR_SETTINGS, onboarding: currentOnboarding };
		} else if (action === "restart-onboarding") {
			settings = {
				...normalizeGuidedTourSettings(settings),
				onboarding: { ...DEFAULT_GUIDED_TOUR_SETTINGS.onboarding }
			};
		} else if (action === "complete-welcome") {
			settings = mergeOnboardingState(settings, { welcomeCompleted: true });
		} else if (action === "dismiss-checklist") {
			settings = mergeOnboardingState(settings, { checklistDismissed: true });
		} else if (action === "show-checklist") {
			settings = mergeOnboardingState(settings, { checklistDismissed: false });
		} else if (action === "dismiss-goal-prompt") {
			settings = mergeOnboardingState(settings, { goalPromptDismissed: true });
		} else if (action === "dismiss-recommendation-education") {
			settings = mergeOnboardingState(settings, { recommendationEducationDismissed: true });
		} else if (action === "mark-onboarding-action") {
			const actionId = String(body.actionId || "").trim();
			if (!(ONBOARDING_ACTION_IDS as readonly string[]).includes(actionId)) return json(400, { error: "Unknown onboarding action." });
			settings = addOnboardingAction(settings, actionId as (typeof ONBOARDING_ACTION_IDS)[number]);
		} else if (action === "celebrate-milestone") {
			const milestoneId = String(body.milestoneId || "").trim();
			if (!(ONBOARDING_MILESTONE_IDS as readonly string[]).includes(milestoneId)) return json(400, { error: "Unknown onboarding milestone." });
			settings = addOnboardingCelebration(settings, milestoneId as (typeof ONBOARDING_MILESTONE_IDS)[number]);
		} else if (action === "set-reading-goal") {
			const readingGoal = Math.max(0, Math.min(999, Math.floor(Number(body.readingGoal || 0) || 0)));
			if (readingGoal <= 0) return json(400, { error: "Choose a positive reading goal." });
			await sql`
				update app_user
				set profile_data = jsonb_set(
					coalesce(profile_data, '{}'::jsonb),
					'{readingGoal}',
					${JSON.stringify(String(readingGoal))}::jsonb,
					true
				)
				where id = ${session.userId}::uuid
			`;
			settings = mergeOnboardingState(settings, { goalPromptDismissed: true });
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
