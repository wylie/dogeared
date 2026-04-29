export type ProfileVisibility = "public" | "private";

export type PrivacySettings = {
	profileVisibility: ProfileVisibility;
	shareLocation: boolean;
	shareActivity: boolean;
};

export type ViewerProfileAccess = {
	canViewProfile: boolean;
	canEditProfile: boolean;
	canViewLocation: boolean;
	canViewActivity: boolean;
};

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
	profileVisibility: "public",
	shareLocation: true,
	shareActivity: true
};

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

function toBool(value: unknown, fallback: boolean) {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lowered = value.trim().toLowerCase();
		if (lowered === "true") return true;
		if (lowered === "false") return false;
	}
	return fallback;
}

export function resolvePrivacySettings(profileData: unknown): PrivacySettings {
	const source = profileData && typeof profileData === "object" ? profileData as Record<string, unknown> : {};
	const settings = source.settings && typeof source.settings === "object" ? source.settings as Record<string, unknown> : {};
	const privacy = settings.privacy && typeof settings.privacy === "object" ? settings.privacy as Record<string, unknown> : {};
	const profileVisibility = normalizeText(privacy.profileVisibility).toLowerCase() === "private" ? "private" : "public";
	return {
		profileVisibility,
		shareLocation: toBool(privacy.shareLocation, DEFAULT_PRIVACY_SETTINGS.shareLocation),
		shareActivity: toBool(privacy.shareActivity, DEFAULT_PRIVACY_SETTINGS.shareActivity)
	};
}

export function resolveViewerProfileAccess(input: {
	viewerUserId: string;
	targetUserId: string;
	privacy: PrivacySettings;
}): ViewerProfileAccess {
	const isOwner = !!input.viewerUserId && input.viewerUserId === input.targetUserId;
	if (isOwner) {
		return {
			canViewProfile: true,
			canEditProfile: true,
			canViewLocation: true,
			canViewActivity: true
		};
	}
	if (input.privacy.profileVisibility === "private") {
		return {
			canViewProfile: false,
			canEditProfile: false,
			canViewLocation: false,
			canViewActivity: false
		};
	}
	return {
		canViewProfile: true,
		canEditProfile: false,
		canViewLocation: input.privacy.shareLocation,
		canViewActivity: input.privacy.shareActivity
	};
}
