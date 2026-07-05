import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("recommendation service uses transparent reader and community signals", () => {
	const source = readFileSync("src/lib/recommendations.ts", "utf8");

	assert.match(source, /favorite_genres/);
	assert.match(source, /enjoyed_authors/);
	assert.match(source, /seed_books/);
	assert.match(source, /rating >= 4/);
	assert.match(source, /status = 'finished'/);
	assert.match(source, /Popular with/);
	assert.match(source, /Because you enjoyed/);
	assert.match(source, /not_interested/);
	assert.doesNotMatch(source, /embedding|vector|ai recommendation/i);
});

test("recommendation feedback persists per user and excludes future suggestions", () => {
	const schema = readFileSync("db/neon-schema.sql", "utf8");
	const migration = readFileSync("db/migrations/2026-07-04-recommendations-discovery-v1.sql", "utf8");
	const api = readFileSync("src/pages/api/recommendations/feedback.ts", "utf8");

	for (const source of [schema, migration]) {
		assert.match(source, /create table if not exists user_recommendation_feedback/);
		assert.match(source, /feedback in \('interesting', 'not_interested'\)/);
		assert.match(source, /primary key \(user_id, book_id\)/);
	}
	assert.match(api, /resolveUserBySession/);
	assert.match(api, /on conflict \(user_id, book_id\) do update/);
	assert.match(api, /interesting/);
	assert.match(api, /not_interested/);
});

test("recommendation UI is wired into home, discover, and book detail", () => {
	const home = readFileSync("src/pages/index.astro", "utf8");
	const discover = readFileSync("src/pages/discover.astro", "utf8");
	const book = readFileSync("src/pages/book.astro", "utf8");
	const nav = readFileSync("src/components/LeftHand.astro", "utf8");

	assert.match(home, /recommended-for-you-title/);
	assert.match(home, /loadRecommendedForUser/);
	assert.match(home, /data-action="recommendation-feedback"/);
	assert.match(home, /Add another book/);
	assert.match(discover, /title="Discover"/);
	assert.match(discover, /Every recommendation explains why it appears/);
	assert.match(discover, /recommended-for-you/);
	assert.match(discover, /data-action="recommendation-feedback"/);
	assert.match(book, /readers-also-enjoyed/);
	assert.match(book, /loadReadersAlsoEnjoyed/);
	assert.match(nav, /Discover/);
});
