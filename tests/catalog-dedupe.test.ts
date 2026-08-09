import test from "node:test";
import assert from "node:assert/strict";
import {
	canonicalCatalogEditionKey,
	canonicalCatalogWorkKey,
	canonicalCatalogDisplayWorkKey,
	canonicalizeCatalogAuthor,
	canonicalizeCatalogTitle,
	dedupeCatalogItemsByDisplayWork,
	getCatalogSourceKey,
	getCatalogSourceKeys,
	normalizeCatalogIsbn
} from "../src/lib/catalogKeys.ts";
import { scoreCanonicalCatalogCandidate, type CanonicalCatalogResolutionCandidate } from "../src/lib/catalog.ts";

test("canonical catalog keys separate works from editions", () => {
	assert.equal(
		canonicalCatalogWorkKey({
			title: "The Fellowship of the Ring",
			author: "J.R.R. Tolkien",
			isbn10: " 0-618-34625-2 ",
			isbn13: "978-0-618-34625-7"
		}),
		"title_author:fellowship of the ring|j r r tolkien"
	);

	assert.equal(
		canonicalCatalogEditionKey({
			title: "The Fellowship of the Ring",
			author: "J.R.R. Tolkien",
			isbn10: " 0-618-34625-2 ",
			isbn13: "978-0-618-34625-7"
		}),
		"isbn13:9780618346257"
	);
});

test("display work keys and UI dedupe collapse duplicate editions", () => {
	assert.equal(
		canonicalCatalogDisplayWorkKey({
			title: "Project Hail Mary (Kindle Edition)",
			author: "Andy Weir"
		}),
		"title_author:project hail mary|andy weir"
	);
	const deduped = dedupeCatalogItemsByDisplayWork([
		{ title: "Project Hail Mary", authors: ["Andy Weir"], shelfCount: 3, thumbnail: "" },
		{ title: "Project Hail Mary: Deluxe Edition", authors: ["Andy Weir"], shelfCount: 12, thumbnail: "cover.jpg" },
		{ title: "The Martian", authors: ["Andy Weir"], shelfCount: 8 }
	]);
	assert.equal(deduped.length, 2);
	assert.equal(deduped[0]?.title, "Project Hail Mary: Deluxe Edition");
});

test("canonical title and author collapse common formatting differences", () => {
	assert.equal(
		canonicalizeCatalogTitle("The Fellowship of the Ring: Lord of the Rings #1 (Kindle Edition)"),
		"fellowship of the ring lord of the rings 1"
	);
	assert.equal(
		canonicalCatalogWorkKey({
			title: "Star Wars: The High Republic, Vol. 1: There Is No Fear",
			author: "Cavan Scott"
		}),
		"title_author:star wars the high republic vol 1 there is no fear|cavan scott"
	);
	assert.equal(canonicalizeCatalogTitle("A Promised Land (Audiobook)"), "promised land");
	assert.equal(canonicalizeCatalogAuthor("By J.R.R. Tolkien"), "j r r tolkien");
	assert.equal(canonicalizeCatalogAuthor("V. E. Schwab"), "v e schwab");
});

test("catalog source keys include both work and edition IDs for lookup", () => {
	assert.equal(
		getCatalogSourceKey({
			source: "open_library",
			sourceWorkId: "OL82563W",
			sourceEditionId: "OL37846972M"
		}),
		"OL82563W"
	);
	assert.deepEqual(
		getCatalogSourceKeys({
			source: "open_library",
			sourceWorkId: "OL82563W",
			sourceEditionId: "OL37846972M"
		}),
		["OL82563W", "OL37846972M"]
	);
});

test("normalizeCatalogIsbn removes punctuation and preserves X check digits", () => {
	assert.equal(normalizeCatalogIsbn("0-8044-2957-X"), "080442957X");
});

function resolutionCandidate(overrides: Partial<CanonicalCatalogResolutionCandidate>): CanonicalCatalogResolutionCandidate {
	return {
		bookId: 42,
		workId: 7,
		authorId: 3,
		title: "The Poison Jungle",
		author: "Tui T. Sutherland",
		description: "",
		coverUrl: "",
		isbn10: "",
		isbn13: "",
		googleBooksId: "",
		publishedYear: 2019,
		pageCount: 336,
		seriesName: "Wings of Fire",
		seriesBookOrder: 13,
		workKey: "title_author:poison jungle|tui t sutherland",
		canonicalWorkKey: "title_author:poison jungle|tui t sutherland",
		editionKeys: [],
		sourceKeys: [],
		openLibraryWorkIds: [],
		openLibraryEditionIds: [],
		editionGoogleBooksIds: [],
		editionIsbn10s: [],
		editionIsbn13s: [],
		shelfCount: 0,
		ratingCount: 0,
		averageRating: 0,
		...overrides
	};
}

test("canonical catalog resolution scores title, author, series, and provider identifiers", () => {
	const exactTitleAuthor = scoreCanonicalCatalogCandidate({
		title: "The Poison Jungle (Wings of Fire, #13)",
		author: "Tui T. Sutherland",
		seriesName: "Wings of Fire",
		seriesBookOrder: 13,
		pageCount: 336,
		publishedYear: 2019
	}, resolutionCandidate({}));

	assert.equal(exactTitleAuthor.score >= 90, true);
	assert.equal(exactTitleAuthor.reasons.some((reason) => reason.includes("canonical title and author")), true);
	assert.equal(exactTitleAuthor.reasons.some((reason) => reason.includes("series position")), true);

	const openLibrary = scoreCanonicalCatalogCandidate({
		title: "A Different Edition Title",
		author: "Tui T. Sutherland",
		sources: [{ source: "open_library", sourceWorkId: "OL123W", sourceEditionId: "OL456M" }]
	}, resolutionCandidate({
		openLibraryWorkIds: ["OL123W"],
		openLibraryEditionIds: ["OL456M"]
	}));

	assert.equal(openLibrary.score >= 98, true);
	assert.equal(openLibrary.reasons.some((reason) => reason.includes("Open Library")), true);
});

test("canonical catalog scoring preserves duplicate prevention without over-merging", () => {
	const isbnMatch = scoreCanonicalCatalogCandidate({
		title: "Project Hail Mary",
		author: "Andy Weir",
		isbn13: "978-0-593-13520-4"
	}, resolutionCandidate({
		title: "Project Hail Mary",
		author: "Andy Weir",
		isbn13: "9780593135204"
	}));
	assert.equal(isbnMatch.score >= 98, true);

	const googleBooksMatch = scoreCanonicalCatalogCandidate({
		title: "Alternate Edition",
		author: "Andy Weir",
		googleBooksId: "abc123"
	}, resolutionCandidate({
		googleBooksId: "abc123"
	}));
	assert.equal(googleBooksMatch.score >= 98, true);

	const editionKeyMatch = scoreCanonicalCatalogCandidate({
		title: "The Fellowship of the Ring",
		author: "J.R.R. Tolkien",
		isbn10: "0618346252"
	}, resolutionCandidate({
		title: "The Fellowship of the Ring",
		author: "J.R.R. Tolkien",
		editionKeys: ["isbn10:0618346252"]
	}));
	assert.equal(editionKeyMatch.score >= 96, true);

	const missingIsbnTitleAuthor = scoreCanonicalCatalogCandidate({
		title: "The Ministry of Time",
		author: "Kaliane Bradley"
	}, resolutionCandidate({
		title: "The Ministry of Time",
		author: "Kaliane Bradley",
		workKey: "title_author:ministry of time|kaliane bradley",
		canonicalWorkKey: "title_author:ministry of time|kaliane bradley"
	}));
	assert.equal(missingIsbnTitleAuthor.score >= 90, true);

	const malformedMetadata = scoreCanonicalCatalogCandidate({
		title: " ".repeat(240),
		author: "",
		isbn13: "",
		googleBooksId: ""
	}, resolutionCandidate({}));
	assert.equal(malformedMetadata.score, 0);

	const similarDifferentBook = scoreCanonicalCatalogCandidate({
		title: "Star Wars: The High Republic, Vol. 1: There Is No Fear",
		author: "Cavan Scott"
	}, resolutionCandidate({
		title: "Star Wars",
		author: "George Lucas",
		workKey: "title_author:star wars|george lucas",
		canonicalWorkKey: "title_author:star wars|george lucas"
	}));
	assert.equal(similarDifferentBook.score, 0);
});
