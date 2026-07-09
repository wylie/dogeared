import test from "node:test";
import assert from "node:assert/strict";
import {
	isEligiblePublicReaderAccount,
	isEligiblePublicReaderProfile,
	isExcludedPublicReaderUsername,
	READER_SUGGESTIONS_EMPTY_MESSAGE
} from "../src/lib/publicReaderPolicy.ts";

test("reader suggestion usernames exclude internal and test accounts", () => {
	for (const username of ["codex-progress-test", "test", "demo", "seed", "fixture", "reader-dev", "placeholder", "admin-seed"]) {
		assert.equal(isExcludedPublicReaderUsername(username), true);
	}
	assert.equal(isExcludedPublicReaderUsername("quiet-reader"), false);
});

test("reader suggestion profile filters exclude hidden and internal accounts", () => {
	assert.equal(isEligiblePublicReaderProfile({
		settings: { privacy: { profileVisibility: "private" } }
	}), false);
	assert.equal(isEligiblePublicReaderProfile({
		settings: { privacy: { allowDiscovery: false } }
	}, { requireDiscovery: true }), false);
	assert.equal(isEligiblePublicReaderProfile({ accountStatus: "suspended" }), false);
	assert.equal(isEligiblePublicReaderProfile({ isDeleted: true }), false);
	assert.equal(isEligiblePublicReaderProfile({ is_test: true }), false);
	assert.equal(isEligiblePublicReaderProfile({ settings: { internal: { isTest: true } } }), false);
	assert.equal(isEligiblePublicReaderProfile({ settings: { internal: { admin_seed: true } } }), false);
	assert.equal(isEligiblePublicReaderProfile({ blurb: "Public reader." }), true);
});

test("reader suggestion account filters combine username and profile rules", () => {
	assert.equal(isEligiblePublicReaderAccount({
		username: "codex-progress-test",
		profileData: { blurb: "Seed reader." },
		requireDiscovery: true
	}), false);
	assert.equal(isEligiblePublicReaderAccount({
		username: "quiet-reader",
		profileData: { settings: { privacy: { allowDiscovery: true } } },
		requireDiscovery: true
	}), true);
});

test("reader suggestions expose a friendly empty state", () => {
	assert.equal(READER_SUGGESTIONS_EMPTY_MESSAGE, "As more readers join DogEared, you'll discover people with similar reading interests.");
});
