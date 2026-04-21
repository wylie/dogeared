import crypto from "node:crypto";
import { getNeonSql } from "./neon";

export const SESSION_COOKIE = "dogeared_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeText(value: unknown) {
	return String(value || "").trim();
}

export function normalizeEmail(value: unknown) {
	return normalizeText(value).toLowerCase();
}

export function sha256Hex(value: string) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
	return crypto.randomBytes(bytes).toString("base64url");
}

export function getEncryptionKey() {
	const key = normalizeText(import.meta.env.ACCOUNT_DATA_ENCRYPTION_KEY);
	if (!key) {
		throw new Error("Missing ACCOUNT_DATA_ENCRYPTION_KEY.");
	}
	return key;
}

export function readCookie(headers: Headers, name: string) {
	const cookie = String(headers.get("cookie") || "");
	if (!cookie) return "";
	const parts = cookie.split(";").map((part) => part.trim());
	for (const part of parts) {
		const [rawName, ...rawValueParts] = part.split("=");
		if (rawName !== name) continue;
		return decodeURIComponent(rawValueParts.join("=") || "");
	}
	return "";
}

export function createSessionCookie(token: string, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
	const secure = import.meta.env.PROD ? "; Secure" : "";
	return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie() {
	const secure = import.meta.env.PROD ? "; Secure" : "";
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function upsertUserByEmail(email: string) {
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

export async function resolveUserBySession(request: Request) {
	const token = readCookie(request.headers, SESSION_COOKIE);
	if (!token) return null;
	const sessionHash = sha256Hex(token);
	const sql = getNeonSql();
	const rows = await sql<Array<{ user_id: string }>>`
		select user_id::text as user_id
		from auth_session
		where session_hash = ${sessionHash}
			and revoked_at is null
			and expires_at > now()
		limit 1
	`;
	const userId = String(rows[0]?.user_id || "");
	if (!userId) return null;
	return { userId, sessionHash };
}

export async function resolveUserIdFromUserKey(userKey: string) {
	const normalized = normalizeText(userKey);
	if (!normalized) return "";
	const sql = getNeonSql();
	const rows = await sql<{ id: string }[]>`
		insert into app_user (user_key)
		values (${normalized})
		on conflict (user_key) do update set user_key = excluded.user_key
		returning id
	`;
	return String(rows[0]?.id || "");
}

export async function resolveActiveUserId(request: Request, userKey: string) {
	const session = await resolveUserBySession(request);
	if (session?.userId) return session.userId;
	return resolveUserIdFromUserKey(userKey);
}
