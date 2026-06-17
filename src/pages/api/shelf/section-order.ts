import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { resolveUserBySession } from "../../../lib/auth";

export const prerender = false;

function json(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

export const PATCH: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to update profile section order." });
		const body = await request.json().catch(() => ({})) as { order?: unknown };
		const rawOrder = Array.isArray(body.order) ? body.order : [];
		const order = rawOrder
			.map((item) => String(item || "").trim())
			.filter(Boolean)
			.slice(0, 64);
		if (order.length === 0) return json(400, { error: "Profile section order is required." });
		const sql = getNeonSql();
		await sql`
			update app_user
			set profile_data = jsonb_set(
				coalesce(profile_data, '{}'::jsonb),
				'{settings,shelfSectionOrder}',
				${JSON.stringify(order)}::jsonb,
				true
			)
			where id = ${session.userId}::uuid
		`;
		return json(200, { ok: true, order });
	} catch (error) {
		return json(500, {
			error: "Failed to update profile section order.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
