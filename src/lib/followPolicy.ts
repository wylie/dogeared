function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function canFollowUser(viewerUserId: unknown, targetUserId: unknown) {
	const viewer = normalizeText(viewerUserId);
	const target = normalizeText(targetUserId);
	if (!viewer) return { ok: false, error: "You must be logged in to follow users." };
	if (!target) return { ok: false, error: "Target user is required." };
	if (viewer === target) return { ok: false, error: "You cannot follow yourself." };
	return { ok: true };
}
