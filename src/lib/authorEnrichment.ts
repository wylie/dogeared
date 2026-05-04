import { getNeonSql } from "./neon";

function normalizeText(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalizeAuthorName(value: unknown) {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function scoreAuthorCandidate(targetName: unknown, candidateName: unknown) {
	const target = canonicalizeAuthorName(targetName);
	const candidate = canonicalizeAuthorName(candidateName);
	if (!target || !candidate) return 0;
	if (target === candidate) return 1000;

	let score = 0;
	if (candidate.includes(target)) score += 300;
	if (target.includes(candidate)) score += 220;

	const targetTokens = target.split(" ").filter(Boolean);
	const candidateTokens = candidate.split(" ").filter(Boolean);
	const targetSet = new Set(targetTokens);
	const candidateSet = new Set(candidateTokens);
	const overlap = targetTokens.filter((token) => candidateSet.has(token)).length;
	score += overlap * 40;
	if (targetTokens.length > 0 && candidateTokens.length > 0) {
		const overlapRatio = overlap / Math.max(targetSet.size, candidateSet.size);
		score += Math.round(overlapRatio * 100);
	}
	return score;
}

async function fetchJson(url: string) {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

export async function fetchOpenLibraryAuthorProfile(name: unknown): Promise<{
	bio: string;
	photoUrl: string;
	source: string;
	sourceUrl: string;
} | null> {
	const cleanName = normalizeText(name);
	if (!cleanName) return null;
	const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(cleanName)}`;
	const searchJson = await fetchJson(searchUrl);
	const docs = Array.isArray(searchJson?.docs) ? searchJson.docs : [];
	if (docs.length === 0) return null;

	const candidates = docs.slice(0, 12).map((row) => ({
		key: normalizeText((row as Record<string, unknown>)?.key),
		name: normalizeText((row as Record<string, unknown>)?.name),
		baseScore: scoreAuthorCandidate(cleanName, (row as Record<string, unknown>)?.name)
	})).filter((row) => row.key && row.name);
	if (candidates.length === 0) return null;

	const sorted = [...candidates].sort((a, b) => b.baseScore - a.baseScore);
	for (const candidate of sorted) {
		const normalizedKey = candidate.key.startsWith("/authors/")
			? candidate.key
			: `/authors/${candidate.key.replace(/^\/+/, "")}`;
		const detailsUrl = `https://openlibrary.org${encodeURIComponent(normalizedKey).replace(/%2F/g, "/")}.json`;
		const details = await fetchJson(detailsUrl) as Record<string, unknown> | null;
		if (!details) continue;
		const rawBio = typeof details.bio === "string"
			? details.bio
			: String(((details.bio as Record<string, unknown> | undefined)?.value) || "");
		const bio = normalizeText(rawBio);
		const photoId = Number(Array.isArray(details.photos) ? details.photos[0] : 0) || 0;
		const photoUrl = photoId > 0 ? `https://covers.openlibrary.org/a/id/${photoId}-L.jpg` : "";
		if (!bio && !photoUrl) continue;
		return {
			bio,
			photoUrl,
			source: "Open Library",
			sourceUrl: `https://openlibrary.org${normalizedKey}`
		};
	}
	return null;
}

export async function ensureAuthorEnriched(name: unknown) {
	const authorName = normalizeText(name);
	if (!authorName) return 0;
	const sql = getNeonSql();
	const rows = await sql<Array<{ id: number; bio: string; photo_url: string; bio_source: string; bio_source_url: string }>>`
		insert into author (name)
		values (${authorName})
		on conflict (name) do update set
			name = excluded.name
		returning id, bio, photo_url, bio_source, bio_source_url
	`;
	const row = rows[0];
	const authorId = Number(row?.id || 0);
	if (!authorId) return 0;

	const hasBio = normalizeText(row?.bio) !== "";
	const hasPhoto = normalizeText(row?.photo_url) !== "";
	if (hasBio && hasPhoto) return authorId;

	const profile = await fetchOpenLibraryAuthorProfile(authorName);
	if (!profile) return authorId;

	await sql`
		update author
		set
			bio = case when trim(coalesce(bio, '')) = '' and ${profile.bio} <> '' then ${profile.bio} else bio end,
			photo_url = case when trim(coalesce(photo_url, '')) = '' and ${profile.photoUrl} <> '' then ${profile.photoUrl} else photo_url end,
			bio_source = case when trim(coalesce(bio_source, '')) = '' then ${profile.source} else bio_source end,
			bio_source_url = case when trim(coalesce(bio_source_url, '')) = '' then ${profile.sourceUrl} else bio_source_url end,
			updated_at = now()
		where id = ${authorId}
	`;
	return authorId;
}

