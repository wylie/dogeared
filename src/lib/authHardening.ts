const MAGIC_LINK_TTL_SECONDS = 20 * 60;
const MAGIC_LINK_EMAIL_COOLDOWN_SECONDS = 60;
const MAGIC_LINK_MAX_REQUESTS_PER_IP_WINDOW = 12;

function toInt(value: unknown, fallback = 0) {
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(0, Math.floor(n));
}

export function normalizeRequestedIp(value: unknown) {
	const raw = String(value || "").trim();
	if (!raw) return "";
	const first = raw.split(",")[0]?.trim() || "";
	return first.slice(0, 120);
}

export function resolveMagicLinkEmailCooldownSeconds(secondsUntilExpiry: unknown) {
	const remaining = toInt(secondsUntilExpiry, 0);
	const threshold = MAGIC_LINK_TTL_SECONDS - MAGIC_LINK_EMAIL_COOLDOWN_SECONDS;
	if (remaining <= threshold) return 0;
	return remaining - threshold;
}

export function resolveMagicLinkRateLimit(params: {
	secondsUntilLatestUnusedLinkExpiry: unknown;
	recentIpRequestCount: unknown;
}) {
	const cooldownSeconds = resolveMagicLinkEmailCooldownSeconds(params.secondsUntilLatestUnusedLinkExpiry);
	if (cooldownSeconds > 0) {
		return {
			blocked: true,
			status: 429,
			retryAfterSeconds: cooldownSeconds,
			message: "Please wait before requesting another sign-in link."
		};
	}

	const recentIpRequestCount = toInt(params.recentIpRequestCount, 0);
	if (recentIpRequestCount >= MAGIC_LINK_MAX_REQUESTS_PER_IP_WINDOW) {
		return {
			blocked: true,
			status: 429,
			retryAfterSeconds: 60,
			message: "Too many sign-in link requests. Please try again shortly."
		};
	}

	return {
		blocked: false,
		status: 200,
		retryAfterSeconds: 0,
		message: ""
	};
}

