import test from "node:test";
import assert from "node:assert/strict";
import { GET as healthGet } from "../src/pages/api/health.ts";

function requestFrom(path: string) {
	return new Request(`http://localhost${path}`);
}

test("health endpoint returns structured JSON payload", async () => {
	const response = await healthGet({ request: requestFrom("/api/health") } as any);
	assert.ok(response.status === 200 || response.status === 503);
	assert.equal(response.headers.get("cache-control"), "no-store");
	const payload = await response.json();
	assert.equal(typeof payload?.status, "string");
	assert.equal(typeof payload?.services?.db?.ok, "boolean");
});
