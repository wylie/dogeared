import type { APIRoute } from "astro";

export const prerender = false;

function resolveBase(request: Request) {
	const site = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL || "";
	try {
		return new URL(site || request.url).origin;
	} catch {
		return "http://localhost:4321";
	}
}

export const GET: APIRoute = async ({ request }) => {
	const base = resolveBase(request);
	const lines = [
		"User-agent: *",
		"Allow: /",
		"Disallow: /api/",
		"Disallow: /admin/",
		"Disallow: /settings",
		"Disallow: /following",
		"Disallow: /metrics",
		"",
		`Sitemap: ${base}/sitemap.xml`
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600"
		}
	});
};

