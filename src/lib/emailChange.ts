export const EMAIL_CHANGE_TOKEN_TTL_MINUTES = 60;

export type EmailChangeValidation =
	| { ok: true; email: string }
	| { ok: false; error: string; code: "invalid" | "same" | "duplicate" };

export type PendingEmailChangeState =
	| "pending"
	| "verified"
	| "expired"
	| "used"
	| "missing";

export function normalizeEmailForChange(value: unknown) {
	return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value: unknown) {
	const email = normalizeEmailForChange(value);
	if (!email) return false;
	if (email.length > 320) return false;
	if (email.includes("..")) return false;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateRequestedEmailChange(input: {
	currentEmail: unknown;
	newEmail: unknown;
	duplicateUserId?: unknown;
	currentUserId?: unknown;
}): EmailChangeValidation {
	const currentEmail = normalizeEmailForChange(input.currentEmail);
	const newEmail = normalizeEmailForChange(input.newEmail);
	if (!isValidEmail(newEmail)) {
		return { ok: false, code: "invalid", error: "Enter a valid email address." };
	}
	if (currentEmail && newEmail === currentEmail) {
		return { ok: false, code: "same", error: "Use a different email address than your current one." };
	}

	const duplicateUserId = String(input.duplicateUserId || "").trim();
	const currentUserId = String(input.currentUserId || "").trim();
	if (duplicateUserId && duplicateUserId !== currentUserId) {
		return { ok: false, code: "duplicate", error: "That email address is already used by another Dogeared account." };
	}
	return { ok: true, email: newEmail };
}

export function resolvePendingEmailChangeState(input: {
	found: boolean;
	usedAt?: unknown;
	expiresAt?: unknown;
	now?: Date;
}): PendingEmailChangeState {
	if (!input.found) return "missing";
	if (input.usedAt) return "used";
	const now = input.now || new Date();
	const expiresAt = new Date(String(input.expiresAt || ""));
	if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return "expired";
	return "pending";
}

export function accountDataAttachmentInvariant(before: Record<string, unknown>, after: Record<string, unknown>) {
	const stableKeys = [
		"id",
		"userBookCount",
		"ratingCount",
		"reviewCount",
		"followerCount",
		"followingCount",
		"notificationCount"
	];
	return stableKeys.every((key) => String(before[key] ?? "") === String(after[key] ?? ""));
}
