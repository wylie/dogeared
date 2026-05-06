import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGenreEntry, normalizeGenreList, normalizeTopicTagList } from "../src/lib/genres.ts";

test("normalizeGenreEntry maps aliases to canonical genre slugs", () => {
	assert.deepEqual(normalizeGenreEntry("Sci-Fi"), [{ slug: "science-fiction", name: "Science Fiction" }]);
	assert.deepEqual(normalizeGenreEntry("YA"), [{ slug: "young-adult", name: "Young Adult" }]);
});

test("normalizeGenreEntry splits combo genres", () => {
	assert.deepEqual(normalizeGenreEntry("Fantasy / Romance"), [
		{ slug: "fantasy", name: "Fantasy" },
		{ slug: "romance", name: "Romance" }
	]);
});

test("normalizeGenreList dedupes aliases and filters non-genre shelf labels", () => {
	const input = [
		"Sci-Fi",
		"Science Fiction",
		"read",
		"currently-reading",
		"YA",
		"Young Adult Fiction",
		"Thrillers",
		"Mysteries",
		"Graphic Novels",
		"Diets",
		"Dystopian fiction",
		"Dystopias",
		"Dystopias in fiction",
		"nyt-combined-print",
		"collectionid-swota",
		"bio005000"
	];
	assert.deepEqual(normalizeGenreList(input, 8), [
		{ slug: "science-fiction", name: "Science Fiction" },
		{ slug: "young-adult", name: "Young Adult" },
		{ slug: "thriller", name: "Thriller" },
		{ slug: "mystery", name: "Mystery" },
		{ slug: "comics", name: "Comics" },
		{ slug: "dystopian", name: "Dystopian" }
	]);
});

test("normalizeTopicTagList keeps non-standard subjects as tags", () => {
	const input = ["Diets", "Dystopias in fiction", "read", "Science Fiction"];
	assert.deepEqual(normalizeTopicTagList(input, 6), [
		{ slug: "diet", name: "Diet" }
	]);
});
