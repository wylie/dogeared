import test from "node:test";
import assert from "node:assert/strict";
import { canSetUsername } from "../src/lib/usernamePolicy.ts";

test("can set username when user has none", () => {
	assert.equal(canSetUsername("", "alice").ok, true);
});

test("can keep same username", () => {
	assert.equal(canSetUsername("alice", "alice").ok, true);
});

test("cannot change existing username", () => {
	const result = canSetUsername("alice", "bob");
	assert.equal(result.ok, false);
	assert.equal(result.error, "Username changes are not available yet.");
});

test("cannot clear existing username", () => {
	const result = canSetUsername("alice", "");
	assert.equal(result.ok, false);
	assert.equal(result.error, "Username changes are not available yet.");
});
