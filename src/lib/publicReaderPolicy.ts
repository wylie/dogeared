export const READER_SUGGESTIONS_EMPTY_MESSAGE = "As more readers join DogEared, you'll discover people with similar reading interests.";
export const DEMO_TEST_USERNAME = "test";
export const PUBLIC_READER_EXCLUDED_USERNAME_PATTERN_SOURCE = "(^|[-_.])(codex|dev|development|demo|fixture|internal|placeholder|seed|test|admin[-_.]?seed|seed[-_.]?admin)([-_.]|$)";
export const INELIGIBLE_PUBLIC_READER_STATUSES = ["deleted", "deactivated", "disabled", "hidden", "private", "suspended"];

const INTERNAL_READER_USERNAME_PATTERN = new RegExp(PUBLIC_READER_EXCLUDED_USERNAME_PATTERN_SOURCE, "i");
const INELIGIBLE_ACCOUNT_STATUSES = new Set(INELIGIBLE_PUBLIC_READER_STATUSES);

type SqlTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

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

export function shouldExposeDevelopmentReaderAccounts() {
	const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
	return !!env?.DEV;
}

export function isExcludedPublicReaderUsername(username: unknown) {
	const text = normalizeText(username).toLowerCase().replace(/^@+/, "");
	if (!text) return true;
	if (text === DEMO_TEST_USERNAME) return true;
	return INTERNAL_READER_USERNAME_PATTERN.test(text);
}

export function isEligiblePublicReaderProfile(profileData: unknown, options: {
	includeDevelopmentAccounts?: boolean;
	requirePublicProfile?: boolean;
	requireDiscovery?: boolean;
	requireActivitySharing?: boolean;
} = {}) {
	const includeDevelopmentAccounts = options.includeDevelopmentAccounts ?? shouldExposeDevelopmentReaderAccounts();
	const source = profileData && typeof profileData === "object" ? profileData as Record<string, unknown> : {};
	const profileVisibility = normalizeText(profileValue(source, ["settings", "privacy", "profileVisibility"])).toLowerCase();
	const allowDiscoveryRaw = profileValue(source, ["settings", "privacy", "allowDiscovery"]);
	const shareActivityRaw = profileValue(source, ["settings", "privacy", "shareActivity"]);
	if (options.requirePublicProfile !== false && profileVisibility === "private") return false;
	if (options.requireDiscovery && typeof allowDiscoveryRaw === "boolean" && !allowDiscoveryRaw) return false;
	if (options.requireDiscovery && typeof allowDiscoveryRaw === "string" && allowDiscoveryRaw.trim().toLowerCase() === "false") return false;
	if (options.requireActivitySharing && typeof shareActivityRaw === "boolean" && !shareActivityRaw) return false;
	if (options.requireActivitySharing && typeof shareActivityRaw === "string" && shareActivityRaw.trim().toLowerCase() === "false") return false;

	const statusValues = [
		profileValue(source, ["accountStatus"]),
		profileValue(source, ["account_status"]),
		profileValue(source, ["status"]),
		profileValue(source, ["settings", "accountStatus"]),
		profileValue(source, ["settings", "account_status"]),
		profileValue(source, ["settings", "status"]),
		profileValue(source, ["settings", "internal", "status"])
	].map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
	if (statusValues.some((status) => INELIGIBLE_ACCOUNT_STATUSES.has(status))) return false;
	if (includeDevelopmentAccounts) return true;

	const internalFlags = [
		profileValue(source, ["deleted"]),
		profileValue(source, ["isDeleted"]),
		profileValue(source, ["is_deleted"]),
		profileValue(source, ["suspended"]),
		profileValue(source, ["isSuspended"]),
		profileValue(source, ["is_suspended"]),
		profileValue(source, ["hidden"]),
		profileValue(source, ["isHidden"]),
		profileValue(source, ["is_hidden"]),
		profileValue(source, ["internal"]),
		profileValue(source, ["isInternal"]),
		profileValue(source, ["is_internal"]),
		profileValue(source, ["test"]),
		profileValue(source, ["isTest"]),
		profileValue(source, ["is_test"]),
		profileValue(source, ["development"]),
		profileValue(source, ["isDevelopment"]),
		profileValue(source, ["is_development"]),
		profileValue(source, ["seed"]),
		profileValue(source, ["isSeed"]),
		profileValue(source, ["is_seed"]),
		profileValue(source, ["fixture"]),
		profileValue(source, ["isFixture"]),
		profileValue(source, ["is_fixture"]),
		profileValue(source, ["placeholder"]),
		profileValue(source, ["isPlaceholder"]),
		profileValue(source, ["is_placeholder"]),
		profileValue(source, ["adminSeed"]),
		profileValue(source, ["admin_seed"]),
		profileValue(source, ["settings", "internal"]),
		profileValue(source, ["settings", "internal", "test"]),
		profileValue(source, ["settings", "internal", "isTest"]),
		profileValue(source, ["settings", "internal", "is_test"]),
		profileValue(source, ["settings", "internal", "development"]),
		profileValue(source, ["settings", "internal", "isDevelopment"]),
		profileValue(source, ["settings", "internal", "is_development"]),
		profileValue(source, ["settings", "internal", "seed"]),
		profileValue(source, ["settings", "internal", "isSeed"]),
		profileValue(source, ["settings", "internal", "is_seed"]),
		profileValue(source, ["settings", "internal", "fixture"]),
		profileValue(source, ["settings", "internal", "isFixture"]),
		profileValue(source, ["settings", "internal", "is_fixture"]),
		profileValue(source, ["settings", "internal", "placeholder"]),
		profileValue(source, ["settings", "internal", "adminSeed"]),
		profileValue(source, ["settings", "internal", "admin_seed"])
	];
	return !internalFlags.some(normalizeBooleanFlag);
}

export function isEligiblePublicReaderAccount(input: {
	username: unknown;
	profileData: unknown;
	includeDevelopmentAccounts?: boolean;
	requirePublicProfile?: boolean;
	requireDiscovery?: boolean;
	requireActivitySharing?: boolean;
}) {
	const includeDevelopmentAccounts = input.includeDevelopmentAccounts ?? shouldExposeDevelopmentReaderAccounts();
	if (!includeDevelopmentAccounts && isExcludedPublicReaderUsername(input.username)) return false;
	return isEligiblePublicReaderProfile(input.profileData, {
		includeDevelopmentAccounts,
		requirePublicProfile: input.requirePublicProfile,
		requireDiscovery: input.requireDiscovery,
		requireActivitySharing: input.requireActivitySharing
	});
}

export function publicReaderAccountFilterSql(sql: SqlTemplate, options: {
	includeDevelopmentAccounts?: boolean;
	requirePublicProfile?: boolean;
	requireDiscovery?: boolean;
	requireActivitySharing?: boolean;
} = {}) {
	const includeDevelopmentAccounts = options.includeDevelopmentAccounts ?? shouldExposeDevelopmentReaderAccounts();
	const requirePublicProfile = options.requirePublicProfile !== false;
	return sql`
		and nullif(trim(coalesce(au.username, '')), '') is not null
		and lower(coalesce(au.profile_data->>'accountStatus', au.profile_data->>'account_status', au.profile_data->>'status', au.profile_data #>> '{settings,accountStatus}', au.profile_data #>> '{settings,account_status}', au.profile_data #>> '{settings,status}', au.profile_data #>> '{settings,internal,status}', '')) <> all(${INELIGIBLE_PUBLIC_READER_STATUSES}::text[])
		and (${includeDevelopmentAccounts} = true or (
			lower(coalesce(au.username, '')) <> ${DEMO_TEST_USERNAME}
			and lower(coalesce(au.username, '')) !~ ${PUBLIC_READER_EXCLUDED_USERNAME_PATTERN_SOURCE}
			and lower(coalesce(nullif(au.profile_data->>'deleted', ''), nullif(au.profile_data->>'isDeleted', ''), nullif(au.profile_data->>'is_deleted', ''), nullif(au.profile_data->>'suspended', ''), nullif(au.profile_data->>'isSuspended', ''), nullif(au.profile_data->>'is_suspended', ''), nullif(au.profile_data->>'hidden', ''), nullif(au.profile_data->>'isHidden', ''), nullif(au.profile_data->>'is_hidden', ''), nullif(au.profile_data->>'internal', ''), nullif(au.profile_data->>'isInternal', ''), nullif(au.profile_data->>'is_internal', ''), nullif(au.profile_data->>'test', ''), nullif(au.profile_data->>'isTest', ''), nullif(au.profile_data->>'is_test', ''), nullif(au.profile_data->>'development', ''), nullif(au.profile_data->>'isDevelopment', ''), nullif(au.profile_data->>'is_development', ''), nullif(au.profile_data->>'seed', ''), nullif(au.profile_data->>'isSeed', ''), nullif(au.profile_data->>'is_seed', ''), nullif(au.profile_data->>'fixture', ''), nullif(au.profile_data->>'isFixture', ''), nullif(au.profile_data->>'is_fixture', ''), nullif(au.profile_data->>'placeholder', ''), nullif(au.profile_data->>'isPlaceholder', ''), nullif(au.profile_data->>'is_placeholder', ''), nullif(au.profile_data->>'adminSeed', ''), nullif(au.profile_data->>'admin_seed', ''), nullif(au.profile_data #>> '{settings,internal}', ''), nullif(au.profile_data #>> '{settings,internal,test}', ''), nullif(au.profile_data #>> '{settings,internal,isTest}', ''), nullif(au.profile_data #>> '{settings,internal,is_test}', ''), nullif(au.profile_data #>> '{settings,internal,development}', ''), nullif(au.profile_data #>> '{settings,internal,isDevelopment}', ''), nullif(au.profile_data #>> '{settings,internal,is_development}', ''), nullif(au.profile_data #>> '{settings,internal,seed}', ''), nullif(au.profile_data #>> '{settings,internal,isSeed}', ''), nullif(au.profile_data #>> '{settings,internal,is_seed}', ''), nullif(au.profile_data #>> '{settings,internal,fixture}', ''), nullif(au.profile_data #>> '{settings,internal,isFixture}', ''), nullif(au.profile_data #>> '{settings,internal,is_fixture}', ''), nullif(au.profile_data #>> '{settings,internal,placeholder}', ''), nullif(au.profile_data #>> '{settings,internal,adminSeed}', ''), nullif(au.profile_data #>> '{settings,internal,admin_seed}', ''), 'false')) not in ('1', 'true', 'yes')
		))
		${requirePublicProfile ? sql`and lower(coalesce(au.profile_data #>> '{settings,privacy,profileVisibility}', 'public')) <> 'private'` : sql``}
		${options.requireDiscovery ? sql`and lower(coalesce(nullif(au.profile_data #>> '{settings,privacy,allowDiscovery}', ''), 'true')) = 'true'` : sql``}
		${options.requireActivitySharing ? sql`and lower(coalesce(nullif(au.profile_data #>> '{settings,privacy,shareActivity}', ''), 'true')) = 'true'` : sql``}
	`;
}
