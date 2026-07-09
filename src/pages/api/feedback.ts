import type { APIRoute } from "astro";
import { resolveAdminSession } from "../../lib/admin";
import { getEncryptionKey, resolveUserBySession, sha256Hex } from "../../lib/auth";
import { normalizeRequestedIp } from "../../lib/authHardening";
import {
	buildFeedbackEmail,
	ensureBetaFeedbackSchema,
	FEEDBACK_RATE_LIMIT_WINDOW_MINUTES,
	formatFeedbackTrackingNumber,
	resolveFeedbackRateLimit,
	validateFeedbackPayload
} from "../../lib/feedback";
import type { FeedbackUserContext } from "../../lib/feedback";
import { getNeonSql } from "../../lib/neon";
import { sendDogearedEmail } from "../../lib/email";
import { recordAdminFeedbackIssue } from "../../lib/adminData";
import { loadLatestPublishedRelease } from "../../lib/releases";
import { resolveAppVersion, resolveGitCommit } from "../../lib/versionInfo";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function loadFeedbackUser(userId: string): Promise<FeedbackUserContext> {
	if (!userId) {
		return { authenticated: false, userId: "", username: "", email: "" };
	}

	const sql = getNeonSql();
	const encryptionKey = getEncryptionKey();
	const rows = await sql<Array<{ id: string; username: string | null; email: string | null }>>`
		select
			id::text as id,
			username,
			coalesce(pgp_sym_decrypt(email_enc, ${encryptionKey}), '') as email
		from app_user
		where id = ${userId}::uuid
		limit 1
	`;
	const row = rows[0];
	if (!row?.id) return { authenticated: false, userId: "", username: "", email: "" };
	return {
		authenticated: true,
		userId: String(row.id || ""),
		username: String(row.username || ""),
		email: String(row.email || "")
	};
}

async function countRecentFeedbackEvents(input: { ipHash: string; userId: string }) {
	const sql = getNeonSql();
	const userId = input.userId || "00000000-0000-0000-0000-000000000000";
	const hasUser = Boolean(input.userId);
	const rows = await sql<Array<{ count: number }>>`
		select count(*)::int as count
		from feedback_submission_event
		where created_at >= now() - (${`${FEEDBACK_RATE_LIMIT_WINDOW_MINUTES} minutes`})::interval
			and (
				ip_hash = ${input.ipHash}
				or (${hasUser}::boolean and user_id = ${userId}::uuid)
			)
	`;
	return Number(rows[0]?.count || 0);
}

async function recordFeedbackEvent(input: { userId: string; ipHash: string; type: string }) {
	const sql = getNeonSql();
	const rows = await sql<Array<{ id: number }>>`
		insert into feedback_submission_event (user_id, ip_hash, feedback_type)
		values (${input.userId || null}::uuid, ${input.ipHash}, ${input.type})
		returning id
	`;
	return Number(rows[0]?.id || 0);
}

function resolveServerAppVersion() {
	return resolveAppVersion();
}

function resolveServerGitCommit() {
	return resolveGitCommit();
}

function resolveServerEnvironment() {
	return String(import.meta.env.VERCEL_ENV || import.meta.env.MODE || "development").trim();
}

async function resolveServerReleaseVersion(sql: ReturnType<typeof getNeonSql>) {
	const latestRelease = await loadLatestPublishedRelease(sql).catch(() => null);
	return latestRelease?.version || resolveServerAppVersion();
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({})) as {
			type?: unknown;
			severity?: unknown;
			subject?: unknown;
			description?: unknown;
			message?: unknown;
			expectedBehavior?: unknown;
			actualBehavior?: unknown;
			stepsToReproduce?: unknown;
			email?: unknown;
			website?: unknown;
			metadata?: unknown;
			screenshots?: unknown;
		};
		if (String(body?.website || "").trim()) {
			return json(200, { ok: true, message: "Thanks for helping improve DogEared." });
		}

		const validation = validateFeedbackPayload(body);
		if (!validation.ok) return json(400, { ok: false, error: validation.error });

		const sql = getNeonSql();
		await ensureBetaFeedbackSchema(sql);
		const session = await resolveUserBySession(request);
		const user = await loadFeedbackUser(session?.userId || "");
		const admin = session?.userId ? await resolveAdminSession(request) : { isAdmin: false, userId: "", username: "" };
		const ipAddress = normalizeRequestedIp(request.headers.get("x-forwarded-for"))
			|| normalizeRequestedIp(request.headers.get("x-real-ip"))
			|| "unknown";
		const ipHash = sha256Hex(ipAddress);
		const recentCount = await countRecentFeedbackEvents({ ipHash, userId: user.userId });
		const rateLimit = resolveFeedbackRateLimit(recentCount);
		if (rateLimit.blocked) return json(rateLimit.status, { ok: false, error: rateLimit.message });

		const metadata = {
			...validation.metadata,
			appVersion: validation.metadata.appVersion || resolveServerAppVersion(),
			releaseVersion: validation.metadata.releaseVersion || await resolveServerReleaseVersion(sql),
			gitCommit: validation.metadata.gitCommit || resolveServerGitCommit(),
			environment: validation.metadata.environment || resolveServerEnvironment()
		};
		const diagnosticContext = {
			metadata,
			admin: admin.isAdmin ? {
				route: metadata.route,
				environment: metadata.environment,
				featureFlags: metadata.featureFlags,
				relevantIds: {
					bookId: metadata.bookId,
					authorId: metadata.authorId,
					collectionId: metadata.collectionId,
					searchQuery: metadata.searchQuery,
					recommendationSource: metadata.recommendationSource
				},
				recentClientErrors: metadata.recentClientErrors
			} : null
		};
		const insertRows = await sql<Array<{ id: number }>>`
			insert into feedback_submission (
				user_id,
				email,
				feedback_type,
				severity,
				status,
				subject,
				description,
				expected_behavior,
				actual_behavior,
				steps_to_reproduce,
				page_url,
				route,
				app_version,
				git_commit,
				browser,
				operating_system,
				screen_size,
				viewport_size,
				color_scheme,
				language,
				is_authenticated,
				book_id,
				author_id,
				collection_id,
				search_query,
				recommendation_source,
				diagnostic_context,
				screenshots
			)
			values (
				${user.userId || null}::uuid,
				${validation.email || user.email || ""},
				${validation.type},
				${validation.severity},
				'new',
				${validation.subject},
				${validation.description},
				${validation.expectedBehavior},
				${validation.actualBehavior},
				${validation.stepsToReproduce},
				${metadata.pageUrl},
				${metadata.route},
				${metadata.appVersion},
				${metadata.gitCommit},
				${metadata.browser || metadata.userAgent},
				${metadata.operatingSystem},
				${metadata.screenSize},
				${metadata.viewport},
				${metadata.colorScheme},
				${metadata.language},
				${user.authenticated},
				${metadata.bookId},
				${metadata.authorId},
				${metadata.collectionId},
				${metadata.searchQuery},
				${metadata.recommendationSource},
				${JSON.stringify(diagnosticContext)}::jsonb,
				${JSON.stringify(validation.screenshots)}::jsonb
			)
			returning id
		`;
		const trackingNumber = formatFeedbackTrackingNumber(insertRows[0]?.id);
		if (trackingNumber) {
			await sql`
				update feedback_submission
				set tracking_number = ${trackingNumber}
				where id = ${Number(insertRows[0]?.id || 0)}
			`;
		}

		const email = buildFeedbackEmail({
			type: validation.type,
			severity: validation.severity,
			subject: validation.subject,
			description: validation.description,
			expectedBehavior: validation.expectedBehavior,
			actualBehavior: validation.actualBehavior,
			stepsToReproduce: validation.stepsToReproduce,
			email: validation.email,
			metadata,
			user,
			trackingNumber
		});
		const feedbackEmail = String(import.meta.env.FEEDBACK_EMAIL || "").trim();
		if (feedbackEmail) {
			const sendResult = await sendDogearedEmail({
				to: feedbackEmail,
				subject: email.subject,
				htmlContent: email.htmlContent,
				textContent: email.textContent
			});
			if (!sendResult.sent) {
				console.warn("[feedback.email.failed]", sendResult.error || "Email provider rejected feedback notification.");
			}
		}

		await recordFeedbackEvent({ userId: user.userId, ipHash, type: validation.type });
		return json(200, {
			ok: true,
			message: "Thanks for helping improve DogEared.",
			trackingNumber
		});
	} catch (error) {
		console.error("[feedback.submit.failed]", error);
		return json(500, { ok: false, error: "Feedback could not be sent. Try again in a moment." });
	}
};
