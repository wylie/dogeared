import test from "node:test";
import assert from "node:assert/strict";
import {
	isEligibleReaderSuggestionProfile,
	isExcludedReaderSuggestionUsername,
	READER_SUGGESTIONS_EMPTY_MESSAGE
} from "../src/lib/readerSuggestionRules.ts";

test("reader suggestion usernames exclude internal and test accounts", () => {
	for (const username of ["codex-progress-test", "test", "demo", "seed", "fixture", "reader-dev"]) {
		assert.equal(isExcludedReaderSuggestionUsername(username), true);
	}
	assert.equal(isExcludedReaderSuggestionUsername("quiet-reader"), false);
});

test("reader suggestion profile filters exclude hidden and internal accounts", () => {
	assert.equal(isEligibleReaderSuggestionProfile({
		settings: { privacy: { profileVisibility: "private" } }
	}), false);
	assert.equal(isEligibleReaderSuggestionProfile({
		settings: { privacy: { allowDiscovery: false } }
	}), false);
	assert.equal(isEligibleReaderSuggestionProfile({ accountStatus: "suspended" }), false);
	assert.equal(isEligibleReaderSuggestionProfile({ isDeleted: true }), false);
	assert.equal(isEligibleReaderSuggestionProfile({ settings: { internal: { isTest: true } } }), false);
	assert.equal(isEligibleReaderSuggestionProfile({ blurb: "Public reader." }), true);
});

test("reader suggestions expose a friendly empty state", () => {
	assert.equal(READER_SUGGESTIONS_EMPTY_MESSAGE, "More readers will appear here as the DogEared community grows.");
});
