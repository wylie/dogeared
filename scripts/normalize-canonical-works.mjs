import { neon } from "@neondatabase/serverless";
import { normalizeCanonicalWorkRelationships } from "../src/lib/workNormalization.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const candidateLimitArg = process.argv.find((arg) => arg.startsWith("--candidate-limit="));
const duplicateLimitArg = process.argv.find((arg) => arg.startsWith("--duplicate-limit="));
const maxPassesArg = process.argv.find((arg) => arg.startsWith("--max-passes="));

const candidateLimit = Math.max(1, Math.min(5000, Number(candidateLimitArg?.split("=")[1] || 1000) || 1000));
const duplicateLimit = Math.max(1, Math.min(100, Number(duplicateLimitArg?.split("=")[1] || 100) || 100));
const maxPasses = Math.max(1, Math.min(10, Number(maxPassesArg?.split("=")[1] || 5) || 5));

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(databaseUrl);
const result = await normalizeCanonicalWorkRelationships(sql, {
	apply: shouldApply,
	candidateLimit,
	duplicateLimit,
	maxPasses
});

console.log(JSON.stringify({
	dryRun: !shouldApply,
	...result
}, null, 2));

if (!shouldApply) {
	console.log("Dry run only. Re-run with --apply to attach known series metadata, normalize titles, and merge high-confidence duplicate Works.");
}
