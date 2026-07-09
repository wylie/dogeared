export const READER_SUGGESTIONS_EMPTY_MESSAGE = "More readers will appear here as the DogEared community grows.";
export const READER_SUGGESTION_EXCLUDED_USERNAME_PATTERN_SOURCE = "(^|[-_.])(codex|dev|development|demo|fixture|seed|test)([-_.]|$)";
export const INELIGIBLE_READER_SUGGESTION_STATUSES = ["deleted", "deactivated", "disabled", "hidden", "private", "suspended"];

const INTERNAL_READER_USERNAME_PATTERN = new RegExp(READER_SUGGESTION_EXCLUDED_USERNAME_PATTERN_SOURCE, "i");
const INELIGIBLE_ACCOUNT_STATUSES = new Set(INELIGIBLE_READER_SUGGESTION_STATUSES);

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function normalizeBooleanFlag(value: unknown) {
	const text = normalizeText(value).toLowerCase();
	return text === "1" || text === "true" || text === "yes";
}

function profileValue(source: Record<string, unknown>, path: string[]) {
	let current: unknown = source;
	for (const key of path) {
		if (!current || typeof current !== "object") return "";
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

export function isExcludedReaderSuggestionUsername(username: unknown) {
	const text = normalizeText(username).toLowerCase();
	if (!text) return true;
	if (text === "test") return true;
	return INTERNAL_READER_USERNAME_PATTERN.test(text);
}

export function isEligibleReaderSuggestionProfile(profileData: unknown) {
	const source = profileData && typeof profileData === "object" ? profileData as Record<string, unknown> : {};
	const profileVisibility = normalizeText(profileValue(source, ["settings", "privacy", "profileVisibility"])).toLowerCase();
	const allowDiscoveryRaw = profileValue(source, ["settings", "privacy", "allowDiscovery"]);
	if (profileVisibility === "private") return false;
	if (typeof allowDiscoveryRaw === "boolean" && !allowDiscoveryRaw) return false;
	if (typeof allowDiscoveryRaw === "string" && allowDiscoveryRaw.trim().toLowerCase() === "false") return false;

	const statusValues = [
		profileValue(source, ["accountStatus"]),
		profileValue(source, ["status"]),
		profileValue(source, ["settings", "accountStatus"]),
		profileValue(source, ["settings", "status"]),
		profileValue(source, ["settings", "internal", "status"])
	].map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
	if (statusValues.some((status) => INELIGIBLE_ACCOUNT_STATUSES.has(status))) return false;

	const internalFlags = [
		profileValue(source, ["deleted"]),
		profileValue(source, ["isDeleted"]),
		profileValue(source, ["suspended"]),
		profileValue(source, ["isSuspended"]),
		profileValue(source, ["hidden"]),
		profileValue(source, ["isHidden"]),
		profileValue(source, ["internal"]),
		profileValue(source, ["isInternal"]),
		profileValue(source, ["test"]),
		profileValue(source, ["isTest"]),
		profileValue(source, ["development"]),
		profileValue(source, ["isDevelopment"]),
		profileValue(source, ["seed"]),
		profileValue(source, ["isSeed"]),
		profileValue(source, ["fixture"]),
		profileValue(source, ["isFixture"]),
		profileValue(source, ["settings", "internal"]),
		profileValue(source, ["settings", "internal", "test"]),
		profileValue(source, ["settings", "internal", "isTest"]),
		profileValue(source, ["settings", "internal", "development"]),
		profileValue(source, ["settings", "internal", "isDevelopment"]),
		profileValue(source, ["settings", "internal", "seed"]),
		profileValue(source, ["settings", "internal", "fixture"])
	];
	return !internalFlags.some(normalizeBooleanFlag);
}
