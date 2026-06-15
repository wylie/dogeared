#!/usr/bin/env node

const requiredNames = process.argv.slice(2).map((name) => String(name || "").trim()).filter(Boolean);

if (requiredNames.length === 0) {
	console.error("No required environment variable names were provided.");
	process.exit(2);
}

const missing = requiredNames.filter((name) => !String(process.env[name] || "").trim());

if (missing.length > 0) {
	for (const name of missing) {
		console.error(`::error title=Missing required GitHub Actions secret::${name} is empty. Add it under Settings > Secrets and variables > Actions, then rerun this workflow.`);
	}
	process.exit(1);
}

console.log(`Required environment validated: ${requiredNames.join(", ")}`);
