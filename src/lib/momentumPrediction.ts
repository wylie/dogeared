export type PredictionTone = "good" | "neutral";

export type MomentumPrediction = {
	eligible: boolean;
	confidence: number;
	finishProbability: number;
	label: string;
	tone: PredictionTone;
	message: string;
};

type PredictionInput = {
	currentPage: number;
	totalPages: number;
	daysSinceUpdate: number;
	daysSinceStart: number;
	progressUpdateCount: number;
};

export const MOMENTUM_THRESHOLDS = {
	minPagesRead: 20,
	minPercentRead: 10,
	minProgressUpdates: 2,
	minElapsedDays: 2,
	minConfidence: 0.5,
	highConfidence: 0.72
} as const;

function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

export function daysSinceDate(value: string) {
	const parsed = new Date(String(value || "").trim());
	if (!Number.isFinite(parsed.getTime())) return 999;
	const now = new Date();
	const delta = now.getTime() - parsed.getTime();
	return Math.max(0, Math.floor(delta / (1000 * 60 * 60 * 24)));
}

function readingHealthFromDays(daysSinceUpdate: number) {
	if (daysSinceUpdate <= 1) return { label: "Strong momentum", tone: "good" as const, recencyScore: 1 };
	if (daysSinceUpdate <= 5) return { label: "Reading steadily", tone: "good" as const, recencyScore: 0.76 };
	return { label: "Reading momentum slowing", tone: "neutral" as const, recencyScore: 0.42 };
}

function resolveConfidence(input: PredictionInput) {
	const currentPage = Math.max(0, Number(input.currentPage || 0) || 0);
	const totalPages = Math.max(0, Number(input.totalPages || 0) || 0);
	const percent = totalPages > 0 ? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100))) : 0;
	const updates = Math.max(0, Number(input.progressUpdateCount || 0) || 0);
	const elapsedDays = Math.max(0, Number(input.daysSinceStart || 0) || 0);
	const recencyDays = Math.max(0, Number(input.daysSinceUpdate || 0) || 0);
	const progressSignal = clamp01(Math.max(currentPage / 120, percent / 35));
	const updateSignal = clamp01((updates - 1) / 3);
	const timeSignal = clamp01(elapsedDays / 10);
	const recencySignal = clamp01(1 - (recencyDays / 14));
	return clamp01((progressSignal * 0.34) + (updateSignal * 0.3) + (timeSignal * 0.2) + (recencySignal * 0.16));
}

export function resolveMomentumPrediction(input: PredictionInput): MomentumPrediction {
	const currentPage = Math.max(0, Number(input.currentPage || 0) || 0);
	const totalPages = Math.max(0, Number(input.totalPages || 0) || 0);
	const percent = totalPages > 0 ? Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100))) : 0;
	const daysSinceUpdate = Math.max(0, Number(input.daysSinceUpdate || 0) || 0);
	const updates = Math.max(0, Number(input.progressUpdateCount || 0) || 0);
	const elapsedDays = Math.max(0, Number(input.daysSinceStart || 0) || 0);
	const confidence = resolveConfidence(input);
	const veryEarly = elapsedDays <= 2 && updates <= 1 && percent < 12;
	const hasMinimumData = (
		currentPage >= MOMENTUM_THRESHOLDS.minPagesRead
		&& percent >= MOMENTUM_THRESHOLDS.minPercentRead
		&& (updates >= MOMENTUM_THRESHOLDS.minProgressUpdates || (elapsedDays >= 7 && currentPage >= 60))
		&& elapsedDays >= MOMENTUM_THRESHOLDS.minElapsedDays
	);
	if (!hasMinimumData || confidence < MOMENTUM_THRESHOLDS.minConfidence) {
		return {
			eligible: false,
			confidence,
			finishProbability: 0,
			label: veryEarly ? "Recently started" : "Building reading history",
			tone: "neutral",
			message: ""
		};
	}
	const health = readingHealthFromDays(daysSinceUpdate);
	const finishProbability = Math.max(
		20,
		Math.min(97, Math.round((percent * 0.62) + (health.recencyScore * 38)))
	);
	return {
		eligible: true,
		confidence,
		finishProbability,
		label: health.label,
		tone: health.tone,
		message: finishProbability >= 82 && confidence >= MOMENTUM_THRESHOLDS.highConfidence
			? `Likely to finish soon (${finishProbability}%).`
			: (finishProbability >= 60 ? "Likely to finish soon." : "Keep going.")
	};
}
