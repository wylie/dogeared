import type { APIRoute } from "astro";
import { createPublicCacheControl } from "../../../lib/runtimeCache";
import { isGoogleBooksCoverUrl, normalizeBookCoverUrl } from "../../../lib/bookCovers";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const coverUrl = normalizeBookCoverUrl(url.searchParams.get("url"));
	if (!coverUrl || !isGoogleBooksCoverUrl(coverUrl)) {
		return new Response("Invalid cover URL.", { status: 400 });
	}

	try {
		const response = await fetch(coverUrl, {
			headers: {
				"Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
				"User-Agent": "DogEared cover proxy"
			}
		});
		if (!response.ok || !response.body) {
			return new Response("Cover unavailable.", { status: response.status || 502 });
		}
		const contentType = response.headers.get("Content-Type") || "image/jpeg";
		return new Response(response.body, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": createPublicCacheControl(60 * 60 * 24 * 7, 60 * 60 * 24),
				"X-Content-Type-Options": "nosniff"
			}
		});
	} catch (error) {
		console.error("Cover proxy failed.", error);
		return new Response("Cover unavailable.", { status: 502 });
	}
};
