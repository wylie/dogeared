#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const workflowFiles = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/i.test(name));
const deprecatedActions = [
	/actions\/checkout@v[1-4]\b/g,
	/actions\/setup-node@v[1-4]\b/g,
	/actions\/upload-artifact@v[1-5]\b/g,
	/actions\/download-artifact@v[1-4]\b/g,
	/actions\/cache@v[1-4]\b/g,
	/actions\/github-script@v[1-7]\b/g,
	/actions\/dependency-review-action@v[1-4]\b/g
];

const failures = [];
for (const file of workflowFiles) {
	const contents = readFileSync(join(workflowDirectory.pathname, file), "utf8");
	for (const pattern of deprecatedActions) {
		pattern.lastIndex = 0;
		const matches = contents.match(pattern) || [];
		for (const match of matches) failures.push(`${file}: ${match}`);
	}
}

if (failures.length > 0) {
	console.error("Deprecated Node.js 20-based GitHub Actions found:");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`CI configuration validated across ${workflowFiles.length} workflows.`);
