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

export const feedbackSeverityLabels = {
	cosmetic: "Cosmetic",
	minor: "Minor",
	major: "Major",
	blocking: "Blocking"
} as const;

export type FeedbackSeverity = keyof typeof feedbackSeverityLabels;

export const feedbackStatusLabels = {
	new: "New",
	investigating: "Investigating",
	needs_more_info: "Needs More Info",
	planned: "Planned",
	fixed: "Fixed",
	closed: "Closed"
} as const;

export type FeedbackStatus = keyof typeof feedbackStatusLabels;

export type FeedbackValidationResult =
	| {
		ok: true;
		type: FeedbackType;
		severity: FeedbackSeverity | "";
		subject: string;
		description: string;
		expectedBehavior: string;
		actualBehavior: string;
		stepsToReproduce: string;
		email: string;
		metadata: FeedbackMetadata;
		screenshots: FeedbackScreenshot[];
	}
	| {
		ok: false;
		error: string;
	};

export type FeedbackMetadata = {
	pageUrl: string;
	route: string;
	timestamp: string;
	appVersion: string;
	gitCommit: string;
	userAgent: string;
	browser: string;
	operatingSystem: string;
	screenSize: string;
	viewport: string;
	colorScheme: string;
	language: string;
	authenticated: boolean;
	bookId: string;
	authorId: string;
	collectionId: string;
	searchQuery: string;
	recommendationSource: string;
	environment: string;
	featureFlags: string[];
	recentClientErrors: Array<{
		message: string;
		source: string;
		stack: string;
		timestamp: string;
	}>;
};

export type FeedbackUserContext = {
	authenticated: boolean;
	userId: string;
	username: string;
	email: string;
};

export type FeedbackScreenshot = {
	name: string;
	type: string;
	size: number;
	dataUrl: string;
};

type FeedbackPayload = {
	type?: unknown;
	severity?: unknown;
	subject?: unknown;
	description?: unknown;
	message?: unknown;
	expectedBehavior?: unknown;
	actualBehavior?: unknown;
	stepsToReproduce?: unknown;
	email?: unknown;
	metadata?: unknown;
	screenshots?: unknown;
};

function normalizeText(value: unknown, maxLength = 500) {
	return String(value || "").trim().slice(0, maxLength);
}

function normalizeFeedbackType(value: unknown): FeedbackType {
	const rawType = normalizeText(value, 40).toLowerCase();
	return Object.keys(feedbackTypeLabels).includes(rawType) ? rawType as FeedbackType : "general";
}

export function normalizeFeedbackSeverity(value: unknown): FeedbackSeverity | "" {
	const rawSeverity = normalizeText(value, 40).toLowerCase();
	return Object.keys(feedbackSeverityLabels).includes(rawSeverity) ? rawSeverity as FeedbackSeverity : "";
}

export function normalizeFeedbackStatus(value: unknown): FeedbackStatus {
	const rawStatus = normalizeText(value, 40).toLowerCase();
	return Object.keys(feedbackStatusLabels).includes(rawStatus) ? rawStatus as FeedbackStatus : "new";
}

export function isValidFeedbackEmail(value: unknown) {
	const normalized = normalizeText(value, 320).toLowerCase();
	if (!normalized) return true;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeFeedbackMetadata(value: unknown): FeedbackMetadata {
	const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const recentClientErrors = Array.isArray(source.recentClientErrors)
		? source.recentClientErrors
			.slice(0, 5)
			.map((item) => {
				const error = item && typeof item === "object" ? item as Record<string, unknown> : {};
				return {
					message: normalizeText(error.message, 500),
					source: normalizeText(error.source, 500),
					stack: normalizeText(error.stack, 1600),
					timestamp: normalizeText(error.timestamp, 80)
				};
			})
			.filter((item) => item.message)
		: [];
	const featureFlags = Array.isArray(source.featureFlags)
		? source.featureFlags.map((item) => normalizeText(item, 80)).filter(Boolean).slice(0, 20)
		: [];
	return {
		pageUrl: normalizeText(source.pageUrl, 1000),
		route: normalizeText(source.route, 240),
		timestamp: normalizeText(source.timestamp, 80),
		appVersion: normalizeText(source.appVersion, 80),
		gitCommit: normalizeText(source.gitCommit, 80),
		userAgent: normalizeText(source.userAgent, 500),
		browser: normalizeText(source.browser, 160),
		operatingSystem: normalizeText(source.operatingSystem, 160),
		screenSize: normalizeText(source.screenSize, 80),
		viewport: normalizeText(source.viewport, 80),
		colorScheme: normalizeText(source.colorScheme, 20),
		language: normalizeText(source.language, 80),
		authenticated: source.authenticated === true,
		bookId: normalizeText(source.bookId, 80),
		authorId: normalizeText(source.authorId, 80),
		collectionId: normalizeText(source.collectionId, 80),
		searchQuery: normalizeText(source.searchQuery, 240),
		recommendationSource: normalizeText(source.recommendationSource, 160),
		environment: normalizeText(source.environment, 80),
		featureFlags,
		recentClientErrors
	};
}

export function normalizeFeedbackScreenshots(value: unknown): FeedbackScreenshot[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, 3)
		.map((item) => {
			const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
			return {
				name: normalizeText(source.name, 160) || "screenshot",
				type: normalizeText(source.type, 80) || "image/png",
				size: Math.max(0, Math.floor(Number(source.size || 0) || 0)),
				dataUrl: normalizeText(source.dataUrl, 1_500_000)
			};
		})
		.filter((item) => (
			item.dataUrl.startsWith("data:image/")
			&& item.size <= 1_500_000
		));
}

export function validateFeedbackPayload(payload: FeedbackPayload): FeedbackValidationResult {
	const type = normalizeFeedbackType(payload.type);
	const severity = type === "general" ? "" : normalizeFeedbackSeverity(payload.severity);
	const subject = normalizeText(payload.subject, 160);
	const description = normalizeText(payload.description || payload.message, 6000);
	const expectedBehavior = normalizeText(payload.expectedBehavior, 2000);
	const actualBehavior = normalizeText(payload.actualBehavior, 2000);
	const stepsToReproduce = normalizeText(payload.stepsToReproduce, 3000);
	const email = normalizeText(payload.email, 320).toLowerCase();

	if (description.length < 10) {
		return { ok: false, error: "Please add a little more detail before sending feedback." };
	}
	if (!isValidFeedbackEmail(email)) {
		return { ok: false, error: "Use a valid email address, or leave the email field blank." };
	}

	return {
		ok: true,
		type,
		severity,
		subject,
		description,
		expectedBehavior,
		actualBehavior,
		stepsToReproduce,
		email,
		metadata: normalizeFeedbackMetadata(payload.metadata),
		screenshots: normalizeFeedbackScreenshots(payload.screenshots)
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
	severity: FeedbackSeverity | "";
	subject: string;
	description: string;
	expectedBehavior: string;
	actualBehavior: string;
	stepsToReproduce: string;
	email: string;
	metadata: FeedbackMetadata;
	user: FeedbackUserContext;
	trackingNumber?: string;
}) {
	const typeLabel = feedbackTypeLabels[input.type];
	const severityLabel = input.severity ? feedbackSeverityLabels[input.severity] : "Not set";
	const from = input.user.username
		? `@${input.user.username}`
		: input.user.authenticated
			? `DogEared user ${input.user.userId}`
			: "Anonymous reader";
	const replyEmail = input.email || input.user.email || "Not provided";
	const authenticated = input.user.authenticated ? "yes" : "no";
	const timestamp = input.metadata.timestamp || new Date().toISOString();
	const title = input.subject || input.description.slice(0, 80) || typeLabel;

	const textContent = [
		input.trackingNumber ? `Tracking:\n${input.trackingNumber}` : "",
		`Type:\n${typeLabel}`,
		`Severity:\n${severityLabel}`,
		`Subject:\n${title}`,
		`From:\n${from}`,
		`Email:\n${replyEmail}`,
		`Page:\n${input.metadata.pageUrl || "Not provided"}`,
		`Route:\n${input.metadata.route || "Not provided"}`,
		`Timestamp:\n${timestamp}`,
		`Description:\n${input.description}`,
		input.expectedBehavior ? `Expected behavior:\n${input.expectedBehavior}` : "",
		input.actualBehavior ? `Actual behavior:\n${input.actualBehavior}` : "",
		input.stepsToReproduce ? `Steps to reproduce:\n${input.stepsToReproduce}` : "",
		[
			"Environment:",
			`App version: ${input.metadata.appVersion || "Not provided"}`,
			`Git commit: ${input.metadata.gitCommit || "Not provided"}`,
			`Environment: ${input.metadata.environment || "Not provided"}`,
			`Viewport: ${input.metadata.viewport || "Not provided"}`,
			`Screen: ${input.metadata.screenSize || "Not provided"}`,
			`Browser: ${input.metadata.browser || input.metadata.userAgent || "Not provided"}`,
			`OS: ${input.metadata.operatingSystem || "Not provided"}`,
			`Language: ${input.metadata.language || "Not provided"}`,
			`Color scheme: ${input.metadata.colorScheme || "Not provided"}`,
			`Authenticated: ${authenticated}`,
			`User ID: ${input.user.userId || "Not provided"}`,
			`Book ID: ${input.metadata.bookId || "Not provided"}`,
			`Author ID: ${input.metadata.authorId || "Not provided"}`,
			`Collection ID: ${input.metadata.collectionId || "Not provided"}`,
			`Search query: ${input.metadata.searchQuery || "Not provided"}`,
			`Recommendation source: ${input.metadata.recommendationSource || "Not provided"}`
		].join("\n"),
		input.metadata.recentClientErrors.length > 0
			? `Recent client errors:\n${input.metadata.recentClientErrors.map((error) => `- ${error.message}\n  ${error.source}\n  ${error.stack}`).join("\n")}`
			: ""
	].filter(Boolean).join("\n\n");

	const htmlContent = `
		<h2>DogEared Feedback</h2>
		${input.trackingNumber ? `<p><strong>Tracking:</strong><br>${escapeEmailHtml(input.trackingNumber)}</p>` : ""}
		<p><strong>Type:</strong><br>${escapeEmailHtml(typeLabel)}</p>
		<p><strong>Severity:</strong><br>${escapeEmailHtml(severityLabel)}</p>
		<p><strong>Subject:</strong><br>${escapeEmailHtml(title)}</p>
		<p><strong>From:</strong><br>${escapeEmailHtml(from)}</p>
		<p><strong>Email:</strong><br>${escapeEmailHtml(replyEmail)}</p>
		<p><strong>Page:</strong><br>${escapeEmailHtml(input.metadata.pageUrl || "Not provided")}</p>
		<p><strong>Route:</strong><br>${escapeEmailHtml(input.metadata.route || "Not provided")}</p>
		<p><strong>Timestamp:</strong><br>${escapeEmailHtml(timestamp)}</p>
		<p><strong>Description:</strong></p>
		<pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(input.description)}</pre>
		${input.expectedBehavior ? `<p><strong>Expected behavior:</strong></p><pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(input.expectedBehavior)}</pre>` : ""}
		${input.actualBehavior ? `<p><strong>Actual behavior:</strong></p><pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(input.actualBehavior)}</pre>` : ""}
		${input.stepsToReproduce ? `<p><strong>Steps to reproduce:</strong></p><pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(input.stepsToReproduce)}</pre>` : ""}
		<p><strong>Environment:</strong><br>
			App version: ${escapeEmailHtml(input.metadata.appVersion || "Not provided")}<br>
			Git commit: ${escapeEmailHtml(input.metadata.gitCommit || "Not provided")}<br>
			Environment: ${escapeEmailHtml(input.metadata.environment || "Not provided")}<br>
			Viewport: ${escapeEmailHtml(input.metadata.viewport || "Not provided")}<br>
			Screen: ${escapeEmailHtml(input.metadata.screenSize || "Not provided")}<br>
			Browser: ${escapeEmailHtml(input.metadata.browser || input.metadata.userAgent || "Not provided")}<br>
			OS: ${escapeEmailHtml(input.metadata.operatingSystem || "Not provided")}<br>
			Language: ${escapeEmailHtml(input.metadata.language || "Not provided")}<br>
			Color scheme: ${escapeEmailHtml(input.metadata.colorScheme || "Not provided")}<br>
			Authenticated: ${escapeEmailHtml(authenticated)}<br>
			User ID: ${escapeEmailHtml(input.user.userId || "Not provided")}<br>
			Book ID: ${escapeEmailHtml(input.metadata.bookId || "Not provided")}<br>
			Author ID: ${escapeEmailHtml(input.metadata.authorId || "Not provided")}<br>
			Collection ID: ${escapeEmailHtml(input.metadata.collectionId || "Not provided")}<br>
			Search query: ${escapeEmailHtml(input.metadata.searchQuery || "Not provided")}<br>
			Recommendation source: ${escapeEmailHtml(input.metadata.recommendationSource || "Not provided")}
		</p>
		${input.metadata.recentClientErrors.length > 0 ? `
			<p><strong>Recent client errors:</strong></p>
			<ul>${input.metadata.recentClientErrors.map((error) => `<li>${escapeEmailHtml(error.message)}<br><small>${escapeEmailHtml(error.source)}</small><pre style="white-space:pre-wrap;font-family:inherit;">${escapeEmailHtml(error.stack)}</pre></li>`).join("")}</ul>
		` : ""}
	`;

	return {
		subject: `[DogEared Feedback] ${input.trackingNumber ? `${input.trackingNumber} ` : ""}${typeLabel}: ${title}`,
		textContent,
		htmlContent
	};
}

export function formatFeedbackTrackingNumber(id: unknown) {
	const numeric = Math.max(0, Math.floor(Number(id) || 0));
	return numeric > 0 ? `DE-${String(numeric).padStart(5, "0")}` : "";
}

export async function ensureBetaFeedbackSchema(sql: any) {
	await sql`
		create table if not exists feedback_submission_event (
			id bigserial primary key,
			user_id uuid references app_user(id) on delete set null,
			ip_hash text not null default '',
			feedback_type text not null default 'general',
			created_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_feedback_submission_event_ip on feedback_submission_event(ip_hash, created_at desc)`;
	await sql`create index if not exists idx_feedback_submission_event_user on feedback_submission_event(user_id, created_at desc)`;
	await sql`
		create table if not exists feedback_submission (
			id bigserial primary key,
			tracking_number text not null default '',
			user_id uuid references app_user(id) on delete set null,
			email text not null default '',
			feedback_type text not null default 'general',
			severity text not null default '',
			status text not null default 'new',
			subject text not null default '',
			description text not null default '',
			expected_behavior text not null default '',
			actual_behavior text not null default '',
			steps_to_reproduce text not null default '',
			page_url text not null default '',
			route text not null default '',
			app_version text not null default '',
			git_commit text not null default '',
			browser text not null default '',
			operating_system text not null default '',
			screen_size text not null default '',
			viewport_size text not null default '',
			color_scheme text not null default '',
			language text not null default '',
			is_authenticated boolean not null default false,
			book_id text not null default '',
			author_id text not null default '',
			collection_id text not null default '',
			search_query text not null default '',
			recommendation_source text not null default '',
			diagnostic_context jsonb not null default '{}'::jsonb,
			screenshots jsonb not null default '[]'::jsonb,
			admin_notes text not null default '',
			needs_reply boolean not null default false,
			needs_reproduction boolean not null default false,
			is_duplicate boolean not null default false,
			duplicate_of text not null default '',
			resolved_in_version text not null default '',
			resolved_at timestamptz,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		)
	`;
	await sql`create index if not exists idx_feedback_submission_status_created on feedback_submission(status, created_at desc)`;
	await sql`create index if not exists idx_feedback_submission_type_created on feedback_submission(feedback_type, created_at desc)`;
	await sql`create index if not exists idx_feedback_submission_user_created on feedback_submission(user_id, created_at desc)`;
}
