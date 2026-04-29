import test from "node:test";
import assert from "node:assert/strict";
import { canFollowUser } from "../src/lib/followPolicy.ts";

test("allows follow for distinct authenticated users", () => {
	assert.equal(canFollowUser("viewer", "target").ok, true);
});

test("blocks anonymous follow", () => {
	const result = canFollowUser("", "target");
	assert.equal(result.ok, false);
	assert.equal(result.error, "You must be logged in to follow users.");
});

test("blocks self follow", () => {
	const result = canFollowUser("u1", "u1");
	assert.equal(result.ok, false);
	assert.equal(result.error, "You cannot follow yourself.");
});
