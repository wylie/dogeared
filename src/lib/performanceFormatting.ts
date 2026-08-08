import { safeText } from "./adminFormatting";

export function formatPerformanceMs(value: unknown) {
	const ms = Number(value || 0);
	if (!Number.isFinite(ms) || ms <= 0) return "—";
	if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2).replace(/\.0$/, "")} s`;
	return `${Math.round(ms).toLocaleString()} ms`;
}

export function formatPerformanceTrend(value: unknown) {
	const trend = Number(value || 0);
	if (!Number.isFinite(trend) || trend === 0) return "No comparison";
	return `${trend > 0 ? "↓" : "↑"} ${Math.abs(trend).toFixed(1).replace(/\.0$/, "")}% ${trend > 0 ? "faster" : "slower"}`;
}

export function performanceTrendClass(value: unknown) {
	const trend = Number(value || 0);
	if (trend > 0) return "trend-good";
	if (trend < 0) return "trend-bad";
	return "trend-flat";
}

export function performanceStatusClass(value: unknown) {
	return String(value || "").toLowerCase().replace(/\s+/g, "-");
}

export function performanceProviderLabel(value: unknown) {
	return safeText(value).replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
