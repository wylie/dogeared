import test from "node:test";
import assert from "node:assert/strict";
import { resolvePrivacySettings, resolveViewerProfileAccess } from "../src/lib/privacy.ts";

test("resolvePrivacySettings returns defaults", () => {
	const settings = resolvePrivacySettings({});
	assert.equal(settings.profileVisibility, "public");
	assert.equal(settings.shareLocation, true);
	assert.equal(settings.shareActivity, true);
});

test("resolvePrivacySettings normalizes explicit private settings", () => {
	const settings = resolvePrivacySettings({
		settings: { privacy: { profileVisibility: "private", shareLocation: false, shareActivity: false } }
	});
	assert.equal(settings.profileVisibility, "private");
	assert.equal(settings.shareLocation, false);
	assert.equal(settings.shareActivity, false);
});

test("owner can always view/edit everything", () => {
	const access = resolveViewerProfileAccess({
		viewerUserId: "u1",
		targetUserId: "u1",
		privacy: { profileVisibility: "private", shareLocation: false, shareActivity: false }
	});
	assert.equal(access.canViewProfile, true);
	assert.equal(access.canEditProfile, true);
	assert.equal(access.canViewLocation, true);
	assert.equal(access.canViewActivity, true);
});

test("non-owner is blocked for private profile", () => {
	const access = resolveViewerProfileAccess({
		viewerUserId: "u2",
		targetUserId: "u1",
		privacy: { profileVisibility: "private", shareLocation: true, shareActivity: true }
	});
	assert.equal(access.canViewProfile, false);
	assert.equal(access.canViewLocation, false);
	assert.equal(access.canViewActivity, false);
});

test("non-owner obeys location/activity visibility for public profile", () => {
	const access = resolveViewerProfileAccess({
		viewerUserId: "u2",
		targetUserId: "u1",
		privacy: { profileVisibility: "public", shareLocation: false, shareActivity: true }
	});
	assert.equal(access.canViewProfile, true);
	assert.equal(access.canViewLocation, false);
	assert.equal(access.canViewActivity, true);
});
