import type { APIRoute } from "astro";
import { getNeonSql } from "../lib/neon";

export const prerender = false;

function xmlEscape(value: string) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function resolveBase(request: Request) {
	const site = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL || "";
	try {
		return new URL(site || request.url).origin;
	} catch {
		return "http://localhost:4321";
	}
}

function toUrl(base: string, path: string) {
	return new URL(path, base).toString();
}

type UrlEntry = {
	loc: string;
	changefreq?: "daily" | "weekly" | "monthly";
	priority?: string;
	lastmod?: string;
};

export const GET: APIRoute = async ({ request }) => {
	const base = resolveBase(request);
	const staticEntries: UrlEntry[] = [
		{ loc: toUrl(base, "/"), changefreq: "daily", priority: "1.0" },
		{ loc: toUrl(base, "/search"), changefreq: "daily", priority: "0.9" },
		{ loc: toUrl(base, "/related"), changefreq: "daily", priority: "0.8" },
		{ loc: toUrl(base, "/roadmap"), changefreq: "monthly", priority: "0.5" },
		{ loc: toUrl(base, "/mission"), changefreq: "monthly", priority: "0.5" }
	];

	const dynamicEntries: UrlEntry[] = [];
	try {
		const sql = getNeonSql();
		const [profiles, authors, books] = await Promise.all([
			sql<Array<{ username: string }>>`
				select username
				from app_user
				where nullif(trim(coalesce(username, '')), '') is not null
					and coalesce(profile_data->'settings'->'privacy'->>'profileVisibility', 'public') <> 'private'
				order by created_at desc
				limit 2000
			`,
			sql<Array<{ id: number }>>`
				select distinct author_id as id
				from book
				where author_id is not null and author_id > 0
				order by author_id desc
				limit 2000
			`,
			sql<Array<{ id: number; updated_at: string | null }>>`
				select id, updated_at::text
				from book
				order by updated_at desc nulls last, id desc
				limit 3000
			`
		]);

		for (const row of profiles) {
			const username = String(row?.username || "").trim();
			if (!username) continue;
			dynamicEntries.push({
				loc: toUrl(base, `/u/${encodeURIComponent(username)}`),
				changefreq: "weekly",
				priority: "0.7"
			});
		}
		for (const row of authors) {
			const authorId = Math.max(0, Number(row?.id || 0) || 0);
			if (!authorId) continue;
			dynamicEntries.push({
				loc: toUrl(base, `/author?authorId=${encodeURIComponent(String(authorId))}`),
				changefreq: "weekly",
				priority: "0.7"
			});
		}
		for (const row of books) {
			const bookId = Math.max(0, Number(row?.id || 0) || 0);
			if (!bookId) continue;
			const lastmod = String(row?.updated_at || "").trim();
			dynamicEntries.push({
				loc: toUrl(base, `/book?bookId=${encodeURIComponent(String(bookId))}`),
				changefreq: "weekly",
				priority: "0.8",
				lastmod: lastmod ? new Date(lastmod).toISOString() : undefined
			});
		}
	} catch (error) {
		console.error("Sitemap dynamic query failed; serving static sitemap entries.", error);
	}

	const dedupe = new Set<string>();
	const merged = [...staticEntries, ...dynamicEntries].filter((entry) => {
		if (!entry.loc || dedupe.has(entry.loc)) return false;
		dedupe.add(entry.loc);
		return true;
	});

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${merged.map((entry) => {
		const lines = [
			`  <url>`,
			`    <loc>${xmlEscape(entry.loc)}</loc>`
		];
		if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
		if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
		if (entry.priority) lines.push(`    <priority>${entry.priority}</priority>`);
		lines.push("  </url>");
		return lines.join("\n");
	}).join("\n")}\n</urlset>`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600"
		}
	});
};

