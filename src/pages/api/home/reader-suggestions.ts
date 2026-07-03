import type { APIRoute } from "astro";
import { resolveUserBySession } from "../../../lib/auth";
import { resolvePublicReaderSuggestions } from "../../../lib/feed";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const session = await resolveUserBySession(request);
		if (!session?.userId) {
			return new Response(JSON.stringify({ readers: [] }), {
				status: 401,
				headers: { "Content-Type": "application/json" }
			});
		}
		const readers = await resolvePublicReaderSuggestions(session.userId, 6);
		return new Response(JSON.stringify({ readers }), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "private, max-age=30"
			}
		});
	} catch (error) {
		console.error("Reader suggestions API failed.", error);
		return new Response(JSON.stringify({ readers: [] }), {
			status: 500,
			headers: { "Content-Type": "application/json" }
		});
	}
};
