function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function canSetUsername(existingUsername: unknown, nextUsername: unknown) {
	const existing = normalizeText(existingUsername).toLowerCase();
	const next = normalizeText(nextUsername).toLowerCase();
	if (!existing) return { ok: true };
	if (existing === next) return { ok: true };
	return {
		ok: false,
		error: "Username changes are not available yet."
	};
}
