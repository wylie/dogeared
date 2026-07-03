import assert from "node:assert/strict";
import test from "node:test";
import {
	CommunityFavoritesProvider,
	HiddenGemsProvider,
	MostAddedProvider,
	MostFinishedProvider,
	NewReleaseProvider,
	RecentlyReviewedProvider,
	TrendingProvider,
	resolveDiscoveryProviderSections,
	type CommunityDiscoverySignal
} from "../src/lib/discoveryProviders.ts";

function signal(overrides: Partial<CommunityDiscoverySignal>): CommunityDiscoverySignal {
	return {
		bookId: 1,
		title: "Sample Book",
		averageRating: 0,
		ratingCount: 0,
		readerCount: 0,
		shelfCount: 0,
		publishedYear: 0,
		addedEvents7d: 0,
		addedReaders7d: 0,
		lastAddedAt: "",
		finishedEvents7d: 0,
		finishedReaders7d: 0,
		lastFinishedAt: "",
		currentActivity14d: 0,
		previousActivity14d: 0,
		currentReaders14d: 0,
		previousReaders14d: 0,
		currentFinishes14d: 0,
		previousFinishes14d: 0,
		currentRatings14d: 0,
		previousRatings14d: 0,
		currentReviews14d: 0,
		previousReviews14d: 0,
		reviewCount: 0,
		recentReviewText: "",
		recentReviewUserId: "",
		recentReviewUpdatedAt: "",
		recentReviewReactions: 0,
		...overrides
	};
}

test("community favorites require enough ratings and rank by average rating", () => {
	const provider = new CommunityFavoritesProvider(3);
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Too Thin", averageRating: 5, ratingCount: 2, readerCount: 2 }),
		signal({ bookId: 2, title: "Strong", averageRating: 4.6, ratingCount: 5, readerCount: 5 }),
		signal({ bookId: 3, title: "Stronger", averageRating: 4.8, ratingCount: 3, readerCount: 3 })
	], { limit: 10 });

	assert.deepEqual(books.map((book) => book.bookId), [3, 2]);
	assert.match(books[0]?.reason || "", /4\.80 average/);
});

test("most added ranks by unique readers before raw shelf events", () => {
	const provider = new MostAddedProvider(1);
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Duplicate Heavy", addedEvents7d: 12, addedReaders7d: 1, lastAddedAt: "2026-07-01" }),
		signal({ bookId: 2, title: "Community Added", addedEvents7d: 4, addedReaders7d: 4, lastAddedAt: "2026-06-30" })
	], { limit: 10 });

	assert.deepEqual(books.map((book) => book.bookId), [2, 1]);
	assert.match(books[0]?.reason || "", /4 readers added/);
});

test("most finished prioritizes unique finishers, completion count, and recency", () => {
	const provider = new MostFinishedProvider(1);
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Older Finish", finishedEvents7d: 3, finishedReaders7d: 2, lastFinishedAt: "2026-07-01" }),
		signal({ bookId: 2, title: "Recent Finish", finishedEvents7d: 2, finishedReaders7d: 2, lastFinishedAt: "2026-07-03" }),
		signal({ bookId: 3, title: "No Finish", finishedEvents7d: 0, finishedReaders7d: 0 })
	], { limit: 10 });

	assert.deepEqual(books.map((book) => book.bookId), [1, 2]);
	assert.equal(books.some((book) => book.bookId === 3), false);
});

test("trending up compares current activity against prior activity", () => {
	const provider = new TrendingProvider();
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Flat", currentReaders14d: 4, previousReaders14d: 4 }),
		signal({ bookId: 2, title: "Growing", currentReaders14d: 3, previousReaders14d: 1, currentFinishes14d: 1, currentRatings14d: 1 }),
		signal({ bookId: 3, title: "Falling", currentReaders14d: 2, previousReaders14d: 5 })
	], { limit: 10 });

	assert.deepEqual(books.map((book) => book.bookId), [2]);
	assert.match(books[0]?.reason || "", /rose from/);
});

test("hidden gems require strong ratings and relatively few readers", () => {
	const provider = new HiddenGemsProvider(3, 4, 10);
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Known Hit", averageRating: 4.9, ratingCount: 8, readerCount: 40 }),
		signal({ bookId: 2, title: "Hidden", averageRating: 4.7, ratingCount: 4, readerCount: 6 }),
		signal({ bookId: 3, title: "Too Few Ratings", averageRating: 5, ratingCount: 2, readerCount: 2 })
	], { limit: 10 });

	assert.deepEqual(books.map((book) => book.bookId), [2]);
	assert.match(books[0]?.reason || "", /only 6 readers/);
});

test("recently reviewed returns direct review anchors and favors reactions", () => {
	const provider = new RecentlyReviewedProvider(20);
	const books = provider.getBooks([
		signal({
			bookId: 1,
			title: "Long Review",
			recentReviewText: "This review has enough substance to help another reader understand why the book matters.",
			recentReviewUserId: "user-one",
			recentReviewUpdatedAt: "2026-07-02",
			recentReviewReactions: 0
		}),
		signal({
			bookId: 2,
			title: "Reacted Review",
			recentReviewText: "A thoughtful review with a few reactions from the community.",
			recentReviewUserId: "user-two",
			recentReviewUpdatedAt: "2026-07-02",
			recentReviewReactions: 3
		})
	], { limit: 10, now: new Date("2026-07-03T12:00:00Z") });

	assert.equal(books[0]?.bookId, 2);
	assert.equal(books[0]?.titleHref, "/book?bookId=2#review-user-two");
	assert.match(books[0]?.reason || "", /reactions/);
});

test("new releases require recent publication, ratings, and community activity", () => {
	const provider = new NewReleaseProvider(2, 4, 2);
	const books = provider.getBooks([
		signal({ bookId: 1, title: "Old Favorite", publishedYear: 2020, averageRating: 5, ratingCount: 4, readerCount: 8 }),
		signal({ bookId: 2, title: "New Thin", publishedYear: 2026, averageRating: 5, ratingCount: 1, readerCount: 4 }),
		signal({ bookId: 3, title: "New Loved", publishedYear: 2025, averageRating: 4.4, ratingCount: 3, readerCount: 4 })
	], { limit: 10, now: new Date("2026-07-03T12:00:00Z") });

	assert.deepEqual(books.map((book) => book.bookId), [3]);
});

test("empty provider sections are hidden and populated sections keep priority order", () => {
	const sections = resolveDiscoveryProviderSections([
		signal({ bookId: 1, title: "Finished", finishedReaders7d: 1, finishedEvents7d: 1 }),
		signal({ bookId: 2, title: "Favorite", averageRating: 4.8, ratingCount: 4, readerCount: 4 })
	], [
		new MostFinishedProvider(1),
		new MostAddedProvider(2),
		new CommunityFavoritesProvider(3)
	], { limit: 10 });

	assert.deepEqual(sections.map((section) => section.id), ["community-favorites", "most-finished-this-week"]);
	assert.equal(sections.some((section) => section.id === "most-added-this-week"), false);
});
