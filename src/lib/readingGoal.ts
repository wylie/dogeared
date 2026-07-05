export type ReadingGoalPaceTone = "ahead" | "on" | "behind" | "none";

export type ReadingGoalProgress = {
	goal: number;
	completed: number;
	percent: number;
	barPercent: number;
	remaining: number;
	beyond: number;
	paceTone: ReadingGoalPaceTone;
	paceDelta: number;
	paceLabel: string;
	detailLabel: string;
};

export type ReadingGoalFinishedBook = {
	finishedDate?: unknown;
};

export function parseAnnualReadingGoal(value: unknown) {
	const text = String(value || "").replace(/,/g, "").trim();
	if (!text) return 0;
	const parsed = Number.parseInt(text, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return Math.min(10000, parsed);
}

export function readingGoalYear(now = new Date()) {
	return now.getUTCFullYear();
}

export function isCompletedInReadingGoalYear(book: ReadingGoalFinishedBook, now = new Date()) {
	const year = readingGoalYear(now);
	const parsed = new Date(String(book.finishedDate || "").trim());
	return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() === year;
}

export function filterBooksCompletedForReadingGoal<T extends ReadingGoalFinishedBook>(books: T[], now = new Date()) {
	return books.filter((book) => isCompletedInReadingGoalYear(book, now));
}

function daysInYear(year: number) {
	const start = Date.UTC(year, 0, 1);
	const end = Date.UTC(year + 1, 0, 1);
	return Math.round((end - start) / 86400000);
}

function dayOfYear(date: Date) {
	const year = date.getUTCFullYear();
	const start = Date.UTC(year, 0, 1);
	const current = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
	return Math.max(1, Math.round((current - start) / 86400000) + 1);
}

function pluralizeBooks(count: number) {
	return `${count.toLocaleString()} ${count === 1 ? "book" : "books"}`;
}

export function resolveReadingGoalProgress(input: {
	goal: unknown;
	completed: unknown;
	now?: Date;
}): ReadingGoalProgress {
	const goal = parseAnnualReadingGoal(input.goal);
	const completed = Math.max(0, Math.floor(Number(input.completed || 0) || 0));
	if (goal <= 0) {
		return {
			goal: 0,
			completed,
			percent: 0,
			barPercent: 0,
			remaining: 0,
			beyond: 0,
			paceTone: "none",
			paceDelta: 0,
			paceLabel: "Set an annual goal to track your pace.",
			detailLabel: completed > 0
				? `${pluralizeBooks(completed)} finished this year`
				: "No books completed this year yet"
		};
	}

	const percent = Math.floor((completed / goal) * 100);
	const barPercent = Math.max(0, Math.min(100, percent));
	const remaining = Math.max(0, goal - completed);
	const beyond = Math.max(0, completed - goal);
	const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
	const expected = goal * (dayOfYear(now) / daysInYear(now.getUTCFullYear()));
	const paceDelta = Math.round(completed - expected);
	const paceTone: ReadingGoalPaceTone = paceDelta > 0 ? "ahead" : (paceDelta < 0 ? "behind" : "on");
	const paceLabel = paceTone === "ahead"
		? `${pluralizeBooks(paceDelta)} ahead of pace`
		: (paceTone === "behind" ? `${pluralizeBooks(Math.abs(paceDelta))} behind pace` : "On pace for your goal");
	const detailLabel = beyond > 0
		? `Goal achieved! ${pluralizeBooks(beyond)} beyond your goal`
		: `${pluralizeBooks(remaining)} remaining`;

	return {
		goal,
		completed,
		percent,
		barPercent,
		remaining,
		beyond,
		paceTone,
		paceDelta,
		paceLabel,
		detailLabel
	};
}
