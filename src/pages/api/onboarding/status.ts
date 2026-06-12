import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return Response.json({ authenticated: false, complete: false }, { status: 401 });
		}
		const sql = getNeonSql();
		const rows = await sql<Array<{ shelf_entries: number; ratings: number; reviews: number }>>`
			select
				count(*)::int as shelf_entries,
				count(*) filter (where rating is not null)::int as ratings,
				count(*) filter (where char_length(trim(coalesce(finished_reflection, ''))) > 0)::int as reviews
			from user_book
			where user_id = ${session.userId}::uuid
		`;
		const status = {
			shelfEntries: Math.max(0, Number(rows[0]?.shelf_entries || 0)),
			ratings: Math.max(0, Number(rows[0]?.ratings || 0)),
			reviews: Math.max(0, Number(rows[0]?.reviews || 0))
		};
		return Response.json({ authenticated: true, complete: status.shelfEntries > 0 && status.ratings > 0 && status.reviews > 0, ...status });
	} catch (error) {
		return Response.json({ error: "Unable to load onboarding status.", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
	}
};
