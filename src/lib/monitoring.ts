type MonitorLevel = "info" | "warn" | "error";

export function monitorEvent(event: string, details: Record<string, unknown>, level: MonitorLevel = "info") {
	const payload = {
		event,
		level,
		timestamp: new Date().toISOString(),
		...details
	};
	if (level === "error") {
		console.error("[monitor]", payload);
		return;
	}
	if (level === "warn") {
		console.warn("[monitor]", payload);
		return;
	}
	console.log("[monitor]", payload);
}
