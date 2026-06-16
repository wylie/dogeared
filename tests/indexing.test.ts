import test from "node:test";
import assert from "node:assert/strict";
import { authorHref } from "../src/lib/author.ts";
import {
	authorCanonicalPath,
	canonicalRelatedValue,
	decideRelatedIndexing,
	relatedCanonicalPath
} from "../src/lib/indexing.ts";

test("author URLs use clean canonical slugs", () => {
	assert.equal(authorHref("Andy Weir", 42), "/author/andy-weir");
	assert.equal(authorCanonicalPath("Ursula K. Le Guin"), "/author/ursula-k-le-guin");
});

test("related genre canonical values collapse common aliases", () => {
	assert.equal(canonicalRelatedValue("genre", "sci-fi"), "Science Fiction");
	assert.equal(relatedCanonicalPath("genre", "sci-fi"), "/related?kind=genre&value=Science+Fiction");
});

test("related indexing rules index strong discovery collections", () => {
	const decision = decideRelatedIndexing({
		kind: "genre",
		value: "Science Fiction",
		bookCount: 5,
		uniqueAuthorCount: 2,
		readerCount: 2
	});
	assert.equal(decision.indexable, true);
	assert.equal(decision.robots, "index,follow");
});

test("related indexing rules noindex weak or thin metadata pages", () => {
	const weak = decideRelatedIndexing({
		kind: "topic",
		value: "Large Type Books",
		bookCount: 20,
		uniqueAuthorCount: 12,
		readerCount: 10
	});
	assert.equal(weak.indexable, false);
	assert.equal(weak.robots, "noindex,follow");

	const thin = decideRelatedIndexing({
		kind: "topic",
		value: "Climatic Changes",
		bookCount: 1,
		uniqueAuthorCount: 1,
		readerCount: 1
	});
	assert.equal(thin.indexable, false);
	assert.equal(thin.robots, "noindex,follow");
});

test("related author and book pages remain crawlable but not indexable duplicates", () => {
	for (const kind of ["author", "book"] as const) {
		const decision = decideRelatedIndexing({
			kind,
			value: "Project Hail Mary",
			bookCount: 12,
			uniqueAuthorCount: 5,
			readerCount: 8
		});
		assert.equal(decision.indexable, false);
		assert.equal(decision.robots, "noindex,follow");
	}
});
