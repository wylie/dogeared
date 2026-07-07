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
		subject: "Compare books",
		description: "Please add a better way to compare two books.",
		metadata: {
			pageUrl: "https://dogeared.app/book/123",
			route: "/book",
			timestamp: "2026-06-16T12:00:00.000Z",
			userAgent: "Test Browser",
			browser: "Test Browser",
			operatingSystem: "Test OS",
			screenSize: "390x844",
			viewport: "390x844"
		}
	});
	assert.deepEqual(result, {
		ok: true,
		type: "feature",
		severity: "",
		subject: "Compare books",
		description: "Please add a better way to compare two books.",
		expectedBehavior: "",
		actualBehavior: "",
		stepsToReproduce: "",
		email: "reader@example.com",
		metadata: {
			pageUrl: "https://dogeared.app/book/123",
			route: "/book",
			timestamp: "2026-06-16T12:00:00.000Z",
			appVersion: "",
			gitCommit: "",
			userAgent: "Test Browser",
			browser: "Test Browser",
			operatingSystem: "Test OS",
			screenSize: "390x844",
			viewport: "390x844",
			colorScheme: "",
			language: "",
			authenticated: false,
			bookId: "",
			authorId: "",
			collectionId: "",
			searchQuery: "",
			recommendationSource: "",
			environment: "",
			featureFlags: [],
			recentClientErrors: []
		},
		screenshots: []
	});
});

test("feedback validation rejects thin messages and invalid emails", () => {
	assert.deepEqual(validateFeedbackPayload({
		type: "bug",
		description: "Broken",
		email: ""
	}), {
		ok: false,
		error: "Please add a little more detail before sending feedback."
	});
	assert.deepEqual(validateFeedbackPayload({
		type: "bug",
		description: "This has enough detail to submit.",
		email: "not-an-email"
	}), {
		ok: false,
		error: "Use a valid email address, or leave the email field blank."
	});
});

test("feedback email formatting includes user, page, message, and environment details", () => {
	const email = buildFeedbackEmail({
		type: "bug",
		severity: "major",
		subject: "Shelf menu stuck",
		description: "The shelf menu is stuck open.",
		expectedBehavior: "The menu should close.",
		actualBehavior: "It stays open.",
		stepsToReproduce: "Open a shelf menu.\nClick elsewhere.",
		email: "reader@example.com",
		metadata: {
			pageUrl: "https://dogeared.app/books",
			route: "/books",
			timestamp: "2026-06-16T12:00:00.000Z",
			appVersion: "0.1.1",
			gitCommit: "abc123",
			userAgent: "Test Browser",
			browser: "Test Browser",
			operatingSystem: "Test OS",
			screenSize: "1280x800",
			viewport: "1280x720",
			colorScheme: "light",
			language: "en-US",
			authenticated: true,
			bookId: "123",
			authorId: "",
			collectionId: "",
			searchQuery: "",
			recommendationSource: "",
			environment: "test",
			featureFlags: ["beta-feedback"],
			recentClientErrors: []
		},
		user: {
			authenticated: true,
			userId: "user-1",
			username: "wylie",
			email: "account@example.com"
		}
	});
	assert.match(email.subject, /\[DogEared Feedback\] Bug Report: Shelf menu stuck/);
	assert.match(email.textContent, /Type:\nBug Report/);
	assert.match(email.textContent, /Severity:\nMajor/);
	assert.match(email.textContent, /Subject:\nShelf menu stuck/);
	assert.match(email.textContent, /From:\n@wylie/);
	assert.match(email.textContent, /Email:\nreader@example.com/);
	assert.match(email.textContent, /Page:\nhttps:\/\/dogeared\.app\/books/);
	assert.match(email.textContent, /Route:\n\/books/);
	assert.match(email.textContent, /Description:\nThe shelf menu is stuck open\./);
	assert.match(email.textContent, /Expected behavior:\nThe menu should close\./);
	assert.match(email.textContent, /Viewport: 1280x720/);
	assert.match(email.textContent, /Book ID: 123/);
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
	assert.equal(source.includes("data-feedback-bug-fields"), true);
	assert.equal(source.includes("data-feedback-severity"), true);
	assert.equal(source.includes("data-feedback-dropzone"), true);
	assert.equal(source.includes("feedback-screenshot-list"), true);
	assert.equal(source.includes("pageUrl: window.location.href"), true);
	assert.equal(source.includes("route: routeForPath()"), true);
	assert.equal(source.includes("timestamp: new Date().toISOString()"), true);
	assert.equal(source.includes("userAgent: navigator.userAgent"), true);
	assert.equal(source.includes("screenSize: collectScreenSize()"), true);
	assert.equal(source.includes("bookId:"), true);
	assert.equal(source.includes("authorId:"), true);
	assert.equal(source.includes("collectionId:"), true);
	assert.equal(source.includes("recommendationSource:"), true);
	assert.equal(source.includes("__dogearedClientErrors"), true);
	assert.equal(source.includes("Something unexpected happened."), true);
	assert.equal(source.includes("viewport: collectViewport()"), true);
	assert.equal(source.includes("Submitting as:"), true);
	assert.equal(source.includes("We do not collect passwords, private journal content"), true);
});

test("feedback and support actions render as compact floating action buttons", () => {
	const widgetSource = readFileSync("src/components/FeedbackWidget.astro", "utf8");
	const floatingActionsSource = readFileSync("src/components/FloatingActions.astro", "utf8");
	const layoutSource = readFileSync("src/layouts/Layout.astro", "utf8");
	assert.equal(layoutSource.includes("<FloatingActions"), true);
	assert.equal(layoutSource.includes("global-floating-actions"), false);
	assert.equal(floatingActionsSource.includes('aria-label="Reader actions"'), true);
	assert.equal(floatingActionsSource.includes('label: "Support DogEared"'), true);
	assert.equal(floatingActionsSource.includes('icon: "favorite"'), true);
	assert.equal(floatingActionsSource.includes("supportActions"), true);
	assert.equal(floatingActionsSource.includes("width: 48px"), true);
	assert.equal(floatingActionsSource.includes("height: 48px"), true);
	assert.equal(floatingActionsSource.includes("align-items: center"), true);
	assert.equal(floatingActionsSource.includes("justify-content: center"), true);
	assert.equal(floatingActionsSource.includes("is-pointer-active"), true);
	assert.equal(floatingActionsSource.includes("is-keyboard-active"), true);
	assert.equal(floatingActionsSource.includes('event.key === "Tab"'), true);
	assert.equal(floatingActionsSource.includes(".floating-actions.is-pointer-active :global(.floating-action:hover)"), true);
	assert.equal(floatingActionsSource.includes(".floating-actions.is-keyboard-active :global(.floating-action:focus)"), true);
	assert.equal(floatingActionsSource.includes("width: 46px"), true);
	assert.equal(floatingActionsSource.includes("max-width: 0"), true);
	assert.equal(widgetSource.includes("floating-action-slot"), true);
	assert.equal(widgetSource.includes("floating-action floating-action-feedback"), true);
	assert.equal(widgetSource.includes("floating-action-icon"), true);
	assert.equal(widgetSource.includes("floating-action-label"), true);
	assert.equal(widgetSource.includes("feedback-float"), false);
});

test("feedback submission uses env-configured delivery, honeypot, rate limiting, and safe analytics", () => {
	const apiSource = readFileSync("src/pages/api/feedback.ts", "utf8");
	const widgetSource = readFileSync("src/components/FeedbackWidget.astro", "utf8");
	const layoutSource = readFileSync("src/layouts/Layout.astro", "utf8");
	assert.equal(apiSource.includes("FEEDBACK_EMAIL"), true);
	assert.equal(apiSource.includes("website"), true);
	assert.equal(apiSource.includes("resolveFeedbackRateLimit"), true);
	assert.equal(apiSource.includes("feedback_submission_event"), true);
	assert.equal(apiSource.includes("feedback_submission"), true);
	assert.equal(apiSource.includes("trackingNumber"), true);
	assert.equal(apiSource.includes("ensureBetaFeedbackSchema"), true);
	assert.equal(apiSource.includes("screenshots"), true);
	assert.equal(apiSource.includes("diagnosticContext"), true);
	assert.equal(widgetSource.includes("Feedback Submitted"), true);
	assert.equal(widgetSource.includes("feedback_type"), true);
	assert.equal(widgetSource.includes("message_content"), false);
	assert.equal(layoutSource.includes("<FloatingActions"), true);
});

test("admin feedback dashboard supports filtering and private workflow fields", () => {
	const source = readFileSync("src/pages/admin/feedback.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");
	const overview = readFileSync("src/pages/admin.astro", "utf8");
	assert.equal(source.includes("resolveAdminSession"), true);
	assert.equal(source.includes("if (!admin.isAdmin) return Astro.redirect(\"/\")"), true);
	assert.equal(source.includes("feedbackStatusLabels"), true);
	assert.equal(source.includes('name="adminNotes"'), true);
	assert.equal(source.includes('name="needsReply"'), true);
	assert.equal(source.includes('name="needsReproduction"'), true);
	assert.equal(source.includes('name="isDuplicate"'), true);
	assert.equal(source.includes('name="resolvedInVersion"'), true);
	assert.equal(source.includes("resolved_at"), true);
	assert.equal(source.includes("diagnostic_context"), true);
	assert.equal(source.includes("screenshots"), true);
	assert.equal(nav.includes("/admin/feedback"), true);
	assert.equal(overview.includes('href: "/admin/feedback"'), true);
});
