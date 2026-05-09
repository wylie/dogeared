import { spawn } from "node:child_process";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const BACKFILL_LIMIT = String(process.env.BACKFILL_LIMIT || "").trim();
const BACKFILL_CONCURRENCY = String(process.env.BACKFILL_CONCURRENCY || "").trim();
const DRY_RUN = String(process.env.BACKFILL_DRY_RUN || "").trim() === "1";

if (!DATABASE_URL) {
	throw new Error("Missing DATABASE_URL.");
}

const commonEnv = {
	...process.env,
	DATABASE_URL,
	...(BACKFILL_LIMIT ? { BACKFILL_LIMIT } : {}),
	...(BACKFILL_CONCURRENCY ? { BACKFILL_CONCURRENCY } : {}),
	...(DRY_RUN ? { BACKFILL_DRY_RUN: "1" } : {})
};

const steps = [
	{
		id: "report_before",
		label: "Metadata quality report (before)",
		command: "node",
		args: ["scripts/metadata-quality-report.mjs"],
		env: commonEnv
	},
	{
		id: "backfill_author_bios",
		label: "Backfill author bios",
		command: "node",
		args: ["scripts/backfill-author-bios.mjs"],
		env: commonEnv
	},
	{
		id: "backfill_author_avatars",
		label: "Backfill author avatars",
		command: "node",
		args: ["scripts/backfill-author-avatars.mjs"],
		env: commonEnv
	},
	{
		id: "backfill_synopsis",
		label: "Backfill book synopsis",
		command: "node",
		args: ["scripts/backfill-book-synopsis.mjs"],
		env: commonEnv
	},
	{
		id: "backfill_genres",
		label: "Backfill book genres",
		command: "node",
		args: ["scripts/backfill-book-genres.mjs"],
		env: {
			...commonEnv,
			GOOGLE_BOOKS_API_KEY
		},
		skipWhen: !GOOGLE_BOOKS_API_KEY
	},
	{
		id: "report_after",
		label: "Metadata quality report (after)",
		command: "node",
		args: ["scripts/metadata-quality-report.mjs"],
		env: commonEnv
	}
];

function runStep(step) {
	return new Promise((resolve) => {
		if (step.skipWhen) {
			console.log(`\n--- ${step.label} (skipped) ---`);
			resolve({ id: step.id, label: step.label, skipped: true, code: 0, durationMs: 0 });
			return;
		}

		console.log(`\n--- ${step.label} ---`);
		const startedAt = Date.now();
		const child = spawn(step.command, step.args, {
			stdio: "inherit",
			env: step.env
		});

		child.on("error", (error) => {
			resolve({
				id: step.id,
				label: step.label,
				code: 1,
				skipped: false,
				durationMs: Date.now() - startedAt,
				error: error instanceof Error ? error.message : String(error)
			});
		});

		child.on("close", (code) => {
			resolve({
				id: step.id,
				label: step.label,
				code: Number(code || 0),
				skipped: false,
				durationMs: Date.now() - startedAt
			});
		});
	});
}

const startedAt = Date.now();
const results = [];
for (const step of steps) {
	const result = await runStep(step);
	results.push(result);
	if (!result.skipped && result.code !== 0) {
		console.error(`Step failed: ${step.label}`);
		break;
	}
}

const summary = {
	generatedAt: new Date().toISOString(),
	dryRun: DRY_RUN,
	totalDurationMs: Date.now() - startedAt,
	failedSteps: results.filter((item) => !item.skipped && item.code !== 0).length,
	steps: results
};

console.log("\nBackfill pipeline summary:");
console.log(JSON.stringify(summary, null, 2));

if (summary.failedSteps > 0) {
	process.exitCode = 1;
}
