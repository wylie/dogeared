import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

test("workflows use supported Node 24-based action majors", () => {
	const directory = new URL("../.github/workflows/", import.meta.url);
	const contents = readdirSync(directory)
		.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
		.map((name) => readFileSync(new URL(name, directory), "utf8"))
		.join("\n");
	assert.doesNotMatch(contents, /actions\/(?:checkout|setup-node|download-artifact|cache)@v[1-4]\b/);
	assert.doesNotMatch(contents, /actions\/upload-artifact@v[1-5]\b/);
	assert.doesNotMatch(contents, /actions\/github-script@v[1-7]\b/);
	assert.doesNotMatch(contents, /actions\/dependency-review-action@v[1-4]\b/);
});

test("workflows use deterministic installs and shared secret validation", () => {
	const metadata = readFileSync(new URL("../.github/workflows/metadata-backfills.yml", import.meta.url), "utf8");
	const monitor = readFileSync(new URL("../.github/workflows/production-monitor.yml", import.meta.url), "utf8");
	assert.match(metadata, /run: npm ci/);
	assert.match(metadata, /validate-required-env\.mjs DATABASE_URL/);
	assert.match(monitor, /validate-required-env\.mjs APP_BASE_URL/);
});
