import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { getNeonSql } from "../../../lib/neon";
import { loadReaderReadingSummary } from "../../../lib/readingSummary";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return new Response(JSON.stringify({ error: "You must be logged in to load reading summary." }), {
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store"
				}
			});
		}
		const summary = await loadReaderReadingSummary(getNeonSql(), session.userId);
		return new Response(JSON.stringify({ ok: true, summary }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store"
			}
		});
	} catch (error) {
		return new Response(JSON.stringify({
			error: "Failed to load reading summary.",
			detail: error instanceof Error ? error.message : "Unknown error"
		}), {
			status: 500,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store"
			}
		});
	}
};
