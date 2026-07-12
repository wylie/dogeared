import { neon } from "@neondatabase/serverless";
import { migrateCanonicalCatalog } from "../src/lib/workNormalization.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const candidateLimitArg = process.argv.find((arg) => arg.startsWith("--candidate-limit="));
const duplicateLimitArg = process.argv.find((arg) => arg.startsWith("--duplicate-limit="));
const maxPassesArg = process.argv.find((arg) => arg.startsWith("--max-passes="));

const candidateLimit = Math.max(1, Math.min(10000, Number(candidateLimitArg?.split("=")[1] || 5000) || 5000));
const duplicateLimit = Math.max(1, Math.min(250, Number(duplicateLimitArg?.split("=")[1] || 150) || 150));
const maxPasses = Math.max(1, Math.min(20, Number(maxPassesArg?.split("=")[1] || 10) || 10));

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(databaseUrl);
const report = await migrateCanonicalCatalog(sql, {
	apply: shouldApply,
	candidateLimit,
	duplicateLimit,
	maxPasses
});

console.log(JSON.stringify(report, null, 2));

if (!shouldApply) {
	console.log("Dry run only. Re-run with --apply to merge duplicate Works, repair Series and Author relationships, and refresh canonical search identity.");
}
