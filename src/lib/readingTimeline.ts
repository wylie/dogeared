import { dateKey, type ReadingLifeFinishedBook, type ReadingLifeGenre, type ReadingLifeProgressEvent } from "./readingLife.ts";
import { resolveReadingGoalProgress } from "./readingGoal.ts";

export type ReadingTimelineBook = ReadingLifeFinishedBook & {
	status?: string;
	shelfLabel?: string;
	customShelves?: string[];
	dateKey: string;
	year: number;
	month: number;
};

export type ReadingTimelineFilters = {
	year?: unknown;
	genre?: unknown;
	shelf?: unknown;
	rating?: unknown;
	author?: unknown;
	query?: unknown;
};

export type ReadingTimelineMonthGroup = {
	year: number;
	month: number;
	monthName: string;
	books: ReadingTimelineBook[];
	summary: ReadingTimelineMonthSummary;
};

export type ReadingTimelineYearGroup = {
	year: number;
	books: number;
	pages: number;
	months: ReadingTimelineMonthGroup[];
};

export type ReadingTimelineMonthSummary = {
	booksFinished: number;
	pagesRead: number;
	favoriteGenre: string;
	averageRating: number;
	readingStreakDays: number;
};

export type ReadingTimelineMilestone = {
	type: "first_finished" | "hundredth_book" | "longest_book" | "shortest_book" | "biggest_month" | "longest_streak" | "goal_completion";
	title: string;
	description: string;
	dateLabel?: string;
	bookId?: number;
	bookTitle?: string;
};

const MS_PER_DAY = 86400000;

function clean(value: unknown) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function ratingValue(value: unknown) {
	const rating = numberValue(value);
	return rating >= 1 && rating <= 5 ? Math.round(rating) : 0;
}

function parseDateKey(value: unknown) {
	return dateKey(value);
}

function dateFromKey(key: string) {
	const date = new Date(`${key}T00:00:00Z`);
	return Number.isFinite(date.getTime()) ? date : null;
}

function monthName(month: number) {
	return new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 1)));
}

export function formatTimelineDate(value: string) {
	const date = dateFromKey(value);
	if (!date) return "";
	return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function buildReadingTimelineBooks(books: ReadingLifeFinishedBook[]) {
	return books
		.map((book) => {
			const key = parseDateKey(book.finishedDate || book.updatedAt);
			const date = dateFromKey(key);
			if (!date) return null;
			const shelfLabel = clean((book as ReadingTimelineBook).shelfLabel) || "Read";
			const customShelves = Array.isArray((book as ReadingTimelineBook).customShelves)
				? ((book as ReadingTimelineBook).customShelves || []).map(clean).filter(Boolean)
				: [];
			return {
				...book,
				status: clean((book as ReadingTimelineBook).status) || "finished",
				shelfLabel,
				customShelves,
				dateKey: key,
				year: date.getUTCFullYear(),
				month: date.getUTCMonth() + 1
			} satisfies ReadingTimelineBook;
		})
		.filter((book): book is ReadingTimelineBook => !!book)
		.sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.title.localeCompare(b.title));
}

function genreNames(book: ReadingTimelineBook) {
	return (book.genres || []).map((genre: ReadingLifeGenre) => clean(genre.name)).filter(Boolean);
}

function shelfNames(book: ReadingTimelineBook) {
	return [book.shelfLabel || "Read", ...(book.customShelves || [])].map(clean).filter(Boolean);
}

export function filterReadingTimelineBooks(books: ReadingTimelineBook[], filters: ReadingTimelineFilters = {}) {
	const year = Number(filters.year || 0) || 0;
	const genre = clean(filters.genre).toLowerCase();
	const shelf = clean(filters.shelf).toLowerCase();
	const rating = Number(filters.rating || 0) || 0;
	const author = clean(filters.author).toLowerCase();
	const query = clean(filters.query).toLowerCase();
	return books.filter((book) => {
		if (year > 0 && book.year !== year) return false;
		if (genre && !genreNames(book).some((name) => name.toLowerCase() === genre)) return false;
		if (shelf && !shelfNames(book).some((name) => name.toLowerCase() === shelf)) return false;
		if (rating > 0 && ratingValue(book.rating) !== rating) return false;
		if (author && clean(book.author).toLowerCase() !== author) return false;
		if (query) {
			const haystack = [
				book.title,
				book.author,
				book.seriesName,
				...genreNames(book),
				...shelfNames(book)
			].join(" ").toLowerCase();
			if (!haystack.includes(query)) return false;
		}
		return true;
	});
}

function dateRangeForMonth(year: number, month: number) {
	const start = Date.UTC(year, month - 1, 1);
	const end = Date.UTC(year, month, 1);
	return { start, end };
}

function longestDateStreak(keys: string[]) {
	const normalized = Array.from(new Set(keys.map(parseDateKey).filter(Boolean))).sort();
	if (normalized.length === 0) return 0;
	let longest = 1;
	let current = 1;
	for (let index = 1; index < normalized.length; index += 1) {
		const previous = dateFromKey(normalized[index - 1]);
		const next = dateFromKey(normalized[index]);
		if (previous && next && next.getTime() - previous.getTime() === MS_PER_DAY) current += 1;
		else current = 1;
		if (current > longest) longest = current;
	}
	return longest;
}

function activityKeysForMonth(progressEvents: ReadingLifeProgressEvent[], books: ReadingTimelineBook[], year: number, month: number) {
	const { start, end } = dateRangeForMonth(year, month);
	const keys = [
		...books.map((book) => book.dateKey),
		...progressEvents.map((event) => parseDateKey(event.date))
	];
	return keys.filter((key) => {
		const date = dateFromKey(key);
		const time = date?.getTime() || 0;
		return time >= start && time < end;
	});
}

function favoriteGenre(books: ReadingTimelineBook[]) {
	const counts = new Map<string, number>();
	for (const book of books) {
		const names = genreNames(book);
		if (names.length === 0) counts.set("Uncategorized", (counts.get("Uncategorized") || 0) + 1);
		for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
	}
	return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "Not enough genre data";
}

export function summarizeTimelineMonth(books: ReadingTimelineBook[], progressEvents: ReadingLifeProgressEvent[] = [], year?: number, month?: number): ReadingTimelineMonthSummary {
	const ratings = books.map((book) => ratingValue(book.rating)).filter((rating) => rating > 0);
	const pagesRead = books.reduce((sum, book) => sum + Math.max(0, Math.round(numberValue(book.pageCount))), 0);
	const activityKeys = year && month ? activityKeysForMonth(progressEvents, books, year, month) : books.map((book) => book.dateKey);
	return {
		booksFinished: books.length,
		pagesRead,
		favoriteGenre: favoriteGenre(books),
		averageRating: ratings.length > 0 ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 100) / 100 : 0,
		readingStreakDays: longestDateStreak(activityKeys)
	};
}

export function groupReadingTimelineByYearMonth(books: ReadingTimelineBook[], progressEvents: ReadingLifeProgressEvent[] = []) {
	const yearMap = new Map<number, Map<number, ReadingTimelineBook[]>>();
	for (const book of books) {
		const monthMap = yearMap.get(book.year) || new Map<number, ReadingTimelineBook[]>();
		const list = monthMap.get(book.month) || [];
		list.push(book);
		monthMap.set(book.month, list);
		yearMap.set(book.year, monthMap);
	}
	return Array.from(yearMap.entries())
		.sort((a, b) => b[0] - a[0])
		.map(([year, monthMap]) => {
			const months = Array.from(monthMap.entries())
				.sort((a, b) => b[0] - a[0])
				.map(([month, monthBooks]) => {
					const orderedBooks = [...monthBooks].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title));
					return {
						year,
						month,
						monthName: monthName(month),
						books: orderedBooks,
						summary: summarizeTimelineMonth(orderedBooks, progressEvents, year, month)
					};
				});
			return {
				year,
				books: months.reduce((sum, item) => sum + item.summary.booksFinished, 0),
				pages: months.reduce((sum, item) => sum + item.summary.pagesRead, 0),
				months
			};
		});
}

export function readingTimelineFilterOptions(books: ReadingTimelineBook[]) {
	const years = Array.from(new Set(books.map((book) => book.year))).sort((a, b) => b - a);
	const genres = Array.from(new Set(books.flatMap(genreNames))).sort((a, b) => a.localeCompare(b));
	const shelves = Array.from(new Set(books.flatMap(shelfNames))).sort((a, b) => a.localeCompare(b));
	const authors = Array.from(new Set(books.map((book) => clean(book.author)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
	const ratings = Array.from(new Set(books.map((book) => ratingValue(book.rating)).filter((rating) => rating > 0))).sort((a, b) => b - a);
	return { years, genres, shelves, authors, ratings };
}

function biggestMonthMilestone(groups: ReadingTimelineYearGroup[]) {
	const month = groups.flatMap((group) => group.months)
		.sort((a, b) => b.summary.booksFinished - a.summary.booksFinished || b.summary.pagesRead - a.summary.pagesRead || b.year - a.year || b.month - a.month)[0];
	if (!month || month.summary.booksFinished <= 0) return null;
	return {
		type: "biggest_month" as const,
		title: "Biggest reading month",
		description: `${month.monthName} ${month.year}: ${month.summary.booksFinished.toLocaleString()} finished ${month.summary.booksFinished === 1 ? "book" : "books"}.`,
		dateLabel: `${month.monthName} ${month.year}`
	};
}

export function buildReadingTimelineMilestones(input: {
	books: ReadingTimelineBook[];
	progressEvents?: ReadingLifeProgressEvent[];
	annualGoal?: unknown;
}) {
	const booksAsc = [...input.books].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.title.localeCompare(b.title));
	const withPages = input.books.filter((book) => numberValue(book.pageCount) > 0);
	const groups = groupReadingTimelineByYearMonth(input.books, input.progressEvents || []);
	const milestones: ReadingTimelineMilestone[] = [];
	const first = booksAsc[0];
	if (first) {
		milestones.push({
			type: "first_finished",
			title: "First book finished",
			description: first.title,
			dateLabel: formatTimelineDate(first.dateKey),
			bookId: first.id,
			bookTitle: first.title
		});
	}
	const hundredth = booksAsc[99];
	if (hundredth) {
		milestones.push({
			type: "hundredth_book",
			title: "100th book",
			description: hundredth.title,
			dateLabel: formatTimelineDate(hundredth.dateKey),
			bookId: hundredth.id,
			bookTitle: hundredth.title
		});
	}
	const longest = [...withPages].sort((a, b) => numberValue(b.pageCount) - numberValue(a.pageCount) || a.title.localeCompare(b.title))[0];
	if (longest) {
		milestones.push({
			type: "longest_book",
			title: "Longest book",
			description: `${longest.title} · ${numberValue(longest.pageCount).toLocaleString()} pages`,
			bookId: longest.id,
			bookTitle: longest.title
		});
	}
	const shortest = [...withPages].sort((a, b) => numberValue(a.pageCount) - numberValue(b.pageCount) || a.title.localeCompare(b.title))[0];
	if (shortest) {
		milestones.push({
			type: "shortest_book",
			title: "Shortest book",
			description: `${shortest.title} · ${numberValue(shortest.pageCount).toLocaleString()} pages`,
			bookId: shortest.id,
			bookTitle: shortest.title
		});
	}
	const biggest = biggestMonthMilestone(groups);
	if (biggest) milestones.push(biggest);
	const allActivityKeys = [
		...input.books.map((book) => book.dateKey),
		...(input.progressEvents || []).map((event) => event.date)
	];
	const longestStreak = longestDateStreak(allActivityKeys);
	if (longestStreak > 0) {
		milestones.push({
			type: "longest_streak",
			title: "Longest reading streak",
			description: `${longestStreak.toLocaleString()} ${longestStreak === 1 ? "day" : "days"} with recorded reading activity.`
		});
	}
	const goal = resolveReadingGoalProgress({ goal: input.annualGoal, completed: 0 }).goal;
	if (goal > 0) {
		const byYear = new Map<number, ReadingTimelineBook[]>();
		for (const book of booksAsc) {
			const list = byYear.get(book.year) || [];
			list.push(book);
			byYear.set(book.year, list);
		}
		const completion = Array.from(byYear.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([year, list]) => ({ year, book: list.sort((a, b) => a.dateKey.localeCompare(b.dateKey))[goal - 1] }))
			.find((item) => !!item.book);
		if (completion.book) {
			milestones.push({
				type: "goal_completion",
				title: "Reading goal reached",
				description: `${completion.year} goal reached with ${completion.book.title}.`,
				dateLabel: formatTimelineDate(completion.book.dateKey),
				bookId: completion.book.id,
				bookTitle: completion.book.title
			});
		}
	}
	return milestones;
}
