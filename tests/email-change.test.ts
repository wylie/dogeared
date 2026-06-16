import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	accountDataAttachmentInvariant,
	isValidEmail,
	resolvePendingEmailChangeState,
	validateRequestedEmailChange
} from "../src/lib/emailChange.ts";

test("email validation accepts ordinary addresses and rejects invalid formats", () => {
	assert.equal(isValidEmail("wylie@example.com"), true);
	assert.equal(isValidEmail(" WYLIE@EXAMPLE.COM "), true);
	assert.equal(isValidEmail("not-an-email"), false);
	assert.equal(isValidEmail("wylie@example"), false);
	assert.equal(isValidEmail("wylie@@example.com"), false);
});

test("email change validation rejects current and duplicate emails", () => {
	assert.deepEqual(validateRequestedEmailChange({
		currentEmail: "wylie@example.com",
		newEmail: "wylie@example.com"
	}), {
		ok: false,
		code: "same",
		error: "Use a different email address than your current one."
	});

	assert.deepEqual(validateRequestedEmailChange({
		currentEmail: "wylie@example.com",
		newEmail: "reader@example.com",
		duplicateUserId: "other-user",
		currentUserId: "current-user"
	}), {
		ok: false,
		code: "duplicate",
		error: "That email address is already used by another Dogeared account."
	});
});

test("email change validation normalizes valid pending email requests", () => {
	assert.deepEqual(validateRequestedEmailChange({
		currentEmail: "wylie@example.com",
		newEmail: " New.Reader@Example.COM ",
		currentUserId: "u1"
	}), {
		ok: true,
		email: "new.reader@example.com"
	});
});

test("pending email change state handles success, expired, used, and missing tokens", () => {
	const now = new Date("2026-06-16T12:00:00.000Z");
	assert.equal(resolvePendingEmailChangeState({
		found: true,
		expiresAt: "2026-06-16T12:05:00.000Z",
		now
	}), "pending");
	assert.equal(resolvePendingEmailChangeState({
		found: true,
		expiresAt: "2026-06-16T11:59:59.000Z",
		now
	}), "expired");
	assert.equal(resolvePendingEmailChangeState({
		found: true,
		usedAt: "2026-06-16T11:58:00.000Z",
		expiresAt: "2026-06-16T12:05:00.000Z",
		now
	}), "used");
	assert.equal(resolvePendingEmailChangeState({ found: false, now }), "missing");
});

test("account data remains attached when only email identity changes", () => {
	const before = {
		id: "u1",
		email: "old@example.com",
		userBookCount: 12,
		ratingCount: 4,
		reviewCount: 2,
		followerCount: 3,
		followingCount: 5,
		notificationCount: 7
	};
	const after = {
		...before,
		email: "new@example.com"
	};
	assert.equal(accountDataAttachmentInvariant(before, after), true);
	assert.equal(accountDataAttachmentInvariant(before, { ...after, userBookCount: 0 }), false);
});

test("email verification route is noindex and keeps the current session intact", () => {
	const source = readFileSync("src/pages/account/email/verify.astro", "utf8");
	assert.equal(source.includes('robots="noindex,nofollow"'), true);
	assert.equal(source.includes("createSessionCookie"), false);
	assert.equal(source.includes("clearSessionCookie"), false);
	assert.equal(source.includes("update app_user"), true);
	assert.equal(source.includes("email_hash"), true);
	assert.equal(source.includes("email_enc"), true);
});

test("email verification sends notifications to old and new addresses", () => {
	const source = readFileSync("src/pages/account/email/verify.astro", "utf8");
	assert.equal(source.includes("sendOldAddressNotice"), true);
	assert.equal(source.includes("sendNewAddressNotice"), true);
	assert.equal(source.includes("Your Dogeared email was changed"), true);
	assert.equal(source.includes("Your Dogeared email has been verified"), true);
});

test("settings exposes account email change and pending verification controls", () => {
	const source = readFileSync("src/pages/settings.astro", "utf8");
	assert.equal(source.includes('id="account-settings"'), true);
	assert.equal(source.includes("Change Email"), true);
	assert.equal(source.includes("Pending Email Change"), true);
	assert.equal(source.includes("Resend Verification"), true);
	assert.equal(source.includes("Your reading history, shelves, ratings, and reviews stay with your account even if your email changes."), true);
	assert.equal(source.includes('fetch("/api/account/delete"'), false);
	assert.equal(source.includes("Delete Account is planned for a future account management update."), true);
});
