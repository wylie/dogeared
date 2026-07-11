import { neon } from "@neondatabase/serverless";
import { loadCanonicalTitleCleanupCandidates, normalizeCanonicalSeriesTitles } from "../src/lib/canonicalTitleCleanup.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const dryRun = process.argv.includes("--dry-run") || process.env.CANONICAL_TITLE_CLEANUP_DRY_RUN === "1";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1] || 0) : 500;

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(databaseUrl);

if (dryRun) {
	const candidates = await loadCanonicalTitleCleanupCandidates(sql, limit);
	console.log(JSON.stringify({
		dryRun: true,
		candidates: candidates.length,
		preview: candidates.slice(0, 25)
	}, null, 2));
} else {
	const result = await normalizeCanonicalSeriesTitles(sql, limit);
	console.log(JSON.stringify({
		dryRun: false,
		checked: result.checked,
		updated: result.updated
	}, null, 2));
}
