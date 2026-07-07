import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { loadGuidedTourStatus } from "../../../lib/guidedTour";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return Response.json({ authenticated: false, complete: false }, { status: 401 });
		}
		const sql = getNeonSql();
		const guidance = await loadGuidedTourStatus(sql, session.userId);
		const completed = guidance.settings.onboarding.completedActions;
		const complete = [
			"first-book-added",
			"first-progress-update",
			"first-journal-entry",
			"first-review",
			"first-follow",
			"explore-discover"
		].every((id) => completed.includes(id as typeof completed[number]));
		return Response.json({
			authenticated: true,
			complete,
			settings: guidance.settings,
			stats: guidance.stats,
			shelfEntries: guidance.stats.totalBooks,
			ratings: guidance.stats.ratedBooks,
			reviews: guidance.stats.reviews
		});
	} catch (error) {
		return Response.json({ error: "Unable to load onboarding status.", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
	}
};
