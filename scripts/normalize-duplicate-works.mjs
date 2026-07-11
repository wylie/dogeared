import { neon } from "@neondatabase/serverless";
import { loadPotentialDuplicateWorks, mergeCatalogWorks } from "../src/lib/workNormalization.ts";

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const minConfidenceArg = process.argv.find((arg) => arg.startsWith("--min-confidence="));
const minConfidence = Math.max(85, Math.min(100, Number(minConfidenceArg?.split("=")[1] || 100) || 100));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(1, Math.min(100, Number(limitArg?.split("=")[1] || 50) || 50));

if (!databaseUrl) {
	throw new Error("Missing DATABASE_URL.");
}

const sql = neon(databaseUrl);
const groups = await loadPotentialDuplicateWorks(sql, limit);
const mergeable = groups.flatMap((group) => (
	group.confidenceScore >= minConfidence
		? group.duplicates.map((duplicate) => ({ group, duplicate }))
		: []
));

console.log(`Potential duplicate Work groups: ${groups.length}`);
console.log(`Mergeable candidates at confidence >= ${minConfidence}: ${mergeable.length}`);

for (const { group, duplicate } of mergeable) {
	console.log([
		`- ${group.target.normalizedTitle || group.target.title}`,
		`target #${group.target.bookId}`,
		`duplicate #${duplicate.bookId}`,
		`${group.confidenceScore}%`,
		group.reasons.join(" ")
	].join(" | "));
}

if (!shouldApply) {
	console.log("Dry run only. Re-run with --apply to merge listed candidates.");
	process.exit(0);
}

for (const { group, duplicate } of mergeable) {
	const result = await mergeCatalogWorks(sql, {
		groupKey: group.groupKey,
		targetBookId: group.target.bookId,
		sourceBookId: duplicate.bookId,
		reason: group.reasons.join(" ")
	});
	console.log(result.message);
	if (!result.ok) process.exitCode = 1;
}
