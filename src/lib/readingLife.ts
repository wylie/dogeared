import { canonicalizeFinishedBooks, filterCanonicalFinishedBooksForYear } from "./finishedBooks.ts";
import { resolveReadingGoalProgress, type ReadingGoalProgress } from "./readingGoal.ts";

export type ReadingLifeGenre = {
	slug: string;
	name: string;
};

export type ReadingLifeFinishedBook = {
	id: number;
	bookId?: number;
	workId?: number | null;
	canonicalWorkKey?: string;
	title: string;
	author: string;
	authorId?: number | null;
	coverUrl?: string;
	pageCount?: number;
	publishedYear?: number | null;
	finishedDate?: string;
	updatedAt?: string;
	rating?: number | null;
	genres?: ReadingLifeGenre[];
	seriesId?: number | null;
	seriesName?: string;
};

export type ReadingLifeCurrentBook = {
	id: number;
	title: string;
	author: string;
	coverUrl?: string;
	currentPage?: number;
	totalPages?: number;
	updatedAt?: string;
};

export type ReadingLifeProgressEvent = {
	bookId?: number;
	date: string;
	pageDelta: number;
};

export type ReadingLifeTimelineFilters = {
	year?: string | number;
	month?: string | number;
	query?: string;
};

export type ReadingLifeTimelineItem = ReadingLifeFinishedBook & {
	dateKey: string;
	year: number;
	month: number;
};

export type ReadingLifeCalendarDay = {
	date: string;
	pages: number;
	completions: number;
	level: number;
};

export type ReadingLifeRankedItem = {
	label: string;
	books: number;
	pages: number;
	averageRating: number;
	firstFinishedDate?: string;
	lastFinishedDate?: string;
};

export type ReadingLifeOverview = {
	booksCompletedThisYear: number;
	pagesReadThisYear: number;
	readingStreakDays: number;
	goalProgress: ReadingGoalProgress;
	averageRating: number;
	averagePagesPerDay: number;
	averageBookLength: number;
	readingPaceLabel: string;
	currentBooks: number;
	favoriteGenre: string;
	favoriteAuthor: string;
	newestAuthorDiscovered: string;
};

export type ReadingLifeFunStats = {
	longestBook: ReadingLifeFinishedBook | null;
	shortestBook: ReadingLifeFinishedBook | null;
	oldestPublication: ReadingLifeFinishedBook | null;
	newestPublication: ReadingLifeFinishedBook | null;
	highestRated: ReadingLifeFinishedBook | null;
	lowestRated: ReadingLifeFinishedBook | null;
	mostRereadLabel: string;
	mostCommonDecade: string;
	averagePublicationYear: number;
};

export type ReadingLifeYearSummary = {
	year: number;
	books: number;
	pages: number;
	genres: number;
	authors: number;
	series: number;
	averageRating: number;
	topGenre: string;
};

export type ReadingLifeSummary = {
	overview: ReadingLifeOverview;
	timeline: ReadingLifeTimelineItem[];
	calendarDays: ReadingLifeCalendarDay[];
	genreInsights: ReadingLifeRankedItem[];
	genreTrend: Array<{ year: number; label: string; books: number }>;
	authorInsights: {
		favorites: ReadingLifeRankedItem[];
		mostRead: ReadingLifeRankedItem[];
		highestRated: ReadingLifeRankedItem[];
		newAuthors: ReadingLifeRankedItem[];
	};
	funStats: ReadingLifeFunStats;
	yearSummaries: ReadingLifeYearSummary[];
	availableYears: number[];
};

const MS_PER_DAY = 86400000;

function cleanText(value: unknown, fallback = "") {
	const text = String(value || "").trim();
	return text || fallback;
}

function toNumber(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function clampRating(value: unknown) {
	const rating = toNumber(value);
	return rating >= 1 && rating <= 5 ? rating : 0;
}

export function dateKey(value: unknown) {
	const text = cleanText(value);
	if (!text) return "";
	const date = new Date(text);
	if (!Number.isFinite(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
}

function dateFromKey(key: string) {
	const date = new Date(`${key}T00:00:00Z`);
	return Number.isFinite(date.getTime()) ? date : null;
}

function getFinishedDate(book: ReadingLifeFinishedBook) {
	return dateKey(book.finishedDate);
}

function dayOfYear(date: Date) {
	const start = Date.UTC(date.getUTCFullYear(), 0, 1);
	const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	return Math.max(1, Math.floor((current - start) / MS_PER_DAY) + 1);
}

function daysInYear(year: number) {
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	return Math.round((end - start) / MS_PER_DAY);
}

function average(values: number[]) {
	const safeValues = values.filter((value) => Number.isFinite(value) && value > 0);
	if (safeValues.length === 0) return 0;
	return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function rounded(value: number, places = 1) {
	const scale = 10 ** places;
	return Math.round(value * scale) / scale;
}

function formatBooksPerMonth(count: number, now: Date) {
	const monthFraction = (now.getUTCMonth() + (dayOfYear(now) / daysInYear(now.getUTCFullYear()))) || 1;
	const pace = count / Math.max(1, monthFraction);
	if (count <= 0) return "No finished books yet this year";
	if (pace < 1) return `${rounded(pace, 1)} books per month`;
	return `${rounded(pace, 1)} books per month`;
}

function createTimelineItem(book: ReadingLifeFinishedBook): ReadingLifeTimelineItem | null {
	const key = getFinishedDate(book);
	const date = dateFromKey(key);
	if (!date) return null;
	return {
		...book,
		dateKey: key,
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1
	};
}

export function buildReadingTimeline(books: ReadingLifeFinishedBook[]) {
	return books
		.map(createTimelineItem)
		.filter((book): book is ReadingLifeTimelineItem => !!book)
		.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.title.localeCompare(b.title));
}

export function filterReadingTimeline(items: ReadingLifeTimelineItem[], filters: ReadingLifeTimelineFilters = {}) {
	const year = Number(filters.year || 0) || 0;
	const month = Number(filters.month || 0) || 0;
	const query = cleanText(filters.query).toLowerCase();
	return items.filter((item) => {
		if (year > 0 && item.year !== year) return false;
		if (month > 0 && item.month !== month) return false;
		if (query) {
			const haystack = `${item.title} ${item.author} ${(item.genres || []).map((genre) => genre.name).join(" ")}`.toLowerCase();
			if (!haystack.includes(query)) return false;
		}
		return true;
	});
}

export function calculateReadingStreak(activityDates: string[], now = new Date()) {
	const keys = new Set(activityDates.map(dateKey).filter(Boolean));
	if (keys.size === 0) return 0;
	const today = dateKey(now);
	let cursor = dateFromKey(today);
	if (!cursor) return 0;
	const yesterday = new Date(cursor.getTime() - MS_PER_DAY);
	if (!keys.has(today) && !keys.has(dateKey(yesterday))) return 0;
	if (!keys.has(today)) cursor = yesterday;
	let streak = 0;
	while (cursor && keys.has(dateKey(cursor))) {
		streak += 1;
		cursor = new Date(cursor.getTime() - MS_PER_DAY);
	}
	return streak;
}

export function buildReadingCalendar(input: {
	finishedBooks: ReadingLifeFinishedBook[];
	progressEvents: ReadingLifeProgressEvent[];
	year: number;
}) {
	const start = Date.UTC(input.year, 0, 1);
	const end = Date.UTC(input.year + 1, 0, 1);
	const map = new Map<string, ReadingLifeCalendarDay>();
	for (let time = start; time < end; time += MS_PER_DAY) {
		const key = new Date(time).toISOString().slice(0, 10);
		map.set(key, { date: key, pages: 0, completions: 0, level: 0 });
	}
	for (const event of input.progressEvents) {
		const key = dateKey(event.date);
		const day = map.get(key);
		if (!day) continue;
		day.pages += Math.max(0, Math.round(toNumber(event.pageDelta)));
	}
	for (const book of input.finishedBooks) {
		const key = getFinishedDate(book);
		const day = map.get(key);
		if (!day) continue;
		day.completions += 1;
		if (day.pages === 0) day.pages += Math.max(0, Math.round(toNumber(book.pageCount)));
	}
	const days = Array.from(map.values());
	const maxPages = Math.max(0, ...days.map((day) => day.pages));
	return days.map((day) => {
		const activity = day.pages + (day.completions * 80);
		const level = activity <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((activity / Math.max(1, maxPages + 80)) * 4)));
		return { ...day, level };
	});
}

type InternalRankedItem = ReadingLifeRankedItem & {
	ratingSum: number;
	ratingCount: number;
};

function addRanked(map: Map<string, InternalRankedItem>, label: string, book: ReadingLifeFinishedBook) {
	const cleanLabel = cleanText(label, "Unknown");
	const existing = map.get(cleanLabel) || {
		label: cleanLabel,
		books: 0,
		pages: 0,
		averageRating: 0,
		firstFinishedDate: "",
		lastFinishedDate: "",
		ratingSum: 0,
		ratingCount: 0
	};
	const date = getFinishedDate(book);
	existing.books += 1;
	existing.pages += Math.max(0, Math.round(toNumber(book.pageCount)));
	const rating = clampRating(book.rating);
	if (rating > 0) {
		existing.ratingSum += rating;
		existing.ratingCount += 1;
		existing.averageRating = existing.ratingSum / existing.ratingCount;
	}
	if (date && (!existing.firstFinishedDate || date < existing.firstFinishedDate)) existing.firstFinishedDate = date;
	if (date && (!existing.lastFinishedDate || date > existing.lastFinishedDate)) existing.lastFinishedDate = date;
	map.set(cleanLabel, existing);
}

function finalizeRanked(map: Map<string, InternalRankedItem>) {
	return Array.from(map.values()).map((item) => ({
		label: item.label,
		books: item.books,
		pages: item.pages,
		firstFinishedDate: item.firstFinishedDate,
		lastFinishedDate: item.lastFinishedDate,
		averageRating: rounded(item.averageRating, 2)
	}));
}

export function buildGenreInsights(books: ReadingLifeFinishedBook[]) {
	const map = new Map<string, InternalRankedItem>();
	for (const book of books) {
		const genres = (book.genres || []).filter((genre) => cleanText(genre.name));
		if (genres.length === 0) addRanked(map, "Uncategorized", book);
		for (const genre of genres) addRanked(map, genre.name, book);
	}
	return finalizeRanked(map).sort((a, b) => b.books - a.books || b.pages - a.pages || a.label.localeCompare(b.label));
}

export function buildAuthorInsights(books: ReadingLifeFinishedBook[]) {
	const map = new Map<string, InternalRankedItem>();
	for (const book of books) addRanked(map, book.author || "Unknown Author", book);
	const rows = finalizeRanked(map);
	return {
		favorites: [...rows].sort((a, b) => b.averageRating - a.averageRating || b.books - a.books || a.label.localeCompare(b.label)),
		mostRead: [...rows].sort((a, b) => b.books - a.books || b.pages - a.pages || a.label.localeCompare(b.label)),
		highestRated: [...rows].filter((row) => row.averageRating > 0).sort((a, b) => b.averageRating - a.averageRating || b.books - a.books || a.label.localeCompare(b.label)),
		newAuthors: [...rows].filter((row) => row.firstFinishedDate).sort((a, b) => String(b.firstFinishedDate || "").localeCompare(String(a.firstFinishedDate || "")) || a.label.localeCompare(b.label))
	};
}

function findBook(books: ReadingLifeFinishedBook[], predicate: (book: ReadingLifeFinishedBook) => boolean, compare: (a: ReadingLifeFinishedBook, b: ReadingLifeFinishedBook) => number) {
	return books.filter(predicate).sort(compare)[0] || null;
}

function decadeLabel(year: number) {
	if (!Number.isFinite(year) || year <= 0) return "Unknown";
	return `${Math.floor(year / 10) * 10}s`;
}

export function buildFunStats(books: ReadingLifeFinishedBook[]): ReadingLifeFunStats {
	const withPages = books.filter((book) => toNumber(book.pageCount) > 0);
	const withYears = books.filter((book) => toNumber(book.publishedYear) > 0);
	const withRatings = books.filter((book) => clampRating(book.rating) > 0);
	const decades = new Map<string, number>();
	for (const book of withYears) {
		const label = decadeLabel(toNumber(book.publishedYear));
		decades.set(label, (decades.get(label) || 0) + 1);
	}
	const mostCommonDecade = Array.from(decades.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "Not enough publication dates";
	return {
		longestBook: findBook(withPages, () => true, (a, b) => toNumber(b.pageCount) - toNumber(a.pageCount) || a.title.localeCompare(b.title)),
		shortestBook: findBook(withPages, () => true, (a, b) => toNumber(a.pageCount) - toNumber(b.pageCount) || a.title.localeCompare(b.title)),
		oldestPublication: findBook(withYears, () => true, (a, b) => toNumber(a.publishedYear) - toNumber(b.publishedYear) || a.title.localeCompare(b.title)),
		newestPublication: findBook(withYears, () => true, (a, b) => toNumber(b.publishedYear) - toNumber(a.publishedYear) || a.title.localeCompare(b.title)),
		highestRated: findBook(withRatings, () => true, (a, b) => clampRating(b.rating) - clampRating(a.rating) || a.title.localeCompare(b.title)),
		lowestRated: findBook(withRatings, () => true, (a, b) => clampRating(a.rating) - clampRating(b.rating) || a.title.localeCompare(b.title)),
		mostRereadLabel: "Rereads are not tracked separately yet",
		mostCommonDecade,
		averagePublicationYear: Math.round(average(withYears.map((book) => toNumber(book.publishedYear))))
	};
}

export function buildYearSummaries(books: ReadingLifeFinishedBook[]) {
	const map = new Map<number, ReadingLifeYearSummary & { ratings: number[]; genreSet: Set<string>; authorSet: Set<string>; seriesSet: Set<number>; genreCounts: Map<string, number> }>();
	for (const book of books) {
		const key = getFinishedDate(book);
		const date = dateFromKey(key);
		if (!date) continue;
		const year = date.getUTCFullYear();
		const existing = map.get(year) || {
			year,
			books: 0,
			pages: 0,
			genres: 0,
			authors: 0,
			series: 0,
			averageRating: 0,
			topGenre: "Uncategorized",
			ratings: [],
			genreSet: new Set<string>(),
			authorSet: new Set<string>(),
			seriesSet: new Set<number>(),
			genreCounts: new Map<string, number>()
		};
		existing.books += 1;
		existing.pages += Math.max(0, Math.round(toNumber(book.pageCount)));
		existing.authorSet.add(cleanText(book.author, "Unknown Author"));
		if (book.seriesId && book.seriesId > 0) existing.seriesSet.add(book.seriesId);
		const rating = clampRating(book.rating);
		if (rating > 0) existing.ratings.push(rating);
		const genres = (book.genres || []).filter((genre) => cleanText(genre.name));
		if (genres.length === 0) {
			existing.genreSet.add("Uncategorized");
			existing.genreCounts.set("Uncategorized", (existing.genreCounts.get("Uncategorized") || 0) + 1);
		}
		for (const genre of genres) {
			existing.genreSet.add(genre.name);
			existing.genreCounts.set(genre.name, (existing.genreCounts.get(genre.name) || 0) + 1);
		}
		map.set(year, existing);
	}
	return Array.from(map.values())
		.map((row) => ({
			year: row.year,
			books: row.books,
			pages: row.pages,
			genres: row.genreSet.size,
			authors: row.authorSet.size,
			series: row.seriesSet.size,
			averageRating: rounded(average(row.ratings), 2),
			topGenre: Array.from(row.genreCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "Uncategorized"
		}))
		.sort((a, b) => b.year - a.year);
}

function buildGenreTrend(timeline: ReadingLifeTimelineItem[]) {
	const rows = new Map<string, { year: number; label: string; books: number }>();
	for (const book of timeline) {
		const genres = (book.genres || []).filter((genre) => cleanText(genre.name));
		const labels = genres.length > 0 ? genres.map((genre) => genre.name) : ["Uncategorized"];
		for (const label of labels) {
			const key = `${book.year}:${label}`;
			const existing = rows.get(key) || { year: book.year, label, books: 0 };
			existing.books += 1;
			rows.set(key, existing);
		}
	}
	return Array.from(rows.values()).sort((a, b) => b.year - a.year || b.books - a.books || a.label.localeCompare(b.label));
}

export function buildReadingLifeSummary(input: {
	finishedBooks: ReadingLifeFinishedBook[];
	currentBooks: ReadingLifeCurrentBook[];
	progressEvents: ReadingLifeProgressEvent[];
	annualGoal?: unknown;
	now?: Date;
}): ReadingLifeSummary {
	const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
	const year = now.getUTCFullYear();
	const finishedBooks = canonicalizeFinishedBooks(input.finishedBooks);
	const timeline = buildReadingTimeline(finishedBooks);
	const thisYearBooks = filterCanonicalFinishedBooksForYear(timeline, year);
	const pagesReadThisYear = thisYearBooks.reduce((sum, book) => sum + Math.max(0, Math.round(toNumber(book.pageCount))), 0);
	const ratings = finishedBooks.map((book) => clampRating(book.rating)).filter((rating) => rating > 0);
	const genreInsights = buildGenreInsights(finishedBooks);
	const thisYearGenreInsights = buildGenreInsights(thisYearBooks);
	const authorInsights = buildAuthorInsights(finishedBooks);
	const thisYearAuthorInsights = buildAuthorInsights(thisYearBooks);
	const activityDates = [
		...input.progressEvents.map((event) => event.date),
		...timeline.map((book) => book.dateKey)
	];
	const overview: ReadingLifeOverview = {
		booksCompletedThisYear: thisYearBooks.length,
		pagesReadThisYear,
		readingStreakDays: calculateReadingStreak(activityDates, now),
		goalProgress: resolveReadingGoalProgress({ goal: input.annualGoal, completed: thisYearBooks.length, now }),
		averageRating: rounded(average(ratings), 2),
		averagePagesPerDay: rounded(pagesReadThisYear / Math.max(1, dayOfYear(now)), 1),
		averageBookLength: Math.round(average(thisYearBooks.map((book) => toNumber(book.pageCount)))),
		readingPaceLabel: formatBooksPerMonth(thisYearBooks.length, now),
		currentBooks: input.currentBooks.length,
		favoriteGenre: thisYearGenreInsights[0]?.label || genreInsights[0]?.label || "Not enough finished books yet",
		favoriteAuthor: thisYearAuthorInsights.mostRead[0]?.label || authorInsights.mostRead[0]?.label || "Not enough finished books yet",
		newestAuthorDiscovered: authorInsights.newAuthors[0]?.label || "Not enough finished books yet"
	};
	return {
		overview,
		timeline,
		calendarDays: buildReadingCalendar({ finishedBooks, progressEvents: input.progressEvents, year }),
		genreInsights,
		genreTrend: buildGenreTrend(timeline),
		authorInsights,
		funStats: buildFunStats(finishedBooks),
		yearSummaries: buildYearSummaries(finishedBooks),
		availableYears: Array.from(new Set(timeline.map((book) => book.year))).sort((a, b) => b - a)
	};
}
