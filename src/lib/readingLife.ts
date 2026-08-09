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
	workId?: number | null;
	title?: string;
	author?: string;
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
	active: boolean;
	pages: number;
	pageEquivalents: number;
	sessions: number;
	progressUpdates: number;
	booksRead: number;
	completions: number;
	finishes: number;
	finishedTitles: string[];
	workBreakdown: ReadingLifeDailyWorkBreakdown[];
	incompleteUpdates: number;
	normalizationState: "none" | "exact" | "derived" | "incomplete" | "mixed";
	level: number;
};

export type ReadingLifeDailyWorkBreakdown = {
	key: string;
	bookId?: number;
	workId?: number | null;
	title: string;
	author?: string;
	pageEquivalents: number;
	progressUpdates: number;
	finishes: number;
	incompleteUpdates: number;
	normalizationState: "exact" | "derived" | "incomplete" | "mixed";
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
	dailyActivityDays: ReadingLifeCalendarDay[];
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

function dateKeyFromTime(time: number) {
	return new Date(time).toISOString().slice(0, 10);
}

function dayRange(startKey: string, endKey: string) {
	const start = dateFromKey(startKey);
	const end = dateFromKey(endKey);
	if (!start || !end || start.getTime() > end.getTime()) return [];
	const days: string[] = [];
	for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
		days.push(dateKeyFromTime(time));
	}
	return days;
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
	return buildDailyReadingActivity({
		finishedBooks: input.finishedBooks,
		progressEvents: input.progressEvents,
		startDate: dateKeyFromTime(Date.UTC(input.year, 0, 1)),
		endDate: dateKeyFromTime(Date.UTC(input.year, 11, 31))
	});
}

function emptyDailyActivityDay(date: string): ReadingLifeCalendarDay {
	return {
		date,
		active: false,
		pages: 0,
		pageEquivalents: 0,
		sessions: 0,
		progressUpdates: 0,
		booksRead: 0,
		completions: 0,
		finishes: 0,
		finishedTitles: [],
		workBreakdown: [],
		incompleteUpdates: 0,
		normalizationState: "none",
		level: 0
	};
}

function workKey(input: { id?: unknown; bookId?: unknown; workId?: unknown; title?: unknown }) {
	const workId = Math.max(0, Math.round(toNumber(input.workId)));
	if (workId > 0) return `work:${workId}`;
	const bookId = Math.max(0, Math.round(toNumber(input.bookId || input.id)));
	if (bookId > 0) return `book:${bookId}`;
	return `title:${cleanText(input.title, "Unknown").toLowerCase()}`;
}

function mergeNormalizationState(
	current: ReadingLifeDailyWorkBreakdown["normalizationState"],
	next: ReadingLifeDailyWorkBreakdown["normalizationState"]
) {
	if (current === next) return current;
	if (current === "incomplete" && next === "incomplete") return "incomplete";
	return "mixed";
}

function addWorkVolume(
	map: Map<string, ReadingLifeDailyWorkBreakdown>,
	input: {
		key: string;
		bookId?: number;
		workId?: number | null;
		title: string;
		author?: string;
		pageEquivalents?: number;
		progressUpdates?: number;
		finishes?: number;
		incompleteUpdates?: number;
		normalizationState: ReadingLifeDailyWorkBreakdown["normalizationState"];
	}
) {
	const existing = map.get(input.key) || {
		key: input.key,
		bookId: input.bookId,
		workId: input.workId,
		title: cleanText(input.title, "Untitled"),
		author: cleanText(input.author),
		pageEquivalents: 0,
		progressUpdates: 0,
		finishes: 0,
		incompleteUpdates: 0,
		normalizationState: input.normalizationState
	};
	existing.bookId = existing.bookId || input.bookId;
	existing.workId = existing.workId || input.workId;
	if (!existing.title || existing.title === "Untitled") existing.title = cleanText(input.title, "Untitled");
	if (!existing.author) existing.author = cleanText(input.author);
	existing.pageEquivalents += Math.max(0, Math.round(toNumber(input.pageEquivalents)));
	existing.progressUpdates += Math.max(0, Math.round(toNumber(input.progressUpdates)));
	existing.finishes += Math.max(0, Math.round(toNumber(input.finishes)));
	existing.incompleteUpdates += Math.max(0, Math.round(toNumber(input.incompleteUpdates)));
	existing.normalizationState = mergeNormalizationState(existing.normalizationState, input.normalizationState);
	map.set(input.key, existing);
	return existing;
}

export function buildDailyReadingActivity(input: {
	finishedBooks: ReadingLifeFinishedBook[];
	progressEvents: ReadingLifeProgressEvent[];
	startDate: string;
	endDate: string;
}) {
	const map = new Map<string, ReadingLifeCalendarDay>();
	const bookIdsByDay = new Map<string, Set<number>>();
	const workRowsByDay = new Map<string, Map<string, ReadingLifeDailyWorkBreakdown>>();
	for (const key of dayRange(dateKey(input.startDate), dateKey(input.endDate))) {
		map.set(key, emptyDailyActivityDay(key));
		bookIdsByDay.set(key, new Set<number>());
		workRowsByDay.set(key, new Map<string, ReadingLifeDailyWorkBreakdown>());
	}
	for (const event of input.progressEvents) {
		const key = dateKey(event.date);
		const day = map.get(key);
		if (!day) continue;
		const pageEquivalents = Math.max(0, Math.round(toNumber(event.pageDelta)));
		day.pageEquivalents += pageEquivalents;
		day.pages = day.pageEquivalents;
		day.sessions += 1;
		day.progressUpdates += 1;
		if (pageEquivalents <= 0) day.incompleteUpdates += 1;
		const bookId = Math.max(0, Math.round(toNumber(event.bookId)));
		if (bookId > 0) bookIdsByDay.get(key)?.add(bookId);
		const keyForWork = workKey(event);
		addWorkVolume(workRowsByDay.get(key) || new Map(), {
			key: keyForWork,
			bookId: bookId || undefined,
			workId: event.workId,
			title: cleanText(event.title, "Untitled"),
			author: event.author,
			pageEquivalents,
			progressUpdates: 1,
			incompleteUpdates: pageEquivalents <= 0 ? 1 : 0,
			normalizationState: pageEquivalents > 0 ? "exact" : "incomplete"
		});
	}
	for (const book of input.finishedBooks) {
		const key = getFinishedDate(book);
		const day = map.get(key);
		if (!day) continue;
		day.completions += 1;
		day.finishes += 1;
		day.finishedTitles.push(cleanText(book.title, "Untitled"));
		const bookId = Math.max(0, Math.round(toNumber(book.bookId || book.id)));
		if (bookId > 0) bookIdsByDay.get(key)?.add(bookId);
		const keyForWork = workKey(book);
		const workRows = workRowsByDay.get(key) || new Map<string, ReadingLifeDailyWorkBreakdown>();
		const existing = workRows.get(keyForWork);
		if (!existing || (existing.pageEquivalents <= 0 && existing.progressUpdates <= 0)) {
			const derivedPages = Math.max(0, Math.round(toNumber(book.pageCount)));
			if (derivedPages > 0) {
				day.pageEquivalents += derivedPages;
				day.pages = day.pageEquivalents;
				addWorkVolume(workRows, {
					key: keyForWork,
					bookId: bookId || undefined,
					workId: book.workId,
					title: book.title,
					author: book.author,
					pageEquivalents: derivedPages,
					finishes: 1,
					normalizationState: "derived"
				});
			} else {
				day.incompleteUpdates += 1;
				addWorkVolume(workRows, {
					key: keyForWork,
					bookId: bookId || undefined,
					workId: book.workId,
					title: book.title,
					author: book.author,
					finishes: 1,
					incompleteUpdates: 1,
					normalizationState: "incomplete"
				});
			}
		} else {
			existing.finishes += 1;
			existing.normalizationState = mergeNormalizationState(existing.normalizationState, "exact");
		}
	}
	const days = Array.from(map.values());
	const maxPages = Math.max(0, ...days.map((day) => day.pageEquivalents));
	return days.map((day) => {
		const workBreakdown = Array.from(workRowsByDay.get(day.date)?.values() || [])
			.map((row) => ({
				...row,
				pageEquivalents: Math.max(0, Math.round(row.pageEquivalents))
			}))
			.sort((a, b) => b.pageEquivalents - a.pageEquivalents || b.progressUpdates - a.progressUpdates || a.title.localeCompare(b.title));
		const hasExact = workBreakdown.some((row) => row.normalizationState === "exact" || row.normalizationState === "mixed");
		const hasDerived = workBreakdown.some((row) => row.normalizationState === "derived" || row.normalizationState === "mixed");
		const hasIncomplete = day.incompleteUpdates > 0 || workBreakdown.some((row) => row.normalizationState === "incomplete");
		const normalizationState = hasIncomplete && day.pageEquivalents <= 0
			? "incomplete"
			: [hasExact, hasDerived, hasIncomplete].filter(Boolean).length > 1
				? "mixed"
				: hasExact
					? "exact"
					: hasDerived
						? "derived"
						: hasIncomplete
							? "incomplete"
							: "none";
		const active = day.pageEquivalents > 0 || day.sessions > 0 || day.completions > 0 || day.incompleteUpdates > 0;
		const level = day.pageEquivalents <= 0
			? (active ? 1 : 0)
			: Math.max(1, Math.min(4, Math.ceil((day.pageEquivalents / Math.max(1, maxPages)) * 4)));
		const bookCount = bookIdsByDay.get(day.date)?.size || 0;
		return {
			...day,
			active,
			pages: day.pageEquivalents,
			booksRead: bookCount,
			finishedTitles: [...day.finishedTitles].sort((a, b) => a.localeCompare(b)),
			workBreakdown,
			normalizationState,
			level
		};
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
	const todayKey = dateKey(now);
	const rollingStart = dateKeyFromTime((dateFromKey(todayKey)?.getTime() || now.getTime()) - (364 * MS_PER_DAY));
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
		dailyActivityDays: buildDailyReadingActivity({ finishedBooks, progressEvents: input.progressEvents, startDate: rollingStart, endDate: todayKey }),
		genreInsights,
		genreTrend: buildGenreTrend(timeline),
		authorInsights,
		funStats: buildFunStats(finishedBooks),
		yearSummaries: buildYearSummaries(finishedBooks),
		availableYears: Array.from(new Set(timeline.map((book) => book.year))).sort((a, b) => b - a)
	};
}
