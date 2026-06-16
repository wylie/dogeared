import type { APIRoute } from "astro";
import { getEncryptionKey, resolveUserBySession, sha256Hex } from "../../lib/auth";
import { normalizeRequestedIp } from "../../lib/authHardening";
import {
	FEEDBACK_RATE_LIMIT_WINDOW_MINUTES,
	buildFeedbackEmail,
	resolveFeedbackRateLimit,
	validateFeedbackPayload
} from "../../lib/feedback";
import type { FeedbackUserContext } from "../../lib/feedback";
import { getNeonSql } from "../../lib/neon";
import { sendDogearedEmail } from "../../lib/email";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureFeedbackSchema() {
	const sql = getNeonSql();
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
	await sql`
		insert into feedback_submission_event (user_id, ip_hash, feedback_type)
		values (${input.userId || null}::uuid, ${input.ipHash}, ${input.type})
	`;
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({})) as {
			type?: unknown;
			message?: unknown;
			email?: unknown;
			website?: unknown;
			metadata?: unknown;
		};
		if (String(body?.website || "").trim()) {
			return json(200, { ok: true, message: "Thanks for helping improve Dogeared." });
		}

		const validation = validateFeedbackPayload(body);
		if (!validation.ok) return json(400, { ok: false, error: validation.error });

		const feedbackEmail = String(import.meta.env.FEEDBACK_EMAIL || "").trim();
		if (!feedbackEmail) {
			return json(500, { ok: false, error: "Feedback is not configured yet. Please try again later." });
		}

		await ensureFeedbackSchema();
		const session = await resolveUserBySession(request);
		const user = await loadFeedbackUser(session?.userId || "");
		const ipAddress = normalizeRequestedIp(request.headers.get("x-forwarded-for"))
			|| normalizeRequestedIp(request.headers.get("x-real-ip"))
			|| "unknown";
		const ipHash = sha256Hex(ipAddress);
		const recentCount = await countRecentFeedbackEvents({ ipHash, userId: user.userId });
		const rateLimit = resolveFeedbackRateLimit(recentCount);
		if (rateLimit.blocked) return json(rateLimit.status, { ok: false, error: rateLimit.message });

		const email = buildFeedbackEmail({
			type: validation.type,
			message: validation.message,
			email: validation.email,
			metadata: validation.metadata,
			user
		});
		const sendResult = await sendDogearedEmail({
			to: feedbackEmail,
			subject: email.subject,
			htmlContent: email.htmlContent,
			textContent: email.textContent
		});
		if (!sendResult.sent) {
			return json(502, { ok: false, error: "Feedback could not be sent. Try again in a moment." });
		}

		await recordFeedbackEvent({ userId: user.userId, ipHash, type: validation.type });
		return json(200, { ok: true, message: "Thanks for helping improve Dogeared." });
	} catch {
		return json(500, { ok: false, error: "Feedback could not be sent. Try again in a moment." });
	}
};
