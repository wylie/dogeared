import { escapeEmailHtml } from "./email.ts";

export const FEEDBACK_MAX_PER_WINDOW = 5;
export const FEEDBACK_RATE_LIMIT_WINDOW_MINUTES = 60;

export const feedbackTypeLabels = {
	bug: "Bug Report",
	feature: "Feature Request",
	general: "General Feedback",
	question: "Question"
} as const;

export type FeedbackType = keyof typeof feedbackTypeLabels;

export type FeedbackValidationResult =
	| {
		ok: true;
		type: FeedbackType;
		message: string;
		email: string;
		metadata: FeedbackMetadata;
	}
	| {
		ok: false;
		error: string;
	};

export type FeedbackMetadata = {
	pageUrl: string;
	timestamp: string;
	userAgent: string;
	viewport: string;
};

export type FeedbackUserContext = {
	authenticated: boolean;
	userId: string;
	username: string;
	email: string;
};

type FeedbackPayload = {
	type?: unknown;
	message?: unknown;
	email?: unknown;
	metadata?: unknown;
};

function normalizeText(value: unknown, maxLength = 500) {
	return String(value || "").trim().slice(0, maxLength);
}

export function isValidFeedbackEmail(value: unknown) {
	const normalized = normalizeText(value, 320).toLowerCase();
	if (!normalized) return true;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeFeedbackMetadata(value: unknown): FeedbackMetadata {
	const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
	return {
		pageUrl: normalizeText(source.pageUrl, 1000),
		timestamp: normalizeText(source.timestamp, 80),
		userAgent: normalizeText(source.userAgent, 500),
		viewport: normalizeText(source.viewport, 80)
	};
}

export function validateFeedbackPayload(payload: FeedbackPayload): FeedbackValidationResult {
	const rawType = normalizeText(payload.type, 40).toLowerCase();
	const type = Object.keys(feedbackTypeLabels).includes(rawType) ? rawType as FeedbackType : "general";
	const message = normalizeText(payload.message, 4000);
	const email = normalizeText(payload.email, 320).toLowerCase();

	if (message.length < 10) {
		return { ok: false, error: "Please add a little more detail before sending feedback." };
	}
	if (!isValidFeedbackEmail(email)) {
		return { ok: false, error: "Use a valid email address, or leave the email field blank." };
	}

	return {
		ok: true,
		type,
		message,
		email,
		metadata: normalizeFeedbackMetadata(payload.metadata)
	};
}

export function resolveFeedbackRateLimit(recentSubmissionCount: unknown) {
	const count = Math.max(0, Math.floor(Number(recentSubmissionCount) || 0));
	if (count >= FEEDBACK_MAX_PER_WINDOW) {
		return {
			blocked: true,
			status: 429,
			message: "Too much feedback was sent from this browser recently. Please try again later."
		};
	}
	return {
		blocked: false,
		status: 200,
		message: ""
	};
}

export function buildFeedbackEmail(input: {
	type: FeedbackType;
	message: string;
	email: string;
	metadata: FeedbackMetadata;
	user: FeedbackUserContext;
}) {
	const typeLabel = feedbackTypeLabels[input.type];
	const from = input.user.username
		? `@${input.user.username}`
		: input.user.authenticated
			? `DogEared user ${input.user.userId}`
			: "Anonymous reader";
	const replyEmail = input.email || input.user.email || "Not provided";
	const authenticated = input.user.authenticated ? "yes" : "no";
	const timestamp = input.metadata.timestamp || new Date().toISOString();

	const textContent = [
		`Type:\n${typeLabel}`,
		`From:\n${from}`,
		`Email:\n${replyEmail}`,
		`Page:\n${input.metadata.pageUrl || "Not provided"}`,
		`Timestamp:\n${timestamp}`,
		`Message:\n${input.message}`,
		[
			"Environment:",
			`Viewport: ${input.metadata.viewport || "Not provided"}`,
			`Browser: ${input.metadata.userAgent || "Not provided"}`,
			`Authenticated: ${authenticated}`,
			`User ID: ${input.user.userId || "Not provided"}`
		].join("\n")
	].join("\n\n");

	const htmlContent = `
		<h2>DogEared Feedback</h2>
		<p><strong>Type:</strong><br>${escapeEmailHtml(typeLabel)}</p>
		<p><strong>From:</strong><br>${escapeEmailHtml(from)}</p>
		<p><strong>Email:</strong><br>${escapeEmailHtml(replyEmail)}</p>
		<p><strong>Page:</strong><br>${escapeEmailHtml(input.metadata.pageUrl || "Not provided")}</p>
		<p><strong>Timestamp:</strong><br>${escapeEmailHtml(timestamp)}</p>
		<p><strong>Message:</strong></p>
		<pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(input.message)}</pre>
		<p><strong>Environment:</strong><br>
			Viewport: ${escapeEmailHtml(input.metadata.viewport || "Not provided")}<br>
			Browser: ${escapeEmailHtml(input.metadata.userAgent || "Not provided")}<br>
			Authenticated: ${escapeEmailHtml(authenticated)}<br>
			User ID: ${escapeEmailHtml(input.user.userId || "Not provided")}
		</p>
	`;

	return {
		subject: `[DogEared Feedback] ${typeLabel}`,
		textContent,
		htmlContent
	};
}
