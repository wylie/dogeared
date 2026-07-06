import test from "node:test";
import assert from "node:assert/strict";
import { resolveMomentumPrediction } from "../src/lib/momentumPrediction.ts";

test("suppresses prediction for books with no saved progress", () => {
	const result = resolveMomentumPrediction({
		currentPage: 0,
		totalPages: 226,
		daysSinceUpdate: 0,
		daysSinceStart: 0,
		progressUpdateCount: 1
	});
	assert.equal(result.eligible, false);
	assert.equal(result.label, "Recently started");
});

test("suppresses low-confidence predictions even with some progress", () => {
	const result = resolveMomentumPrediction({
		currentPage: 21,
		totalPages: 420,
		daysSinceUpdate: 0,
		daysSinceStart: 1,
		progressUpdateCount: 1
	});
	assert.equal(result.eligible, false);
	assert.equal(result.label, "Building reading history");
	assert.ok(result.confidence < 0.5);
});

test("first nonzero progress update leaves recently started state", () => {
	const result = resolveMomentumPrediction({
		currentPage: 8,
		totalPages: 320,
		daysSinceUpdate: 0,
		daysSinceStart: 0,
		progressUpdateCount: 1
	});
	assert.equal(result.eligible, false);
	assert.equal(result.label, "Building reading history");
});

test("shows supportive prediction once thresholds are met", () => {
	const result = resolveMomentumPrediction({
		currentPage: 96,
		totalPages: 280,
		daysSinceUpdate: 1,
		daysSinceStart: 6,
		progressUpdateCount: 3
	});
	assert.equal(result.eligible, true);
	assert.equal(result.label, "Strong momentum");
	assert.ok(result.finishProbability >= 20);
});

test("uses supportive slowdown language instead of risk wording", () => {
	const result = resolveMomentumPrediction({
		currentPage: 120,
		totalPages: 320,
		daysSinceUpdate: 10,
		daysSinceStart: 20,
		progressUpdateCount: 4
	});
	assert.equal(result.eligible, true);
	assert.equal(result.label, "Reading momentum slowing");
	assert.equal(result.label.includes("risk"), false);
});
