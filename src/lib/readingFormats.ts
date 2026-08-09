export const READING_FORMATS = ["physical", "ebook", "audio"] as const;
export const READING_FORMAT_VALUES = ["unknown", ...READING_FORMATS] as const;

export type ReadingFormat = typeof READING_FORMAT_VALUES[number];
export type KnownReadingFormat = typeof READING_FORMATS[number];

const FORMAT_LABELS: Record<ReadingFormat, string> = {
	unknown: "Unknown",
	physical: "Physical book",
	ebook: "Ebook",
	audio: "Audiobook"
};

const FORMAT_ICONS: Record<KnownReadingFormat, string> = {
	physical: "menu_book",
	ebook: "tablet_mac",
	audio: "headphones"
};

export function normalizeReadingFormat(value: unknown): ReadingFormat {
	const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (normalized === "physical" || normalized === "print" || normalized === "paper" || normalized === "paperback" || normalized === "hardcover" || normalized === "physical_book") return "physical";
	if (normalized === "ebook" || normalized === "e_book" || normalized === "digital" || normalized === "kindle" || normalized === "ereader" || normalized === "e_reader") return "ebook";
	if (normalized === "audio" || normalized === "audiobook" || normalized === "audio_book" || normalized === "listened") return "audio";
	return "unknown";
}

export function isKnownReadingFormat(value: unknown): value is KnownReadingFormat {
	const format = normalizeReadingFormat(value);
	return format === "physical" || format === "ebook" || format === "audio";
}

export function readingFormatLabel(value: unknown) {
	return FORMAT_LABELS[normalizeReadingFormat(value)];
}

export function readingFormatIcon(value: unknown) {
	const format = normalizeReadingFormat(value);
	return format === "unknown" ? "" : FORMAT_ICONS[format];
}

export function readingFormatOptions(includeUnknown = true) {
	const values = includeUnknown ? READING_FORMAT_VALUES : READING_FORMATS;
	return values.map((value) => ({
		value,
		label: readingFormatLabel(value),
		icon: readingFormatIcon(value)
	}));
}
