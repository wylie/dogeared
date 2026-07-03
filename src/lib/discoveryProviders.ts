export type CommunityDiscoverySignal = {
	bookId: number;
	title: string;
	averageRating: number;
	ratingCount: number;
	readerCount: number;
	shelfCount: number;
	publishedYear: number;
	addedEvents7d: number;
	addedReaders7d: number;
	lastAddedAt: string;
	finishedEvents7d: number;
	finishedReaders7d: number;
	lastFinishedAt: string;
	currentActivity14d: number;
	previousActivity14d: number;
	currentReaders14d: number;
	previousReaders14d: number;
	currentFinishes14d: number;
	previousFinishes14d: number;
	currentRatings14d: number;
	previousRatings14d: number;
	currentReviews14d: number;
	previousReviews14d: number;
	reviewCount: number;
	recentReviewText: string;
	recentReviewUserId: string;
	recentReviewUpdatedAt: string;
	recentReviewReactions: number;
};

export type DiscoveryProviderBook = {
	bookId: number;
	reason: string;
	titleHref?: string;
	reviewSnippet?: string;
};

export type DiscoveryProviderSection = {
	id: string;
	title: string;
	description: string;
	priority: number;
	emptyState?: string;
	books: DiscoveryProviderBook[];
};

export type DiscoveryProviderContext = {
	limit: number;
	now?: Date;
};

export interface DiscoveryProvider {
	id: string;
	title: string;
	description: string;
	priority: number;
	emptyState?: string;
	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext): DiscoveryProviderBook[];
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
	const safe = Math.max(0, Math.round(Number(count || 0)));
	return `${safe.toLocaleString()} ${safe === 1 ? singular : plural}`;
}

function ratingLabel(value: number) {
	const safe = Math.max(0, Math.min(5, Number(value || 0)));
	return safe.toFixed(2);
}

function daysSince(value: string, now = new Date()) {
	const parsed = new Date(String(value || ""));
	if (!Number.isFinite(parsed.getTime())) return 9999;
	return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86400000));
}

function reviewAnchor(userId: string) {
	const safe = String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "");
	return safe ? `review-${safe}` : "reviews";
}

function sortByRecent(a: string, b: string) {
	return Date.parse(b || "") - Date.parse(a || "");
}

export class CommunityFavoritesProvider implements DiscoveryProvider {
	id = "community-favorites";
	title = "Community Favorites";
	description = "Highly rated books with enough DogEared ratings to be trustworthy.";
	priority = 10;
	emptyState = "Community favorites will appear once more readers rate finished books.";
	private minimumRatingCount: number;

	constructor(minimumRatingCount = 3) {
		this.minimumRatingCount = minimumRatingCount;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		return signals
			.filter((book) => book.ratingCount >= this.minimumRatingCount && book.averageRating > 0)
			.sort((a, b) => (
				b.averageRating - a.averageRating
				|| b.ratingCount - a.ratingCount
				|| b.readerCount - a.readerCount
				|| a.title.localeCompare(b.title)
			))
			.slice(0, context.limit)
			.map((book) => ({
				bookId: book.bookId,
				reason: `${ratingLabel(book.averageRating)} average from ${countLabel(book.ratingCount, "rating")}.`
			}));
	}
}

export class MostAddedProvider implements DiscoveryProvider {
	id = "most-added-this-week";
	title = "Most Added This Week";
	description = "Books added to shelves by the most unique readers over the past seven days.";
	priority = 20;
	emptyState = "Most Added will appear when readers start shelving books this week.";
	private minimumUniqueReaders: number;

	constructor(minimumUniqueReaders = 2) {
		this.minimumUniqueReaders = minimumUniqueReaders;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		return signals
			.filter((book) => book.addedReaders7d >= this.minimumUniqueReaders)
			.sort((a, b) => (
				b.addedReaders7d - a.addedReaders7d
				|| b.addedEvents7d - a.addedEvents7d
				|| sortByRecent(a.lastAddedAt, b.lastAddedAt)
				|| a.title.localeCompare(b.title)
			))
			.slice(0, context.limit)
			.map((book) => ({
				bookId: book.bookId,
				reason: `${countLabel(book.addedReaders7d, "reader")} added this in the last week.`
			}));
	}
}

export class MostFinishedProvider implements DiscoveryProvider {
	id = "most-finished-this-week";
	title = "Most Finished This Week";
	description = "Books readers are completing right now, ranked by unique finishers and recent completions.";
	priority = 30;
	emptyState = "Most Finished will appear once readers finish books this week.";
	private minimumUniqueReaders: number;

	constructor(minimumUniqueReaders = 1) {
		this.minimumUniqueReaders = minimumUniqueReaders;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		return signals
			.filter((book) => book.finishedReaders7d >= this.minimumUniqueReaders)
			.sort((a, b) => (
				b.finishedReaders7d - a.finishedReaders7d
				|| b.finishedEvents7d - a.finishedEvents7d
				|| sortByRecent(a.lastFinishedAt, b.lastFinishedAt)
				|| b.averageRating - a.averageRating
				|| a.title.localeCompare(b.title)
			))
			.slice(0, context.limit)
			.map((book) => ({
				bookId: book.bookId,
				reason: `${countLabel(book.finishedReaders7d, "reader")} finished this in the last week.`
			}));
	}
}

export class TrendingProvider implements DiscoveryProvider {
	id = "trending-up";
	title = "Trending Up";
	description = "Books gaining momentum from recent readers, finishes, ratings, and reviews compared with the prior two weeks.";
	priority = 40;
	emptyState = "Trending books will appear when recent activity rises above prior activity.";

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		return signals
			.map((book) => {
				const currentSignal = book.currentReaders14d
					+ (book.currentFinishes14d * 2)
					+ (book.currentRatings14d * 2)
					+ (book.currentReviews14d * 3);
				const previousSignal = book.previousReaders14d
					+ (book.previousFinishes14d * 2)
					+ (book.previousRatings14d * 2)
					+ (book.previousReviews14d * 3);
				return {
					book,
					currentSignal,
					previousSignal,
					growth: currentSignal - previousSignal
				};
			})
			.filter((item) => item.currentSignal >= 2 && item.growth > 0)
			.sort((a, b) => (
				b.growth - a.growth
				|| b.currentSignal - a.currentSignal
				|| b.book.currentFinishes14d - a.book.currentFinishes14d
				|| b.book.currentReviews14d - a.book.currentReviews14d
				|| a.book.title.localeCompare(b.book.title)
			))
			.slice(0, context.limit)
			.map((item) => ({
				bookId: item.book.bookId,
				reason: `Community activity rose from ${item.previousSignal.toLocaleString()} to ${item.currentSignal.toLocaleString()} signals.`
			}));
	}
}

export class HiddenGemsProvider implements DiscoveryProvider {
	id = "hidden-gems";
	title = "Hidden Gems";
	description = "Excellent ratings on books with a smaller DogEared readership.";
	priority = 50;
	emptyState = "Hidden gems will appear once smaller-readership books have enough ratings.";
	private minimumRatingCount: number;
	private minimumAverageRating: number;
	private maximumReaders: number;

	constructor(
		minimumRatingCount = 3,
		minimumAverageRating = 4,
		maximumReaders = 25
	) {
		this.minimumRatingCount = minimumRatingCount;
		this.minimumAverageRating = minimumAverageRating;
		this.maximumReaders = maximumReaders;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		return signals
			.filter((book) => (
				book.ratingCount >= this.minimumRatingCount
				&& book.averageRating >= this.minimumAverageRating
				&& book.readerCount > 0
				&& book.readerCount <= this.maximumReaders
			))
			.sort((a, b) => (
				b.averageRating - a.averageRating
				|| a.readerCount - b.readerCount
				|| b.ratingCount - a.ratingCount
				|| a.title.localeCompare(b.title)
			))
			.slice(0, context.limit)
			.map((book) => ({
				bookId: book.bookId,
				reason: `${ratingLabel(book.averageRating)} average, but only ${countLabel(book.readerCount, "reader")}.`
			}));
	}
}

export class RecentlyReviewedProvider implements DiscoveryProvider {
	id = "recently-reviewed";
	title = "Recently Reviewed";
	description = "Recent thoughtful reviews, with longer reflections and reactions surfaced first.";
	priority = 60;
	emptyState = "Recent reviews will appear when readers leave thoughtful finished-book reflections.";
	private minimumReviewLength: number;

	constructor(minimumReviewLength = 80) {
		this.minimumReviewLength = minimumReviewLength;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		const now = context.now || new Date();
		return signals
			.filter((book) => book.recentReviewText.length >= this.minimumReviewLength)
			.map((book) => {
				const recencyScore = Math.max(0, 30 - daysSince(book.recentReviewUpdatedAt, now));
				const reviewLengthScore = Math.min(12, Math.floor(book.recentReviewText.length / 40));
				const score = recencyScore + reviewLengthScore + (book.recentReviewReactions * 4);
				return { book, score };
			})
			.sort((a, b) => (
				b.score - a.score
				|| b.book.recentReviewReactions - a.book.recentReviewReactions
				|| b.book.recentReviewText.length - a.book.recentReviewText.length
				|| sortByRecent(a.book.recentReviewUpdatedAt, b.book.recentReviewUpdatedAt)
				|| a.book.title.localeCompare(b.book.title)
			))
			.slice(0, context.limit)
			.map(({ book }) => ({
				bookId: book.bookId,
				titleHref: `/book?bookId=${encodeURIComponent(String(book.bookId))}#${reviewAnchor(book.recentReviewUserId)}`,
				reviewSnippet: book.recentReviewText,
				reason: `${countLabel(book.recentReviewText.length, "character")} review${book.recentReviewReactions > 0 ? ` with ${countLabel(book.recentReviewReactions, "reaction")}` : ""}.`
			}));
	}
}

export class NewReleaseProvider implements DiscoveryProvider {
	id = "new-releases-readers-love";
	title = "New Releases Readers Love";
	description = "Recently published books with strong ratings and meaningful DogEared activity.";
	priority = 70;
	emptyState = "New releases will appear once recent books earn enough reader activity.";
	private minimumRatingCount: number;
	private minimumAverageRating: number;
	private releaseYearWindow: number;

	constructor(
		minimumRatingCount = 2,
		minimumAverageRating = 4,
		releaseYearWindow = 2
	) {
		this.minimumRatingCount = minimumRatingCount;
		this.minimumAverageRating = minimumAverageRating;
		this.releaseYearWindow = releaseYearWindow;
	}

	getBooks(signals: CommunityDiscoverySignal[], context: DiscoveryProviderContext) {
		const currentYear = (context.now || new Date()).getUTCFullYear();
		const minimumYear = currentYear - this.releaseYearWindow;
		return signals
			.filter((book) => (
				book.publishedYear >= minimumYear
				&& book.ratingCount >= this.minimumRatingCount
				&& book.averageRating >= this.minimumAverageRating
				&& (book.readerCount >= 2 || book.currentActivity14d >= 2)
			))
			.sort((a, b) => (
				b.publishedYear - a.publishedYear
				|| b.averageRating - a.averageRating
				|| b.currentActivity14d - a.currentActivity14d
				|| b.readerCount - a.readerCount
				|| a.title.localeCompare(b.title)
			))
			.slice(0, context.limit)
			.map((book) => ({
				bookId: book.bookId,
				reason: `${book.publishedYear} release with ${ratingLabel(book.averageRating)} average and ${countLabel(book.readerCount, "reader")}.`
			}));
	}
}

export function createDefaultDiscoveryProviders(): DiscoveryProvider[] {
	return [
		new CommunityFavoritesProvider(),
		new MostAddedProvider(),
		new MostFinishedProvider(),
		new TrendingProvider(),
		new HiddenGemsProvider(),
		new RecentlyReviewedProvider(),
		new NewReleaseProvider()
	];
}

export function resolveDiscoveryProviderSections(
	signals: CommunityDiscoverySignal[],
	providers: DiscoveryProvider[] = createDefaultDiscoveryProviders(),
	context: DiscoveryProviderContext = { limit: 12 }
): DiscoveryProviderSection[] {
	const limit = Math.max(1, Math.min(24, Math.floor(Number(context.limit || 12) || 12)));
	const normalizedContext = { ...context, limit };
	return providers
		.map((provider) => ({
			id: provider.id,
			title: provider.title,
			description: provider.description,
			priority: provider.priority,
			emptyState: provider.emptyState,
			books: provider.getBooks(signals, normalizedContext)
		}))
		.filter((section) => section.books.length > 0)
		.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}
