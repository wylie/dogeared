import test from "node:test";
import assert from "node:assert/strict";
import {
	normalizeRequestedIp,
	resolveMagicLinkEmailCooldownSeconds,
	resolveMagicLinkRateLimit
} from "../src/lib/authHardening.ts";

test("normalizeRequestedIp returns first forwarded IP and trims", () => {
	assert.equal(normalizeRequestedIp(" 203.0.113.7, 70.41.3.18 "), "203.0.113.7");
	assert.equal(normalizeRequestedIp(""), "");
});

test("resolveMagicLinkEmailCooldownSeconds blocks links newer than cooldown", () => {
	assert.equal(resolveMagicLinkEmailCooldownSeconds(1199), 59);
	assert.equal(resolveMagicLinkEmailCooldownSeconds(1140), 0);
	assert.equal(resolveMagicLinkEmailCooldownSeconds(1000), 0);
});

test("resolveMagicLinkRateLimit blocks when email cooldown is active", () => {
	const result = resolveMagicLinkRateLimit({
		secondsUntilLatestUnusedLinkExpiry: 1180,
		recentIpRequestCount: 0
	});
	assert.equal(result.blocked, true);
	assert.equal(result.status, 429);
	assert.equal(result.retryAfterSeconds, 40);
});

test("resolveMagicLinkRateLimit blocks when IP request cap is exceeded", () => {
	const result = resolveMagicLinkRateLimit({
		secondsUntilLatestUnusedLinkExpiry: 0,
		recentIpRequestCount: 12
	});
	assert.equal(result.blocked, true);
	assert.equal(result.status, 429);
	assert.equal(result.retryAfterSeconds, 60);
});

test("resolveMagicLinkRateLimit allows requests under limits", () => {
	const result = resolveMagicLinkRateLimit({
		secondsUntilLatestUnusedLinkExpiry: 0,
		recentIpRequestCount: 3
	});
	assert.equal(result.blocked, false);
	assert.equal(result.status, 200);
});

