import type { APIRoute } from "astro";
import { getNeonSql } from "../lib/neon";
import { authorCanonicalPath, decideRelatedIndexing, relatedCanonicalPath } from "../lib/indexing";

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
		{ loc: toUrl(base, "/related"), changefreq: "daily", priority: "0.8" },
		{ loc: toUrl(base, "/books"), changefreq: "daily", priority: "0.85" },
		{ loc: toUrl(base, "/authors"), changefreq: "daily", priority: "0.85" },
		{ loc: toUrl(base, "/roadmap"), changefreq: "monthly", priority: "0.5" },
		{ loc: toUrl(base, "/mission"), changefreq: "monthly", priority: "0.5" }
	];

	const dynamicEntries: UrlEntry[] = [];
	try {
		const sql = getNeonSql();
		const [profiles, authors, books, genres, topics] = await Promise.all([
			sql<Array<{ username: string; lastmod: string | null; shelves_count: number }>>`
				select
					au.username,
					max(coalesce(ub.updated_at, ub.first_added_at))::text as lastmod,
					count(ub.book_id)::int as shelves_count
				from app_user au
				left join user_book ub on ub.user_id = au.id
				where nullif(trim(coalesce(au.username, '')), '') is not null
					and coalesce(au.profile_data->'settings'->'privacy'->>'profileVisibility', 'public') <> 'private'
				group by au.id, au.username, au.created_at
				having count(ub.book_id) > 0
				order by max(coalesce(ub.updated_at, ub.first_added_at)) desc nulls last, au.created_at desc
				limit 2000
			`,
			sql<Array<{ name: string; lastmod: string | null; shelves_count: number }>>`
				select
					coalesce(nullif(trim(a.name), ''), nullif(trim(b.primary_author), '')) as name,
					max(coalesce(ub.updated_at, ub.first_added_at))::text as lastmod,
					count(distinct ub.book_id)::int as shelves_count
				from book b
				left join author a on a.id = b.author_id
				join user_book ub on ub.book_id = b.id
				where nullif(trim(coalesce(a.name, b.primary_author, '')), '') is not null
				group by coalesce(nullif(trim(a.name), ''), nullif(trim(b.primary_author), ''))
				having count(distinct ub.book_id) > 0
				order by max(coalesce(ub.updated_at, ub.first_added_at)) desc nulls last, name asc
				limit 2000
			`,
			sql<Array<{ id: number; updated_at: string | null }>>`
				select b.id, max(coalesce(ub.updated_at, b.updated_at))::text as updated_at
				from book b
				join user_book ub on ub.book_id = b.id
				where nullif(trim(coalesce(b.title, '')), '') is not null
				group by b.id
				having count(ub.book_id) > 0
				order by max(coalesce(ub.updated_at, b.updated_at)) desc nulls last, b.id desc
				limit 3000
			`,
			sql<Array<{ value: string; books: number; authors: number; readers: number; lastmod: string | null }>>`
				select
					coalesce(nullif(trim(bg.genre_name), ''), '') as value,
					count(distinct b.id)::int as books,
					count(distinct coalesce(nullif(trim(b.primary_author), ''), b.author_id::text))::int as authors,
					count(distinct ub.user_id)::int as readers,
					max(coalesce(ub.updated_at, b.updated_at))::text as lastmod
				from book_genre bg
				join book b on b.id = bg.book_id
				left join user_book ub on ub.book_id = b.id
				group by coalesce(nullif(trim(bg.genre_name), ''), '')
				having count(distinct ub.user_id) > 0
				order by count(distinct b.id) desc, count(distinct ub.user_id) desc, value asc
				limit 1000
			`,
			sql<Array<{ value: string; books: number; authors: number; readers: number; lastmod: string | null }>>`
				select
					coalesce(nullif(trim(bt.tag_name), ''), '') as value,
					count(distinct b.id)::int as books,
					count(distinct coalesce(nullif(trim(b.primary_author), ''), b.author_id::text))::int as authors,
					count(distinct ub.user_id)::int as readers,
					max(coalesce(ub.updated_at, b.updated_at))::text as lastmod
				from book_tag bt
				join book b on b.id = bt.book_id
				left join user_book ub on ub.book_id = b.id
				group by coalesce(nullif(trim(bt.tag_name), ''), '')
				having count(distinct ub.user_id) > 0
				order by count(distinct b.id) desc, count(distinct ub.user_id) desc, value asc
				limit 1000
			`
		]);

		for (const row of profiles) {
			const username = String(row?.username || "").trim();
			const shelvesCount = Math.max(0, Number(row?.shelves_count || 0) || 0);
			if (!username) continue;
			if (shelvesCount <= 0) continue;
			const lastmod = String(row?.lastmod || "").trim();
			dynamicEntries.push({
				loc: toUrl(base, `/profile/${encodeURIComponent(username)}`),
				changefreq: "weekly",
				priority: "0.7",
				lastmod: lastmod ? new Date(lastmod).toISOString() : undefined
			});
		}
		for (const row of authors) {
			const name = String(row?.name || "").trim();
			const shelvesCount = Math.max(0, Number(row?.shelves_count || 0) || 0);
			if (!name) continue;
			if (shelvesCount <= 0) continue;
			const lastmod = String(row?.lastmod || "").trim();
			dynamicEntries.push({
				loc: toUrl(base, authorCanonicalPath(name)),
				changefreq: "weekly",
				priority: "0.7",
				lastmod: lastmod ? new Date(lastmod).toISOString() : undefined
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
		for (const row of genres) {
			const value = String(row?.value || "").trim();
			const decision = decideRelatedIndexing({
				kind: "genre",
				value,
				bookCount: Number(row?.books || 0),
				uniqueAuthorCount: Number(row?.authors || 0),
				readerCount: Number(row?.readers || 0)
			});
			if (!decision.indexable) continue;
			const lastmod = String(row?.lastmod || "").trim();
			dynamicEntries.push({
				loc: toUrl(base, relatedCanonicalPath("genre", value)),
				changefreq: "weekly",
				priority: "0.65",
				lastmod: lastmod ? new Date(lastmod).toISOString() : undefined
			});
		}
		for (const row of topics) {
			const value = String(row?.value || "").trim();
			const decision = decideRelatedIndexing({
				kind: "topic",
				value,
				bookCount: Number(row?.books || 0),
				uniqueAuthorCount: Number(row?.authors || 0),
				readerCount: Number(row?.readers || 0)
			});
			if (!decision.indexable) continue;
			const lastmod = String(row?.lastmod || "").trim();
			dynamicEntries.push({
				loc: toUrl(base, relatedCanonicalPath("topic", value)),
				changefreq: "weekly",
				priority: "0.55",
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
