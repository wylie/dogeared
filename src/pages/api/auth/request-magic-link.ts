import type { APIRoute } from "astro";
import { getNeonSql } from "../../../lib/neon";
import { normalizeEmail, randomToken, sha256Hex, upsertUserByEmail } from "../../../lib/auth";
import { normalizeRequestedIp, resolveMagicLinkRateLimit } from "../../../lib/authHardening";
import { escapeEmailHtml, sendDogearedEmail } from "../../../lib/email";

export const prerender = false;

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
}

async function sendMagicLinkEmail(email: string, magicUrl: string) {
	return sendDogearedEmail({
		to: email,
		subject: "Your DogEared sign-in link",
		htmlContent: `<p>Click to sign in to DogEared:</p><p><a href="${escapeEmailHtml(magicUrl)}">${escapeEmailHtml(magicUrl)}</a></p><p>This link expires in 20 minutes.</p>`,
		textContent: `Sign in to DogEared: ${magicUrl}\n\nThis link expires in 20 minutes.`
	});
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

		const requestedIp = normalizeRequestedIp(request.headers.get("x-forwarded-for"));
		const sql = getNeonSql();
		const latestUnusedRows = await sql<Array<{ seconds_until_expiry: number }>>`
			select greatest(0, floor(extract(epoch from (max(expires_at) - now()))))::int as seconds_until_expiry
			from auth_magic_link
			where user_id = ${userId}::uuid
				and used_at is null
				and expires_at > now()
		`;
		const ipCountRows = requestedIp
			? await sql<Array<{ count: number }>>`
				select count(*)::int as count
				from auth_magic_link
				where requested_ip = ${requestedIp}
					and expires_at > now()
			`
			: [{ count: 0 }];
		const rateLimit = resolveMagicLinkRateLimit({
			secondsUntilLatestUnusedLinkExpiry: latestUnusedRows[0]?.seconds_until_expiry ?? 0,
			recentIpRequestCount: ipCountRows[0]?.count ?? 0
		});
		if (rateLimit.blocked) {
			const headers = new Headers({ "Content-Type": "application/json" });
			headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
			return new Response(JSON.stringify({ error: rateLimit.message }), {
				status: rateLimit.status,
				headers
			});
		}

		const token = randomToken(32);
		const tokenHash = sha256Hex(token);
		await sql`
			update auth_magic_link
			set used_at = now()
			where user_id = ${userId}::uuid
				and used_at is null
				and expires_at > now()
		`;
		await sql`
			insert into auth_magic_link (user_id, token_hash, requested_ip, user_agent, expires_at)
			values (
				${userId}::uuid,
				${tokenHash},
				${requestedIp},
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
				: (sendResult.error || "Email provider not configured. Use preview link in development."),
			previewUrl: isDevHost ? verifyUrl.toString() : undefined
		});
	} catch (error) {
		return json(500, {
			error: "Failed to create magic link.",
			detail: error instanceof Error ? error.message : "Unknown error"
		});
	}
};
