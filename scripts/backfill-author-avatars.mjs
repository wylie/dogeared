import { neon } from "@neondatabase/serverless";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.BACKFILL_CONCURRENCY || 4) || 4));
const LIMIT = Math.max(0, Number(process.env.BACKFILL_LIMIT || 0) || 0);
const DRY_RUN = String(process.env.BACKFILL_DRY_RUN || "").trim() === "1";

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(DATABASE_URL);

function normalizeText(value) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function canonicalizeAuthorName(value) {
	return normalizeText(value)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function scoreAuthorCandidate(targetName, candidateName) {
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

async function fetchJson(url) {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

async function fetchOpenLibraryAuthor(name) {
	const cleanName = normalizeText(name);
	if (!cleanName) return null;

	const searchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(cleanName)}`;
	const searchJson = await fetchJson(searchUrl);
	const docs = Array.isArray(searchJson?.docs) ? searchJson.docs : [];
	if (docs.length === 0) return null;

	const candidates = docs.slice(0, 12).map((row) => ({
		key: normalizeText(row?.key),
		name: normalizeText(row?.name),
		baseScore: scoreAuthorCandidate(cleanName, row?.name)
	})).filter((row) => row.key && row.name);

	if (candidates.length === 0) return null;

	const sorted = [...candidates].sort((a, b) => b.baseScore - a.baseScore);
	for (const candidate of sorted) {
		const normalizedKey = candidate.key.startsWith("/authors/")
			? candidate.key
			: `/authors/${candidate.key.replace(/^\/+/, "")}`;
		const detailsUrl = `https://openlibrary.org${encodeURIComponent(normalizedKey).replace(/%2F/g, "/")}.json`;
		const details = await fetchJson(detailsUrl);
		if (!details) continue;
		const photoId = Number(Array.isArray(details.photos) ? details.photos[0] : 0) || 0;
		if (photoId <= 0) continue;
		return {
			photoUrl: `https://covers.openlibrary.org/a/id/${photoId}-L.jpg`,
			source: "Open Library",
			sourceUrl: `https://openlibrary.org${normalizedKey}`
		};
	}
	return null;
}

async function mapWithConcurrency(items, limit, worker) {
	const runners = [];
	let cursor = 0;
	for (let i = 0; i < Math.min(limit, items.length); i += 1) {
		runners.push((async () => {
			while (cursor < items.length) {
				const index = cursor;
				cursor += 1;
				await worker(items[index], index);
			}
		})());
	}
	await Promise.all(runners);
}

const authors = LIMIT > 0
	? await sql`
		select id, name, photo_url
		from author
		where trim(coalesce(name, '')) <> ''
			and trim(coalesce(photo_url, '')) = ''
		order by id asc
		limit ${LIMIT}
	`
	: await sql`
		select id, name, photo_url
		from author
		where trim(coalesce(name, '')) <> ''
			and trim(coalesce(photo_url, '')) = ''
		order by id asc
	`;

console.log(`Backfilling author avatars for ${authors.length} authors with concurrency ${CONCURRENCY}${DRY_RUN ? " (dry run)" : ""}...`);

let updated = 0;
let noMatch = 0;
let failed = 0;

await mapWithConcurrency(authors, CONCURRENCY, async (author, index) => {
	try {
		const resolved = await fetchOpenLibraryAuthor(author.name);
		if (!resolved?.photoUrl) {
			noMatch += 1;
			process.stdout.write(`\rProcessed ${index + 1}/${authors.length}`);
			return;
		}

		if (!DRY_RUN) {
			await sql`
				update author
				set
					photo_url = ${resolved.photoUrl},
					bio_source = case when trim(coalesce(bio_source, '')) = '' then ${resolved.source} else bio_source end,
					bio_source_url = case when trim(coalesce(bio_source_url, '')) = '' then ${resolved.sourceUrl} else bio_source_url end,
					updated_at = now()
				where id = ${author.id}
			`;
		}
		updated += 1;
		process.stdout.write(`\rProcessed ${index + 1}/${authors.length}`);
	} catch {
		failed += 1;
		process.stdout.write(`\rProcessed ${index + 1}/${authors.length}`);
	}
});

const [summary] = await sql`
	select
		count(*)::int as total_authors,
		count(*) filter (where trim(coalesce(photo_url, '')) <> '')::int as authors_with_photo,
		count(*) filter (where trim(coalesce(photo_url, '')) = '')::int as authors_without_photo
	from author
`;

console.log("\nAuthor avatar backfill complete.");
console.log(JSON.stringify({
	updated,
	noMatch,
	failed,
	totalAuthors: Number(summary?.total_authors || 0),
	authorsWithPhoto: Number(summary?.authors_with_photo || 0),
	authorsWithoutPhoto: Number(summary?.authors_without_photo || 0),
	dryRun: DRY_RUN
}, null, 2));
