import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	buildFeedbackEmail,
	resolveFeedbackRateLimit,
	validateFeedbackPayload
} from "../src/lib/feedback.ts";

test("feedback validation accepts useful messages and optional valid email", () => {
	const result = validateFeedbackPayload({
		type: "feature",
		message: "Please add a better way to compare two books.",
		email: " Reader@Example.COM ",
		metadata: {
			pageUrl: "https://dogeared.app/book/123",
			timestamp: "2026-06-16T12:00:00.000Z",
			userAgent: "Test Browser",
			viewport: "390x844"
		}
	});
	assert.deepEqual(result, {
		ok: true,
		type: "feature",
		message: "Please add a better way to compare two books.",
		email: "reader@example.com",
		metadata: {
			pageUrl: "https://dogeared.app/book/123",
			timestamp: "2026-06-16T12:00:00.000Z",
			userAgent: "Test Browser",
			viewport: "390x844"
		}
	});
});

test("feedback validation rejects thin messages and invalid emails", () => {
	assert.deepEqual(validateFeedbackPayload({
		type: "bug",
		message: "Broken",
		email: ""
	}), {
		ok: false,
		error: "Please add a little more detail before sending feedback."
	});
	assert.deepEqual(validateFeedbackPayload({
		type: "bug",
		message: "This has enough detail to submit.",
		email: "not-an-email"
	}), {
		ok: false,
		error: "Use a valid email address, or leave the email field blank."
	});
});

test("feedback email formatting includes user, page, message, and environment details", () => {
	const email = buildFeedbackEmail({
		type: "bug",
		message: "The shelf menu is stuck open.",
		email: "reader@example.com",
		metadata: {
			pageUrl: "https://dogeared.app/books",
			timestamp: "2026-06-16T12:00:00.000Z",
			userAgent: "Test Browser",
			viewport: "1280x720"
		},
		user: {
			authenticated: true,
			userId: "user-1",
			username: "wylie",
			email: "account@example.com"
		}
	});
	assert.equal(email.subject, "[Dogeared Feedback] Bug Report");
	assert.match(email.textContent, /Type:\nBug Report/);
	assert.match(email.textContent, /From:\n@wylie/);
	assert.match(email.textContent, /Email:\nreader@example.com/);
	assert.match(email.textContent, /Page:\nhttps:\/\/dogeared\.app\/books/);
	assert.match(email.textContent, /Message:\nThe shelf menu is stuck open\./);
	assert.match(email.textContent, /Viewport: 1280x720/);
	assert.match(email.textContent, /Authenticated: yes/);
});

test("feedback rate limiting blocks after the configured window count", () => {
	assert.deepEqual(resolveFeedbackRateLimit(4), {
		blocked: false,
		status: 200,
		message: ""
	});
	assert.deepEqual(resolveFeedbackRateLimit(5), {
		blocked: true,
		status: 429,
		message: "Too much feedback was sent from this browser recently. Please try again later."
	});
});

test("feedback widget opens an accessible modal and attaches hidden metadata", () => {
	const source = readFileSync("src/components/FeedbackWidget.astro", "utf8");
	assert.equal(source.includes('aria-controls="feedback-modal"'), true);
	assert.equal(source.includes('aria-label="Send feedback"'), true);
	assert.equal(source.includes('role="dialog"'), true);
	assert.equal(source.includes("openFeedbackModal"), true);
	assert.equal(source.includes("pageUrl: window.location.href"), true);
	assert.equal(source.includes("timestamp: new Date().toISOString()"), true);
	assert.equal(source.includes("userAgent: navigator.userAgent"), true);
	assert.equal(source.includes("viewport: collectViewport()"), true);
	assert.equal(source.includes("Submitting as:"), true);
});

test("feedback and support actions render as compact floating action buttons", () => {
	const widgetSource = readFileSync("src/components/FeedbackWidget.astro", "utf8");
	const layoutSource = readFileSync("src/layouts/Layout.astro", "utf8");
	assert.equal(layoutSource.includes("global-floating-actions"), true);
	assert.equal(layoutSource.includes('aria-label="Reader actions"'), true);
	assert.equal(layoutSource.includes('aria-label="Support Dogeared"'), true);
	assert.equal(layoutSource.includes(">favorite<"), true);
	assert.equal(layoutSource.includes("width: 48px"), true);
	assert.equal(layoutSource.includes("height: 48px"), true);
	assert.equal(layoutSource.includes(".global-support-float:hover"), true);
	assert.equal(layoutSource.includes(".global-float-label"), true);
	assert.equal(widgetSource.includes(".feedback-widget"), true);
	assert.equal(widgetSource.includes("display: contents"), true);
	assert.equal(widgetSource.includes("width: 48px"), true);
	assert.equal(widgetSource.includes("height: 48px"), true);
	assert.equal(widgetSource.includes(".feedback-float:hover"), true);
	assert.equal(widgetSource.includes(".feedback-float-label"), true);
	assert.equal(widgetSource.includes("width: 46px"), true);
	assert.equal(widgetSource.includes("max-width: 0"), true);
});

test("feedback submission uses env-configured delivery, honeypot, rate limiting, and safe analytics", () => {
	const apiSource = readFileSync("src/pages/api/feedback.ts", "utf8");
	const widgetSource = readFileSync("src/components/FeedbackWidget.astro", "utf8");
	const layoutSource = readFileSync("src/layouts/Layout.astro", "utf8");
	assert.equal(apiSource.includes("FEEDBACK_EMAIL"), true);
	assert.equal(apiSource.includes("website"), true);
	assert.equal(apiSource.includes("resolveFeedbackRateLimit"), true);
	assert.equal(apiSource.includes("feedback_submission_event"), true);
	assert.equal(widgetSource.includes("Feedback Submitted"), true);
	assert.equal(widgetSource.includes("feedback_type"), true);
	assert.equal(widgetSource.includes("message_content"), false);
	assert.equal(layoutSource.includes("<FeedbackWidget"), true);
});
