import type { APIRoute } from "astro";
import { getEncryptionKey, normalizeEmail, randomToken, resolveUserBySession, sha256Hex } from "../../../lib/auth";
import { normalizeRequestedIp } from "../../../lib/authHardening";
import { EMAIL_CHANGE_TOKEN_TTL_MINUTES, validateRequestedEmailChange } from "../../../lib/emailChange";
import { escapeEmailHtml, sendDogearedEmail } from "../../../lib/email";
import { getNeonSql } from "../../../lib/neon";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function ensureEmailChangeSchema() {
	const sql = getNeonSql();
	await sql`
		create table if not exists account_email_change (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references app_user(id) on delete cascade,
			new_email_hash text not null,
			new_email_enc bytea not null,
			token_hash text not null unique,
			requested_ip text not null default '',
			user_agent text not null default '',
			expires_at timestamptz not null,
			used_at timestamptz,
			created_at timestamptz not null default now(),
			verified_at timestamptz
		)
	`;
	await sql`create index if not exists idx_account_email_change_user on account_email_change(user_id, created_at desc)`;
	await sql`create index if not exists idx_account_email_change_token on account_email_change(token_hash)`;
	await sql`create index if not exists idx_account_email_change_expires on account_email_change(expires_at)`;
}

async function sendVerificationEmail(email: string, verifyUrl: string) {
	return sendDogearedEmail({
		to: email,
		subject: "Verify your new DogEared email",
		htmlContent: `
			<p>Confirm this email address for your DogEared account:</p>
			<p><a href="${escapeEmailHtml(verifyUrl)}">${escapeEmailHtml(verifyUrl)}</a></p>
			<p>This link expires in ${EMAIL_CHANGE_TOKEN_TTL_MINUTES} minutes.</p>
			<p>Your reading history, shelves, ratings, and reviews stay with your account.</p>
		`,
		textContent: `Confirm this email address for your DogEared account: ${verifyUrl}\n\nThis link expires in ${EMAIL_CHANGE_TOKEN_TTL_MINUTES} minutes.\n\nYour reading history, shelves, ratings, and reviews stay with your account.`
	});
}

async function loadAccountState(userId: string) {
	const sql = getNeonSql();
	const encryptionKey = getEncryptionKey();
	const rows = await sql<Array<{
		current_email: string;
		pending_email: string;
		pending_expires_at: string | null;
	}>>`
		select
			coalesce(pgp_sym_decrypt(au.email_enc, ${encryptionKey}), '') as current_email,
			coalesce(pgp_sym_decrypt(pending.new_email_enc, ${encryptionKey}), '') as pending_email,
			pending.expires_at::text as pending_expires_at
		from app_user au
		left join lateral (
			select new_email_enc, expires_at
			from account_email_change
			where user_id = au.id
				and used_at is null
				and expires_at > now()
			order by created_at desc
			limit 1
		) pending on true
		where au.id = ${userId}::uuid
		limit 1
	`;
	return {
		currentEmail: String(rows[0]?.current_email || ""),
		pendingEmail: String(rows[0]?.pending_email || ""),
		pendingExpiresAt: rows[0]?.pending_expires_at ? String(rows[0].pending_expires_at) : ""
	};
}

export const GET: APIRoute = async ({ request }) => {
	try {
		await ensureEmailChangeSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to view account email settings." });
		const state = await loadAccountState(session.userId);
		return json(200, { ok: true, ...state });
	} catch {
		return json(500, { error: "Failed to load email settings." });
	}
};

export const POST: APIRoute = async ({ request, url }) => {
	try {
		await ensureEmailChangeSchema();
		const session = await resolveUserBySession(request);
		if (!session?.userId) return json(401, { error: "You must be logged in to change your email." });

		const body = await request.json().catch(() => ({})) as { email?: unknown; action?: unknown };
		const action = String(body?.action || "request").trim().toLowerCase();
		const sql = getNeonSql();
		const encryptionKey = getEncryptionKey();
		let newEmail = normalizeEmail(body?.email);
		const accountState = await loadAccountState(session.userId);

		if (action === "resend") {
			newEmail = normalizeEmail(accountState.pendingEmail);
			if (!newEmail) return json(400, { error: "No pending email change is waiting for verification." });
		}

		const duplicateHash = newEmail ? sha256Hex(newEmail) : "";
		const duplicateRows = duplicateHash
			? await sql<Array<{ id: string }>>`
				select id::text as id
				from app_user
				where email_hash = ${duplicateHash}
				limit 1
			`
			: [];
		const validation = validateRequestedEmailChange({
			currentEmail: accountState.currentEmail,
			newEmail,
			duplicateUserId: duplicateRows[0]?.id || "",
			currentUserId: session.userId
		});
		if (!validation.ok) return json(validation.code === "duplicate" ? 409 : 400, { error: validation.error });

		const token = randomToken(32);
		const tokenHash = sha256Hex(token);
		await sql`
			update account_email_change
			set used_at = now()
			where user_id = ${session.userId}::uuid
				and used_at is null
				and expires_at > now()
		`;
		await sql`
			insert into account_email_change (
				user_id,
				new_email_hash,
				new_email_enc,
				token_hash,
				requested_ip,
				user_agent,
				expires_at
			)
			values (
				${session.userId}::uuid,
				${sha256Hex(validation.email)},
				pgp_sym_encrypt(${validation.email}, ${encryptionKey}),
				${tokenHash},
				${normalizeRequestedIp(request.headers.get("x-forwarded-for"))},
				${String(request.headers.get("user-agent") || "").slice(0, 500)},
				now() + (${`${EMAIL_CHANGE_TOKEN_TTL_MINUTES} minutes`})::interval
			)
		`;

		const verifyUrl = new URL("/account/email/verify", url.origin);
		verifyUrl.searchParams.set("token", token);
		const sendResult = await sendVerificationEmail(validation.email, verifyUrl.toString());
		const isDevHost = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
		return json(sendResult.sent ? 200 : 202, {
			ok: true,
			sent: sendResult.sent,
			currentEmail: accountState.currentEmail,
			pendingEmail: validation.email,
			pendingExpiresAt: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
			message: sendResult.sent
				? "Verification email sent."
				: "Email change saved, but the verification email could not be sent. Try Resend Verification.",
			previewUrl: isDevHost ? verifyUrl.toString() : undefined
		});
	} catch {
		return json(500, { error: "Failed to start email change. Try again in a moment." });
	}
};
