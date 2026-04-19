import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { getEncryptionKey, normalizeEmail, randomToken, sha256Hex } from "../../../lib/auth";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function upsertUserByEmail(email: string) {
	const sql = getNeonSql();
	const encryptionKey = getEncryptionKey();
	const emailHash = sha256Hex(email);
	const userRows = await sql<Array<{ id: string }>>`
		insert into app_user (user_key, email_hash, email_enc)
		values (${`auth_${randomToken(10)}`}, ${emailHash}, pgp_sym_encrypt(${email}, ${encryptionKey}))
		on conflict (email_hash) do update set
			email_enc = excluded.email_enc
		returning id::text as id
	`;
	return String(userRows[0]?.id || "");
}

async function sendMagicLinkEmail(email: string, magicUrl: string) {
	const resendApiKey = String(import.meta.env.RESEND_API_KEY || "").trim();
	const fromEmail = String(import.meta.env.AUTH_FROM_EMAIL || "").trim();
	if (!resendApiKey || !fromEmail) return { sent: false };

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			from: fromEmail,
			to: [email],
			subject: "Your DogEared sign-in link",
			html: `<p>Click to sign in to DogEared:</p><p><a href="${magicUrl}">${magicUrl}</a></p><p>This link expires in 20 minutes.</p>`
		})
	});
	return { sent: response.ok };
}

export const POST: APIRoute = async ({ request, url }) => {
	try {
		const body = await request.json().catch(() => ({})) as { email?: unknown };
		const email = normalizeEmail(body?.email);
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return json(400, { error: "Enter a valid email address." });
		}

		const userId = await upsertUserByEmail(email);
		if (!userId) return json(500, { error: "Could not prepare account." });

		const token = randomToken(32);
		const tokenHash = sha256Hex(token);
		const sql = getNeonSql();
		await sql`
			insert into auth_magic_link (user_id, token_hash, requested_ip, user_agent, expires_at)
			values (
				${userId}::uuid,
				${tokenHash},
				${String(request.headers.get("x-forwarded-for") || "").slice(0, 120)},
				${String(request.headers.get("user-agent") || "").slice(0, 500)},
				now() + interval '20 minutes'
			)
		`;

		const verifyUrl = new URL("/api/auth/verify", url.origin);
		verifyUrl.searchParams.set("token", token);
		const sendResult = await sendMagicLinkEmail(email, verifyUrl.toString());
		const isDevHost = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);

		return json(200, {
			ok: true,
			sent: sendResult.sent,
			message: sendResult.sent
				? "Magic link sent."
				: "Email provider not configured. Use preview link in development.",
			previewUrl: isDevHost ? verifyUrl.toString() : undefined
		});
	} catch (error) {
		return json(500, {
			error: "Failed to create magic link.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
